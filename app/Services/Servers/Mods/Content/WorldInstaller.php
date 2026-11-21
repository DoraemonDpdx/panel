<?php

declare(strict_types=1);

namespace Pterodactyl\Services\Servers\Mods\Content;

use Pterodactyl\Exceptions\Mods\ContentUnavailableException;
use Pterodactyl\Exceptions\Mods\NotDistributableException;
use Pterodactyl\Exceptions\Software\InvalidInstallPlanException;
use Pterodactyl\Models\InstallOperation;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\User;
use Pterodactyl\Services\Servers\Mods\CurseForgeApi;
use Pterodactyl\Services\Servers\Mods\CurseForgeProvider;
use Pterodactyl\Services\Servers\Mods\Json;
use Pterodactyl\Services\Servers\Software\InstallPlan;
use Throwable;

/**
 * Installs a world: one from CurseForge, or a zip the user uploaded. The world goes into the server's level folder
 * (replacing the current world, with an optional backup copy) or into a new folder next to it.
 */
class WorldInstaller
{
    public function __construct(
        private readonly CurseForgeApi $api,
        private readonly CurseForgeProvider $curseForge,
        private readonly RemoteArchive $archives,
        private readonly ServerFiles $files,
        private readonly ContentRunner $runner,
    ) {}

    /**
     * @param  'replace'|'new'  $mode
     */
    public function installCurseForge(Server $server, User $by, string $projectId, string $fileId, string $mode, bool $backup, ?string $levelName): InstallOperation
    {
        $this->runner->assertManaged($server);

        $project = $this->curseForge->project($projectId);
        $file = Json::object($this->api->get("/mods/$projectId/files/$fileId")['data'] ?? null);
        if (($file['modId'] ?? null) !== (int) $projectId) {
            throw new ContentUnavailableException('wrong_project', 'That file does not belong to the selected world.');
        }

        $url = is_string($file['downloadUrl'] ?? null) && $file['downloadUrl'] !== '' ? $file['downloadUrl'] : throw new NotDistributableException($project['page_url']);
        $sha1 = $this->sha1Of($file) ?? throw new ContentUnavailableException('invalid_pack', 'CurseForge did not list a hash for that world.');

        $names = $this->archives->names($url, $this->curseForge->downloadHosts());
        $prefix = '';
        if ($names !== null) {
            $found = $this->levelRootOf($names);
            if ($found === null) {
                throw new ContentUnavailableException('not_a_world', 'That download is not a Minecraft world: it has no level.dat.');
            }
            $prefix = $found;
        }

        $title = $project['title'] ?? $projectId;

        return $this->run($server, $by, $title, ['url' => $url, 'local' => null, 'sha1' => $sha1], $prefix, $mode, $backup, $levelName, [], ['provider' => 'curseforge', 'project_id' => $projectId, 'file_id' => $fileId]);
    }

    /**
     * @param  'replace'|'new'  $mode
     */
    public function installLocal(Server $server, User $by, string $path, string $mode, bool $backup, ?string $levelName): InstallOperation
    {
        $this->runner->assertManaged($server);
        $this->assertMode($mode, $levelName);

        $staged = $this->files->stage($server, $path);

        try {
            $this->files->unpack($server, $staged);
            $prefix = $this->files->findLevelRoot($server, $staged['dir']);
            if ($prefix === null) {
                throw new ContentUnavailableException('not_a_world', 'That zip is not a Minecraft world: it has no level.dat.');
            }
            $this->files->clearUnpacked($server, $staged);

            return $this->run($server, $by, basename($path), ['url' => null, 'local' => $staged['zip'], 'sha1' => null], $prefix, $mode, $backup, $levelName, [$staged['dir']], ['provider' => 'local']);
        } catch (Throwable $exception) {
            $this->files->restore($server, $staged);

            throw $exception;
        }
    }

    /**
     * The folder level.dat sits in, as `Folder/` (empty at the top), shallowest first; null when there is no level.dat.
     *
     * @param  list<string>  $names
     */
    public function levelRootOf(array $names): ?string
    {
        $best = null;
        foreach ($names as $name) {
            if (basename($name) !== 'level.dat' || str_ends_with($name, '/') || str_contains($name, '__MACOSX/')) {
                continue;
            }
            $dir = dirname($name) === '.' ? '' : dirname($name).'/';
            if ($best === null || mb_substr_count($dir, '/') < mb_substr_count($best, '/')) {
                $best = $dir;
            }
        }

        return $best;
    }

    /**
     * @param  array{url: string|null, local: string|null, sha1: string|null}  $source
     * @param  list<string>  $cleanup
     * @param  array<string, string>  $origin
     */
    private function run(Server $server, User $by, string $title, array $source, string $prefix, string $mode, bool $backup, ?string $levelName, array $cleanup, array $origin): InstallOperation
    {
        $this->assertMode($mode, $levelName);

        $current = $this->files->levelName($server);
        $target = $mode === 'new' ? (string) $levelName : $current;
        $entries = $this->files->rootEntries($server);

        $moves = [];
        $remove = [];
        if ($mode === 'new') {
            if (in_array($target, $entries, true)) {
                throw new ContentUnavailableException('level_exists', "A folder named $target already exists on the server.");
            }
        } else {
            $stamp = now()->format('Ymd-Hi');
            foreach (['', '_nether', '_the_end'] as $suffix) {
                $existing = $current.$suffix;
                if (! in_array($existing, $entries, true)) {
                    continue;
                }
                if ($backup) {
                    $moves[] = ['from' => $existing, 'to' => "$current-backup-$stamp$suffix"];
                } else {
                    $remove[] = $existing;
                }
            }
        }

        try {
            $plan = new InstallPlan('world', false, InstallPlan::DEFAULT_KEEP, null, $moves, $remove, [], [[
                ...$source,
                'strip' => $prefix,
                'into' => $target,
                'only' => $prefix === '' ? null : $prefix,
            ]]);
        } catch (InvalidInstallPlanException $exception) {
            throw new ContentUnavailableException('invalid_pack', 'This world cannot be installed: '.$exception->getMessage());
        }

        $pending = ['cleanup' => $cleanup];
        if ($mode === 'new') {
            $pending['level_name'] = $target;
        }

        return $this->runner->run($server, $by, $plan, 'world', [
            'title' => $title,
            'mode' => $mode,
            'level_name' => $target,
            'backup' => $mode === 'replace' ? $backup : false,
            ...$origin,
        ], $pending);
    }

    private function assertMode(string $mode, ?string $levelName): void
    {
        if ($mode === 'new' && ($levelName === null || ! $this->files->validLevelName($levelName))) {
            throw new ContentUnavailableException('invalid_level_name', 'Choose a folder name for the new world, using letters, numbers, spaces, dots, dashes and underscores.');
        }
    }

    /**
     * @param  array<string, mixed>  $file
     */
    private function sha1Of(array $file): ?string
    {
        foreach (is_array($file['hashes'] ?? null) ? $file['hashes'] : [] as $hash) {
            if (is_array($hash) && ($hash['algo'] ?? null) === 1 && is_string($hash['value'] ?? null)) {
                return mb_strtolower($hash['value']);
            }
        }

        return null;
    }
}
