<?php

declare(strict_types=1);

namespace Pterodactyl\Actions\Servers;

use Pterodactyl\Contracts\Servers\SendsServerPower;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Facades\Daemon;
use Pterodactyl\Models\Server;
use Pterodactyl\Services\Servers\Ports\ServerPorts;

final readonly class SendServerPower implements SendsServerPower
{
    public function __construct(private ServerPorts $ports) {}

    public function send(Server $server, string $signal): void
    {
        // The environment file is refreshed before the process boots.
        if (in_array($signal, ['start', 'restart'], true)) {
            $this->ports->prepareStart($server);
        }

        Daemon::server($server)->power($signal);

        Activity::event(mb_strtolower("server:power.{$signal}"))->subject($server)->log();
    }
}
