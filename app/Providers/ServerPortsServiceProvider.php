<?php

declare(strict_types=1);

namespace Pterodactyl\Providers;

use Illuminate\Support\ServiceProvider;
use Pterodactyl\Models\Server;
use Pterodactyl\Services\Servers\EnvironmentService;
use Pterodactyl\Services\Servers\Ports\PortEnvironment;

class ServerPortsServiceProvider extends ServiceProvider
{
    /**
     * Gives every server PORT, one variable per port role, PORT_<n>, ALLOCATION_LIST and
     * PUBLIC_ADDRESS. Egg variables and configured variables keep priority over these.
     */
    public function boot(): void
    {
        $this->app->make(EnvironmentService::class)->setEnvironmentDefaults(
            fn (Server $server): array => $this->app->make(PortEnvironment::class)->injected($server),
        );
    }
}
