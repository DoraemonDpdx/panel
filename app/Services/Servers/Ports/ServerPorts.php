<?php

declare(strict_types=1);

namespace Pterodactyl\Services\Servers\Ports;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\Allocation;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\ServerEnvSetting;
use Pterodactyl\Models\ServerPortBinding;
use Throwable;

/**
 * Reads and changes a server's port roles and environment file settings, and keeps the file on
 * disk in step with them.
 *
 * @phpstan-type ExtraVariable array{key: string, value: string, secret: bool}
 */
final readonly class ServerPorts
{
    public function __construct(
        private PortAssigner $assigner,
        private PortEnvironment $environment,
        private EnvFileSync $files,
    ) {}

    /**
     * @return array<string, mixed>
     */
    public function overview(Server $server): array
    {
        $settings = ServerEnvSetting::forServer($server);
        $bindings = ServerPortBinding::query()->where('server_id', $server->id)->with('allocation')->orderBy('id')->get()->keyBy('role');
        $spec = $this->assigner->spec($server);

        $roles = [];
        foreach ($spec as $entry) {
            $roles[$entry['role']] = $this->roleRow($server, $entry['role'], $entry['required'], $bindings->get($entry['role']));
        }

        foreach ($bindings as $role => $binding) {
            $roles[$role] ??= $this->roleRow($server, (string) $role, false, $binding);
        }

        $held = Allocation::query()->where('server_id', $server->id)->count();

        return [
            'roles' => array_values($roles),
            'free_allocations' => array_map(fn (Allocation $allocation): array => $this->allocationRow($allocation), $this->assigner->freeAllocations($server)),
            'settings' => $this->settingsRow($settings),
            'restart_required' => $settings->restart_required,
            'allocation_limit' => $server->allocation_limit,
            'allocation_count' => $held,
            'can_add_role' => $held < $server->allocation_limit || $this->assigner->freeAllocations($server) !== [],
            'variables' => array_diff_key($this->environment->all($server), ['SERVER_IP' => 1, 'SERVER_PORT' => 1]),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function preview(Server $server, ?array $draft = null): array
    {
        $settings = ServerEnvSetting::forServer($server);
        if ($draft !== null) {
            $settings = $this->draft($settings, $draft);
            $this->guardSettings($settings);
        }

        return $this->files->preview($server, $settings);
    }

    /**
     * Applies role changes and settings, logs each change and rewrites the file.
     *
     * @param  array{roles?: list<array{role: string, auto: bool, allocation_id?: int|null}>, remove_roles?: list<string>, settings?: array<string, mixed>}  $changes
     * @return array{written: bool, error: string|null, conflicts: list<string>}
     *
     * @throws DisplayException
     */
    public function update(Server $server, array $changes): array
    {
        $changed = DB::transaction(function () use ($server, $changes): bool {
            $changed = false;
            $settings = ServerEnvSetting::forServer($server);

            foreach ($changes['remove_roles'] ?? [] as $role) {
                if (ServerPortBinding::query()->where('server_id', $server->id)->where('role', $role)->exists()) {
                    $this->assigner->removeRole($server, $role);
                    Activity::event('server:ports.remove')->subject($server)->property('role', $role)->log();
                    $changed = true;
                }
            }

            foreach ($changes['roles'] ?? [] as $entry) {
                $allocation = null;
                if (! $entry['auto']) {
                    $allocation = Allocation::query()->find($entry['allocation_id'] ?? 0);
                    throw_unless($allocation instanceof Allocation, DisplayException::class, 'Choose one of this server\'s allocations for a manual role.');
                }

                $binding = $this->assigner->assignRole($server, $entry['role'], $allocation);
                Activity::event('server:ports.assign')->subject($server)->property(['role' => $entry['role'], 'allocation' => $binding->allocation->toString()])->log();
                $changed = true;
            }

            if (isset($changes['settings'])) {
                $updated = $this->draft($settings, $changes['settings']);
                $this->guardSettings($updated);
                if ($updated->isDirty()) {
                    $updated->save();
                    Activity::event('server:ports.settings')->subject($server)->property(['file' => $updated->file_name, 'mode' => $updated->mode])->log();
                    $changed = true;
                }
            }

            if ($changed) {
                $settings->refresh()->forceFill(['restart_required' => true])->save();
            }

            return $changed;
        });

        return $changed ? $this->writeSafely($server) : ['written' => false, 'error' => null, 'conflicts' => []];
    }

    /** Gives every automatic role a fresh free allocation, then rewrites the file. */
    public function reassign(Server $server): array
    {
        DB::transaction(function () use ($server): void {
            $this->assigner->reassignAuto($server);
            ServerEnvSetting::forServer($server)->forceFill(['restart_required' => true])->save();
            Activity::event('server:ports.reassign')->subject($server)->log();
        });

        return $this->writeSafely($server);
    }

    /**
     * Rewrites the file now, without changing anything.
     *
     * @return array{written: bool, error: string|null, conflicts: list<string>}
     */
    public function regenerate(Server $server): array
    {
        $settings = ServerEnvSetting::forServer($server);
        $conflicts = $this->files->write($server, $settings);
        Activity::event('server:ports.regenerate')->subject($server)->property('file', $settings->file_name)->log();

        return ['written' => $conflicts !== null, 'error' => null, 'conflicts' => $conflicts ?? []];
    }

    /**
     * Called before the panel starts a server: refreshes the file and clears the restart flag.
     * A server that never opted in has no settings row and is left alone. A failure here must
     * not keep the server from starting.
     */
    public function prepareStart(Server $server): void
    {
        $settings = ServerEnvSetting::query()->where('server_id', $server->id)->first();
        if (! $settings instanceof ServerEnvSetting) {
            return;
        }

        try {
            $this->files->write($server, $settings);
            $settings->forceFill(['restart_required' => false])->save();
        } catch (Throwable $exception) {
            Log::warning('Could not write the environment file for server '.$server->uuid.': '.$exception->getMessage());
        }
    }

    /**
     * @return array{written: bool, error: string|null, conflicts: list<string>}
     */
    private function writeSafely(Server $server): array
    {
        try {
            $conflicts = $this->files->write($server, ServerEnvSetting::forServer($server));

            return ['written' => $conflicts !== null, 'error' => null, 'conflicts' => $conflicts ?? []];
        } catch (Throwable $exception) {
            return ['written' => false, 'error' => $exception->getMessage(), 'conflicts' => []];
        }
    }

    /**
     * @param  array<string, mixed>  $input
     */
    private function draft(ServerEnvSetting $current, array $input): ServerEnvSetting
    {
        $draft = clone $current;

        foreach (['file_name', 'format', 'mode', 'conflict_policy'] as $field) {
            if (isset($input[$field]) && is_string($input[$field])) {
                $draft->{$field} = $input[$field];
            }
        }

        if (array_key_exists('extra', $input) && is_array($input['extra'])) {
            $previous = [];
            foreach ($current->extra as $extra) {
                $previous[$extra['key']] = $extra['value'];
            }

            $extra = [];
            foreach ($input['extra'] as $entry) {
                $secret = (bool) ($entry['secret'] ?? false);
                // A secret sent without a value keeps the one already stored.
                $value = array_key_exists('value', $entry) && is_string($entry['value']) ? $entry['value'] : ($secret ? ($previous[$entry['key']] ?? '') : '');
                $extra[] = ['key' => (string) $entry['key'], 'value' => $value, 'secret' => $secret];
            }

            $draft->extra = $extra;
        }

        return $draft;
    }

    /**
     * @throws DisplayException
     */
    private function guardSettings(ServerEnvSetting $settings): void
    {
        $name = $settings->file_name;
        throw_if(str_starts_with($name, '/') || str_ends_with($name, '/') || in_array('..', explode('/', $name), true) || preg_match('#^[A-Za-z0-9._\-/]+$#', $name) !== 1, DisplayException::class, 'The file name must be a relative path inside the server, such as .env or config/ports.env.');
        throw_if($settings->mode === 'separate' && $name === '.env', DisplayException::class, 'Separate file mode must not use .env, so the app\'s own .env stays untouched. Choose another file name.');

        $keys = [];
        foreach ($settings->extra as $extra) {
            throw_if(in_array($extra['key'], $keys, true), DisplayException::class, "The variable {$extra['key']} is listed twice.");
            throw_if(in_array($extra['key'], PortEnvironment::RESERVED, true) || preg_match('/^PORT(_\d+)?$/', $extra['key']) === 1 || ServerPortBinding::query()->where('server_id', $settings->server_id)->where('role', $extra['key'])->exists(), DisplayException::class, "{$extra['key']} is set by the panel and cannot be an extra variable.");
            $keys[] = $extra['key'];
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function roleRow(Server $server, string $role, bool $required, ?ServerPortBinding $binding): array
    {
        if (! $binding instanceof ServerPortBinding && $role === 'PORT') {
            $primary = Allocation::query()->find($server->allocation_id);
            if ($primary instanceof Allocation) {
                return ['role' => $role, 'required' => $required, 'allocation' => $this->allocationRow($primary), 'auto' => true, 'status' => 'free', 'reason' => null];
            }
        }

        if (! $binding instanceof ServerPortBinding) {
            return ['role' => $role, 'required' => $required, 'allocation' => null, 'auto' => true, 'status' => 'unassigned', 'reason' => 'No port is assigned to this role yet.'];
        }

        $reason = $this->assigner->problem($server, $binding->allocation, $role, $binding);

        return [
            'role' => $role,
            'required' => $required,
            'allocation' => $this->allocationRow($binding->allocation),
            'auto' => $binding->auto,
            'status' => $reason === null ? 'free' : ($binding->allocation->server_id !== $server->id && $binding->allocation->server_id !== null ? 'in_use' : 'conflict'),
            'reason' => $reason,
        ];
    }

    /**
     * @return array{id: int, ip: string, ip_alias: string|null, port: int}
     */
    private function allocationRow(Allocation $allocation): array
    {
        return ['id' => $allocation->id, 'ip' => $allocation->ip, 'ip_alias' => $allocation->ip_alias, 'port' => $allocation->port];
    }

    /**
     * Secret values never leave the panel.
     *
     * @return array<string, mixed>
     */
    private function settingsRow(ServerEnvSetting $settings): array
    {
        return [
            'file_name' => $settings->file_name,
            'format' => $settings->format,
            'mode' => $settings->mode,
            'conflict_policy' => $settings->conflict_policy,
            'extra' => array_map(fn (array $extra): array => ['key' => $extra['key'], 'value' => $extra['secret'] ? null : $extra['value'], 'secret' => $extra['secret']], $settings->extra),
        ];
    }
}
