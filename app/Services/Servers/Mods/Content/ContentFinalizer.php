<?php

declare(strict_types=1);

namespace Pterodactyl\Services\Servers\Mods\Content;

use Illuminate\Support\Facades\DB;
use Pterodactyl\Facades\Daemon;
use Pterodactyl\Models\InstallOperation;
use Pterodactyl\Models\Server;
use Pterodactyl\Services\Servers\Mods\Json;
use Throwable;

/**
 * Records what an install operation did once it has finished: the modpack and its mods (so the Installed tab manages
 * them), a new level name, and the staged archives to clean up. Nothing is recorded while the operation runs, and a
 * failed one records nothing.
 *
 * What to record is queued with the operation. `apply()` is cheap and safe to call often: it does nothing unless an
 * operation of the server has finished.
 *
 * @phpstan-import-type PackMod from ResolvedPack
 *
 * @phpstan-type Pending array{modpack?: array{provider: string, project_id: string, version_id: string, title: string, icon_url: string|null, version_number: string}, replace_mods?: bool, mods?: list<PackMod>, level_name?: string, cleanup?: list<string>}
 */
class ContentFinalizer
{
    public function __construct(private readonly ServerFiles $files) {}

    /**
     * @param  Pending  $payload
     */
    public function queue(Server $server, InstallOperation $operation, array $payload): void
    {
        DB::table('server_content_pending')->insert([
            'server_id' => $server->id,
            'operation_id' => $operation->id,
            'payload' => json_encode($payload, JSON_THROW_ON_ERROR),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    /**
     * Applies or drops the queued records of every operation of the server that has finished.
     */
    public function apply(Server $server): void
    {
        $rows = DB::table('server_content_pending')->where('server_id', $server->id)->orderBy('id')->get();

        foreach ($rows as $row) {
            $status = InstallOperation::query()->whereKey($row->operation_id)->value('status');
            if ($status === InstallOperation::PENDING || $status === InstallOperation::RUNNING) {
                continue;
            }

            $payload = Json::object(json_decode(is_string($row->payload) ? $row->payload : '{}', true));

            DB::transaction(function () use ($server, $row, $payload, $status): void {
                if ($status === InstallOperation::SUCCEEDED) {
                    $this->record($server, $payload);
                }
                DB::table('server_content_pending')->where('id', $row->id)->delete();
            });

            $this->cleanup($server, Json::strings($payload['cleanup'] ?? null));
        }
    }

    /**
     * @param  array<string, mixed>  $payload
     */
    private function record(Server $server, array $payload): void
    {
        $modpack = Json::object($payload['modpack'] ?? null);
        if ($modpack !== []) {
            $server->modpack()->updateOrCreate(['server_id' => $server->id], $modpack);
        }

        if (($payload['replace_mods'] ?? false) === true) {
            $server->modInstalls()->delete();
        }

        foreach (Json::rows($payload['mods'] ?? null) as $mod) {
            $server->modInstalls()->updateOrCreate(
                ['provider' => Json::string($mod['provider'] ?? null), 'project_id' => Json::string($mod['project_id'] ?? null)],
                [
                    'version_id' => Json::string($mod['version_id'] ?? null),
                    'slug' => Json::string($mod['slug'] ?? null),
                    'project_type' => Json::string($mod['project_type'] ?? null) ?? 'mod',
                    'title' => Json::string($mod['title'] ?? null),
                    'icon_url' => Json::string($mod['icon_url'] ?? null),
                    'filename' => Json::string($mod['filename'] ?? null),
                    'version_number' => Json::string($mod['version_number'] ?? null) ?? '',
                    'sha512' => Json::string($mod['sha512'] ?? null),
                    'sha1' => Json::string($mod['sha1'] ?? null),
                    'install_dir' => Json::string($mod['install_dir'] ?? null) ?? 'mods',
                    'enabled' => true,
                    'from_modpack' => $modpack !== [],
                ],
            );
        }

        $level = Json::string($payload['level_name'] ?? null);
        if ($level !== null) {
            try {
                $this->files->setLevelName($server, $level);
            } catch (Throwable) {
                // The world is installed; the user can still set level-name by hand.
            }
        }
    }

    /**
     * @param  list<string>  $folders  staging folders under .astrelyse/import
     */
    private function cleanup(Server $server, array $folders): void
    {
        $names = array_values(array_filter(array_map(fn (string $folder): string => basename($folder), $folders), fn (string $name): bool => preg_match('/^[0-9a-f\-]{36}$/', $name) === 1));
        if ($names === []) {
            return;
        }

        try {
            Daemon::server($server)->files()->deleteFiles('/'.ServerFiles::IMPORT_ROOT, $names);
        } catch (Throwable) {
            // Staged archives live under .astrelyse and are harmless if they stay.
        }
    }
}
