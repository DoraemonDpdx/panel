<?php

declare(strict_types=1);

namespace Pterodactyl\Services\Servers\Software;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Pterodactyl\Contracts\Servers\ReinstallsServers;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Facades\Daemon;
use Pterodactyl\Models\InstallOperation;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\ServerVariable;
use Pterodactyl\Models\User;
use Throwable;

/**
 * Writes an install plan into a server and runs the install script through the existing reinstall.
 *
 * The plan goes to `/.astrelyse/plan.json`, its sha256 is stored in the server's ASTRELYSE_PLAN_SHA256
 * variable (which users cannot edit), and the panel's normal reinstall action does the rest.
 */
final readonly class InstallPlanRunner
{
    public const string PLAN_PATH = '/.astrelyse/plan.json';

    public const string HASH_VARIABLE = 'ASTRELYSE_PLAN_SHA256';

    public function __construct(private ReinstallsServers $reinstalls) {}

    /** Whether the server's egg carries the plan hash variable, that is, runs the Astrelyse install script. */
    public function supports(Server $server): bool
    {
        return $server->egg?->variables()->where('env_variable', self::HASH_VARIABLE)->exists() ?? false;
    }

    /**
     * @param  string  $kind  what the operation is called in the UI and the activity log: install, reinstall, clear, modpack, world, mods
     * @param  array<string, mixed>  $summary  shown to the user; scalar entries are also logged
     *
     * @throws DisplayException when the server is not on the Astrelyse egg, is already installing, or Wings rejects the plan
     */
    public function run(Server $server, InstallPlan $plan, string $kind, array $summary, ?User $by = null): InstallOperation
    {
        $variable = $server->egg?->variables()->where('env_variable', self::HASH_VARIABLE)->first();
        throw_if($variable === null, DisplayException::class, 'This server is not on the Astrelyse Minecraft egg. Convert it first.');

        throw_if(
            $server->status === Server::STATUS_INSTALLING
            || InstallOperation::query()->where('server_id', $server->id)->whereIn('status', [InstallOperation::PENDING, InstallOperation::RUNNING])->exists(),
            DisplayException::class,
            'An install is already running on this server.',
        );

        $sha = $plan->sha256();

        $operation = InstallOperation::query()->create([
            'server_id' => $server->id,
            'user_id' => $by?->id,
            'kind' => $kind,
            'status' => InstallOperation::PENDING,
            'summary' => $summary,
            'plan_sha256' => $sha,
        ]);

        try {
            // The hash is stored before the plan is written so a plan on disk never exists without its hash.
            ServerVariable::query()->updateOrCreate(
                ['server_id' => $server->id, 'variable_id' => $variable->id],
                ['variable_value' => $sha],
            );
            Daemon::server($server)->files()->putContent(self::PLAN_PATH, $plan->toJson());

            DB::transaction(function () use ($server, $operation): void {
                $this->reinstalls->reinstall($server);
                $operation->forceFill(['status' => InstallOperation::RUNNING, 'started_at' => CarbonImmutable::now()])->save();
            });
        } catch (Throwable $exception) {
            $operation->forceFill([
                'status' => InstallOperation::FAILED,
                'error' => $exception instanceof DisplayException ? $exception->getMessage() : 'The install could not be started.',
                'finished_at' => CarbonImmutable::now(),
            ])->save();

            throw $exception instanceof DisplayException ? $exception : new DisplayException('The install could not be started: the node did not accept the install plan.', $exception);
        }

        Activity::event("server:software.$kind")
            ->subject($server)
            ->property(['operation' => $operation->id, ...array_filter($summary, is_scalar(...))])
            ->log();

        return $operation;
    }

    /** Closes the newest unfinished operation of the server when Wings reports its install result. */
    public function close(Server $server, bool $successful): ?InstallOperation
    {
        $operation = InstallOperation::query()
            ->where('server_id', $server->id)
            ->whereIn('status', [InstallOperation::PENDING, InstallOperation::RUNNING])
            ->latest('id')
            ->first();

        // The plan has been used or abandoned, so a later stock reinstall must not trust what is left of it.
        $variableId = $server->egg?->variables()->where('env_variable', self::HASH_VARIABLE)->value('id');
        if ($variableId !== null) {
            ServerVariable::query()->where('server_id', $server->id)->where('variable_id', $variableId)->delete();
        }

        $operation?->forceFill([
            'status' => $successful ? InstallOperation::SUCCEEDED : InstallOperation::FAILED,
            'error' => $successful ? null : 'The install script failed. See the install log in the console.',
            'finished_at' => CarbonImmutable::now(),
        ])->save();

        return $operation;
    }

    public function latest(Server $server): ?InstallOperation
    {
        return InstallOperation::query()->where('server_id', $server->id)->latest('id')->first();
    }
}
