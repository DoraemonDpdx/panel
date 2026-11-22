<?php

declare(strict_types=1);

namespace Pterodactyl\Services\Servers\Ports;

use Illuminate\Support\Facades\DB;
use Pterodactyl\Actions\Allocations\CreateAllocations;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Models\Allocation;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\ServerEnvSetting;
use Pterodactyl\Models\ServerPortBinding;

/**
 * Binds the named port roles of a server to its allocations, picking free ones on the node when
 * asked to and refusing any port that is unsafe.
 */
final class PortAssigner
{
    public const string ROLE_PATTERN = '/^[A-Z][A-Z0-9_]{0,62}$/';

    /**
     * The roles the server's egg asks for. An egg without a spec needs just PORT.
     *
     * @return list<array{role: string, required: bool}>
     */
    public function spec(Server $server): array
    {
        $spec = $server->egg?->port_spec;
        $roles = [];
        if (is_array($spec)) {
            foreach ($spec as $entry) {
                if (is_array($entry) && is_string($entry['role'] ?? null) && preg_match(self::ROLE_PATTERN, $entry['role']) === 1) {
                    $roles[$entry['role']] = ['role' => $entry['role'], 'required' => (bool) ($entry['required'] ?? false)];
                }
            }
        }

        if (! array_key_exists('PORT', $roles)) {
            $roles = ['PORT' => ['role' => 'PORT', 'required' => true], ...$roles];
        }

        return array_values($roles);
    }

    /**
     * Binds every required role on a new server. The egg declares what the server needs, so the
     * allocation limit does not stop this; it only caps roles added later.
     */
    public function assignDefaults(Server $server): void
    {
        DB::transaction(function () use ($server): void {
            foreach ($this->spec($server) as $entry) {
                if (! $entry['required'] || ServerPortBinding::query()->where('server_id', $server->id)->where('role', $entry['role'])->exists()) {
                    continue;
                }

                if ($entry['role'] === 'PORT') {
                    $primary = Allocation::query()->find($server->allocation_id);
                    if ($primary instanceof Allocation && ! $this->bound($server, $primary)) {
                        $this->bind($server, 'PORT', $primary, true);

                        continue;
                    }
                }

                // A node with no free port leaves the role unassigned; the settings card shows it.
                try {
                    $this->bind($server, $entry['role'], $this->pickFree($server, $entry['role'], enforceLimit: false), true);
                } catch (DisplayException) {
                    continue;
                }
            }

            ServerEnvSetting::forServer($server);
        });
    }

    /**
     * Binds a role to a chosen allocation, or to the next free one when none is given.
     *
     * @throws DisplayException
     */
    public function assignRole(Server $server, string $role, ?Allocation $allocation): ServerPortBinding
    {
        $this->validateRole($role);

        return DB::transaction(function () use ($server, $role, $allocation): ServerPortBinding {
            $existing = ServerPortBinding::query()->where('server_id', $server->id)->where('role', $role)->first();
            if ($allocation instanceof Allocation) {
                $this->guard($server, $allocation, $role, $existing);
            }

            $auto = ! $allocation instanceof Allocation;
            $allocation ??= $this->pickFree($server, $role, enforceLimit: true, ignore: $existing);

            if ($existing instanceof ServerPortBinding) {
                $existing->forceFill(['allocation_id' => $allocation->id, 'auto' => $auto])->save();

                return $existing->setRelation('allocation', $allocation);
            }

            return $this->bind($server, $role, $allocation, $auto);
        });
    }

    public function removeRole(Server $server, string $role): void
    {
        ServerPortBinding::query()->where('server_id', $server->id)->where('role', $role)->delete();
    }

    /**
     * Gives every automatic role the next free allocation again. Manual roles are left alone.
     */
    public function reassignAuto(Server $server): void
    {
        DB::transaction(function () use ($server): void {
            $bindings = ServerPortBinding::query()->where('server_id', $server->id)->where('auto', true)->orderBy('id')->get();
            // PORT goes back to the primary allocation first, as it is on a new server.
            foreach ($bindings->sortByDesc(fn (ServerPortBinding $binding): bool => $binding->role === 'PORT') as $binding) {
                $primary = Allocation::query()->find($server->allocation_id);
                if ($binding->role === 'PORT' && $primary instanceof Allocation && $this->problem($server, $primary, 'PORT', $binding) === null) {
                    $binding->forceFill(['allocation_id' => $primary->id])->save();

                    continue;
                }

                $binding->forceFill(['allocation_id' => $this->pickFree($server, $binding->role, enforceLimit: true, ignore: $binding)->id])->save();
            }
        });
    }

    /**
     * Allocations of this server that no role uses, for the manual picker.
     *
     * @return list<Allocation>
     */
    public function freeAllocations(Server $server): array
    {
        $taken = $this->reserved($server);

        return Allocation::query()
            ->where('server_id', $server->id)
            ->whereNotIn('id', $taken)
            ->orderBy('port')
            ->get()
            ->all();
    }

    /**
     * Why an allocation cannot back a role on this server, or null when it can.
     */
    public function problem(Server $server, Allocation $allocation, string $role, ?ServerPortBinding $replacing = null): ?string
    {
        if ($allocation->node_id !== $server->node_id) {
            return 'The allocation is not on this server\'s node.';
        }

        if ($allocation->server_id !== $server->id) {
            return $allocation->server_id === null
                ? 'The allocation is not assigned to this server.'
                : 'The port is already in use by another server on the node.';
        }

        if ($allocation->port < CreateAllocations::PORT_FLOOR) {
            return 'Ports below '.CreateAllocations::PORT_FLOOR.' are reserved and cannot be assigned.';
        }

        if ($this->portTakenByAnotherServer($server, $allocation)) {
            return 'The port is already in use by another server on the node.';
        }

        if ($this->boundByOther($server, $allocation, $role, $replacing)) {
            return 'The allocation is already bound to another role on this server.';
        }

        return null;
    }

    /**
     * @throws DisplayException
     */
    private function guard(Server $server, Allocation $allocation, string $role, ?ServerPortBinding $replacing): void
    {
        $problem = $this->problem($server, $allocation, $role, $replacing);
        throw_if($problem !== null, DisplayException::class, $problem);
    }

    /**
     * @throws DisplayException
     */
    private function validateRole(string $role): void
    {
        throw_unless(preg_match(self::ROLE_PATTERN, $role) === 1, DisplayException::class, 'A port role is upper case letters, digits and underscores, starting with a letter.');
        throw_if(in_array($role, PortEnvironment::RESERVED, true) || preg_match('/^PORT_\d+$/', $role) === 1, DisplayException::class, "{$role} is reserved and cannot be used as a port role.");
    }

    private function bind(Server $server, string $role, Allocation $allocation, bool $auto): ServerPortBinding
    {
        $binding = new ServerPortBinding(['server_id' => $server->id, 'allocation_id' => $allocation->id, 'role' => $role, 'auto' => $auto]);
        $binding->save();

        return $binding->setRelation('allocation', $allocation);
    }

    private function bound(Server $server, Allocation $allocation): bool
    {
        return ServerPortBinding::query()->where('server_id', $server->id)->where('allocation_id', $allocation->id)->exists();
    }

    private function boundByOther(Server $server, Allocation $allocation, string $role, ?ServerPortBinding $replacing): bool
    {
        // Until PORT is bound somewhere else, the primary allocation is PORT's.
        if ($role !== 'PORT' && $allocation->id === $server->allocation_id && $this->primaryIsPort($server, $replacing)) {
            return true;
        }

        return ServerPortBinding::query()
            ->where('server_id', $server->id)
            ->where('allocation_id', $allocation->id)
            ->when($replacing instanceof ServerPortBinding, fn ($query) => $query->where('id', '!=', $replacing?->id))
            ->exists();
    }

    private function portTakenByAnotherServer(Server $server, Allocation $allocation): bool
    {
        return Allocation::query()
            ->where('node_id', $server->node_id)
            ->where('port', $allocation->port)
            ->whereNotNull('server_id')
            ->where('server_id', '!=', $server->id)
            ->exists();
    }

    /**
     * The next allocation that is safe to bind: one the server already holds and no role uses,
     * else a free one on its node that the allocation limit allows the server to take.
     *
     * @throws DisplayException
     */
    private function pickFree(Server $server, string $role, bool $enforceLimit, ?ServerPortBinding $ignore = null): Allocation
    {
        $taken = $this->reserved($server, $ignore);
        // PORT falls back to the primary allocation, as it does on a new server.
        $primary = Allocation::query()->find($server->allocation_id);
        if ($role === 'PORT' && $primary instanceof Allocation && $this->problem($server, $primary, $role, $ignore) === null) {
            return $primary;
        }

        $owned = Allocation::query()->where('server_id', $server->id)->whereNotIn('id', $taken)->orderBy('port')->lockForUpdate()->get();
        foreach ($owned as $candidate) {
            if ($this->problem($server, $candidate, $role, $ignore) === null) {
                return $candidate;
            }
        }

        $held = Allocation::query()->where('server_id', $server->id)->count();
        throw_if($enforceLimit && $held >= $server->allocation_limit, DisplayException::class, 'This server has reached its allocation limit, so no more ports can be assigned automatically. Ask for more allocations to add another port.');

        $free = Allocation::query()
            ->where('node_id', $server->node_id)
            ->whereNull('server_id')
            ->where('port', '>=', CreateAllocations::PORT_FLOOR)
            ->whereNotIn('port', Allocation::query()->where('node_id', $server->node_id)->whereNotNull('server_id')->select('port'))
            ->when($primary instanceof Allocation, fn ($query) => $query->orderByRaw('ip = ? desc', [$primary?->ip]))
            ->orderBy('port')
            ->lockForUpdate()
            ->first();

        throw_unless($free instanceof Allocation, DisplayException::class, 'No free port is available on this server\'s node.');

        $free->forceFill(['server_id' => $server->id])->save();

        return $free;
    }

    /**
     * Allocation ids no new role may take: those bound to a role, and the primary while it is
     * still PORT's.
     *
     * @return list<int>
     */
    private function reserved(Server $server, ?ServerPortBinding $ignore = null): array
    {
        $ids = ServerPortBinding::query()
            ->where('server_id', $server->id)
            ->when($ignore instanceof ServerPortBinding, fn ($query) => $query->where('id', '!=', $ignore?->id))
            ->pluck('allocation_id')
            ->all();

        if ($this->primaryIsPort($server, $ignore)) {
            $ids[] = $server->allocation_id;
        }

        return array_values(array_unique($ids));
    }

    private function primaryIsPort(Server $server, ?ServerPortBinding $ignore): bool
    {
        $binding = ServerPortBinding::query()->where('server_id', $server->id)->where('role', 'PORT')->first();

        return ! $binding instanceof ServerPortBinding
            || ($binding->allocation_id === $server->allocation_id && ! ($ignore instanceof ServerPortBinding && $ignore->id === $binding->id));
    }
}
