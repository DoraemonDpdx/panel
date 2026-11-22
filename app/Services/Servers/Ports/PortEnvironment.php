<?php

declare(strict_types=1);

namespace Pterodactyl\Services\Servers\Ports;

use Pterodactyl\Models\Allocation;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\ServerEnvSetting;
use Pterodactyl\Models\ServerPortBinding;

/**
 * Works out the port and address variables for a server, from its allocations and role bindings.
 */
final class PortEnvironment
{
    /** Names a port role may not take because the panel or the daemon already sets them. */
    public const array RESERVED = [
        'SERVER_IP', 'SERVER_PORT', 'SERVER_MEMORY', 'SERVER_UUID', 'STARTUP', 'ENV', 'HOME', 'USER', 'UUID',
        'ALLOCATION_LIST', 'PUBLIC_ADDRESS', 'P_SERVER_UUID', 'P_SERVER_LOCATION',
    ];

    /**
     * The variables injected into the container: PORT, one per role, PORT_<n>, ALLOCATION_LIST and
     * PUBLIC_ADDRESS. SERVER_IP and SERVER_PORT are set by the daemon and are left out.
     *
     * @return array<string, string>
     */
    public function injected(Server $server): array
    {
        $values = $this->all($server, fresh: false);
        unset($values['SERVER_IP'], $values['SERVER_PORT']);

        // Extra variables reach the process in every mode, so "off" still has them.
        foreach ($server->envSetting->extra ?? [] as $extra) {
            if (! array_key_exists($extra['key'], $values)) {
                $values[$extra['key']] = $extra['value'];
            }
        }

        return $values;
    }

    /**
     * Everything the env file lists, extra variables excluded.
     *
     * @return array<string, string>
     */
    public function all(Server $server, bool $fresh = true): array
    {
        // A list eager loads these for every server, so reading them costs no query per server.
        // Callers that just changed ports ask for fresh data instead of what was loaded earlier.
        if ($fresh) {
            $server->unsetRelation('allocation')->unsetRelation('allocations')->unsetRelation('portBindings')->unsetRelation('envSetting');
        }

        $server->loadMissing('allocation', 'allocations', 'portBindings.allocation', 'envSetting');
        $primary = $server->allocation;
        if (! $primary instanceof Allocation) {
            return [];
        }

        $allocations = $server->allocations->sortBy('id')->values();
        $bindings = $server->portBindings->sortBy('id');

        $values = [
            'SERVER_IP' => $primary->ip,
            'SERVER_PORT' => (string) $primary->port,
            'PORT' => (string) $primary->port,
        ];

        foreach ($bindings as $binding) {
            $values[$binding->role] = (string) $binding->allocation->port;
        }

        $index = 1;
        foreach ($allocations as $allocation) {
            if ($allocation->id === $primary->id) {
                continue;
            }

            $values['PORT_'.$index++] = (string) $allocation->port;
        }

        $list = [$primary, ...$allocations->reject(fn (Allocation $allocation): bool => $allocation->id === $primary->id)->all()];
        $values['ALLOCATION_LIST'] = implode(',', array_map(fn (Allocation $allocation): string => $allocation->toString(), $list));
        $values['PUBLIC_ADDRESS'] = $primary->alias.':'.$primary->port;

        return $values;
    }

    /**
     * What gets written to the file: the port variables followed by the extra ones. An extra
     * variable never replaces a port variable.
     *
     * @return array<string, string>
     */
    public function fileValues(Server $server, ServerEnvSetting $settings): array
    {
        $values = $this->all($server);
        foreach ($settings->extra as $extra) {
            if (! array_key_exists($extra['key'], $values)) {
                $values[$extra['key']] = $extra['value'];
            }
        }

        return $values;
    }
}
