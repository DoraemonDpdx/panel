<?php

declare(strict_types=1);

namespace Pterodactyl\Services\Servers\Software;

use Pterodactyl\Exceptions\Software\ServerNotOfflineException;
use Pterodactyl\Facades\Daemon;
use Pterodactyl\Models\InstallOperation;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\User;
use Throwable;

/** The "clear server files" action, and the keep lists shared with software switches that start fresh. */
final readonly class ServerFileWiper
{
    public function __construct(private InstallPlanRunner $runner) {}

    /**
     * Wipes the server's files (optionally keeping its worlds) and reinstalls its current software.
     *
     * @throws ServerNotOfflineException
     */
    public function clear(Server $server, User $by, bool $keepWorlds): InstallOperation
    {
        $this->assertOffline($server);

        return $this->runner->run(
            $server,
            InstallPlan::forClear($keepWorlds, $this->worldNames($server, $keepWorlds)),
            'clear',
            ['keep_worlds' => $keepWorlds],
            $by,
        );
    }

    /** @throws ServerNotOfflineException */
    public function assertOffline(Server $server): void
    {
        // Read live: the cached state used for lists can say offline for twenty seconds after a start.
        $state = Daemon::server($server)->details()['state'] ?? 'offline';

        throw_unless(in_array($state, ['offline', 'stopped'], true), ServerNotOfflineException::class);
    }

    /**
     * The top-level entries a wipe leaves in place.
     *
     * @return list<string>
     */
    public function keepList(Server $server, bool $keepWorlds, bool $keepSettings): array
    {
        return [
            ...($keepWorlds ? $this->worldNames($server, true) : []),
            ...($keepSettings ? array_values(array_diff(InstallPlan::DEFAULT_KEEP, ['world', 'world_nether', 'world_the_end'])) : []),
        ];
    }

    /**
     * The world folders to keep: the default three and the folders for the level-name in server.properties.
     *
     * @return list<string>
     */
    public function worldNames(Server $server, bool $keepWorlds): array
    {
        if (! $keepWorlds) {
            return [];
        }

        $names = ['world', 'world_nether', 'world_the_end'];

        try {
            $properties = Daemon::server($server)->files()->getContent('/server.properties', 1024 * 1024);
        } catch (Throwable) {
            return $names;
        }

        if (preg_match('/^level-name=(.+)$/m', $properties, $match) === 1) {
            $level = mb_trim($match[1]);

            if ($level !== '' && ! str_contains($level, '/') && ! str_contains($level, '\\') && ! in_array($level, ['.', '..', '.astrelyse'], true) && preg_match('/[\x00-\x1f]/', $level) !== 1) {
                $names = array_values(array_unique([...$names, $level, $level.'_nether', $level.'_the_end']));
            }
        }

        return $names;
    }
}
