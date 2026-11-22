<?php

declare(strict_types=1);

namespace Pterodactyl\Services\Servers\Mods\Content;

use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Pterodactyl\Contracts\Servers\UpdatesServerDockerImage;
use Pterodactyl\Models\InstallOperation;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\ServerVariable;
use Pterodactyl\Models\User;
use Pterodactyl\Services\Servers\Software\InstallPlan;
use Pterodactyl\Services\Servers\Software\InstallPlanRunner;
use Pterodactyl\Services\Servers\Software\JavaImageSelector;

/**
 * Runs a content install plan through S1's runner, switching the server's software first when the plan asks for it,
 * and queues what to record when the operation succeeds.
 *
 * @phpstan-import-type Pending from ContentFinalizer
 */
class ContentRunner
{
    public function __construct(
        private readonly InstallPlanRunner $runner,
        private readonly ContentFinalizer $finalizer,
        private readonly UpdatesServerDockerImage $images,
    ) {}

    /**
     * A 409 unless the server is a Java Minecraft server.
     */
    public function assertJava(Server $server): void
    {
        $tags = $server->tagSlugs();
        if (! in_array('minecraft', $tags, true) || in_array('bedrock', $tags, true)) {
            throw new HttpResponseException(new JsonResponse(['error' => 'content_unsupported'], 409));
        }
    }

    /**
     * A 409 unless the server runs the Astrelyse install script, the only thing that can run a plan.
     */
    public function assertManaged(Server $server): void
    {
        $this->assertJava($server);
        if (! $this->runner->supports($server)) {
            throw new HttpResponseException(new JsonResponse(['error' => 'egg_not_managed'], 409));
        }
    }

    /**
     * @param  array<string, mixed>  $summary
     * @param  Pending  $pending
     * @param  array{type: string, minecraft: string, loader: string|null}|null  $software  stored in the egg variables before the plan runs
     */
    public function run(Server $server, User $by, InstallPlan $plan, string $kind, array $summary, array $pending, ?array $software = null): InstallOperation
    {
        $this->assertManaged($server);

        $operation = DB::transaction(function () use ($server, $by, $plan, $kind, $summary, $software): InstallOperation {
            if ($software !== null) {
                $this->applySoftware($server, $software);
            }

            return $this->runner->run($server, $plan, $kind, $summary, $by);
        });

        $this->finalizer->queue($server, $operation, $pending);

        return $operation;
    }

    /**
     * @param  array{type: string, minecraft: string, loader: string|null}  $software
     */
    private function applySoftware(Server $server, array $software): void
    {
        $this->setVariable($server, 'SERVER_TYPE', $software['type']);
        $this->setVariable($server, 'MC_VERSION', $software['minecraft']);
        $this->setVariable($server, 'LOADER_VERSION', $software['loader'] ?? '');

        $server->loadMissing('egg');
        $image = JavaImageSelector::imageFor($server->egg === null ? [] : $server->egg->docker_images, JavaImageSelector::javaMajor($software['minecraft']));
        if ($image !== null && $image !== $server->image) {
            $this->images->update($server, $image);
        }
    }

    private function setVariable(Server $server, string $env, string $value): void
    {
        $variable = $server->egg?->variables()->where('env_variable', $env)->first();
        if ($variable !== null) {
            ServerVariable::query()->updateOrCreate(['server_id' => $server->id, 'variable_id' => $variable->id], ['variable_value' => $value]);
        }
    }
}
