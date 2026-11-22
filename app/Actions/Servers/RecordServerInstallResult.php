<?php

declare(strict_types=1);

namespace Pterodactyl\Actions\Servers;

use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Log;
use Pterodactyl\Contracts\Servers\RecordsServerInstallResults;
use Pterodactyl\Events\Server\Installed as ServerInstalled;
use Pterodactyl\Events\Server\OperationCompleted;
use Pterodactyl\Models\Server;
use Pterodactyl\Services\Servers\Mods\Content\ContentFinalizer;
use Pterodactyl\Services\Servers\ServerInstallService;
use Pterodactyl\Services\Servers\Software\InstallPlanRunner;
use Throwable;

final readonly class RecordServerInstallResult implements RecordsServerInstallResults
{
    public function __construct(private ServerInstallService $serverInstallService, private InstallPlanRunner $operations, private ContentFinalizer $content) {}

    /**
     * The action takes both flags as bools, which always meet these rules.
     *
     * @return NormalizedValidationRules
     */
    public static function rules(): array
    {
        return [
            'successful' => ['present', 'boolean'],
            'reinstall' => ['sometimes', 'boolean'],
        ];
    }

    public function record(Request $request, string $uuid, bool $successful, bool $reinstall): Server
    {
        $server = $this->serverInstallService->resolveForNode($request, $uuid);
        $status = null;
        if (! $successful) {
            $status = $reinstall ? Server::STATUS_REINSTALL_FAILED : Server::STATUS_INSTALL_FAILED;
        }

        if ($server->status === Server::STATUS_SUSPENDED) {
            $status = Server::STATUS_SUSPENDED;
        }

        $isInitialInstall = $server->installed_at === null;
        $server->forceFill(['status' => $status, 'installed_at' => CarbonImmutable::now()])->saveOrFail();
        if ($isInitialInstall && config()->get('pterodactyl.email.send_install_notification', true)) {
            Event::dispatch(new ServerInstalled($server));
        } elseif (! $isInitialInstall && config()->get('pterodactyl.email.send_reinstall_notification', true)) {
            Event::dispatch(new ServerInstalled($server));
        }

        $this->operations->close($server, $successful);

        // Record what a modpack, world or mod-list install put on disk (or drop it on failure). This talks
        // to Wings for staging cleanup, and Wings is waiting on this response, so never let it fail the call.
        try {
            $this->content->apply($server);
        } catch (Throwable $exception) {
            Log::warning('Could not finalize content install', ['server' => $server->uuid, 'exception' => $exception]);
        }

        Event::dispatch(new OperationCompleted($server->uuid, $reinstall ? 'reinstall' : 'install', $successful, $server->uuid));

        return $server;
    }
}
