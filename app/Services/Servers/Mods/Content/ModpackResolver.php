<?php

declare(strict_types=1);

namespace Pterodactyl\Services\Servers\Mods\Content;

use Illuminate\Support\Facades\Cache;
use Pterodactyl\Exceptions\Mods\ClientOnlyException;
use Pterodactyl\Exceptions\Mods\ContentUnavailableException;
use Pterodactyl\Exceptions\Mods\NotDistributableException;
use Pterodactyl\Exceptions\Software\InvalidInstallPlanException;
use Pterodactyl\Services\Servers\Mods\CurseForgeApi;
use Pterodactyl\Services\Servers\Mods\CurseForgeProvider;
use Pterodactyl\Services\Servers\Mods\Json;
use Pterodactyl\Services\Servers\Mods\ModrinthClient;
use Pterodactyl\Services\Servers\Mods\ModrinthProvider;
use Pterodactyl\Services\Servers\Mods\SideChecker;
use Pterodactyl\Services\Servers\Software\InstallPlan;
use ZipArchive;

/**
 * Works a modpack version out to an install: Modrinth `.mrpack` files and CurseForge packs (their server pack, or
 * their manifest resolved file by file). The panel makes every API call and decision here; the install container only
 * downloads, checks hashes and unpacks.
 *
 * @phpstan-import-type PackFile from ResolvedPack
 * @phpstan-import-type PackArchive from ResolvedPack
 * @phpstan-import-type PackMod from ResolvedPack
 *
 * @phpstan-type PackMeta array{provider: string, project_id: string, version_id: string, title: string, icon_url: string|null, version_number: string}
 * @phpstan-type Source array{url?: string, local?: string, sha1?: string|null, size?: int}
 */
class ModpackResolver
{
    private const int CACHE_TTL = 1800;

    private const int MAX_ENTRY_BYTES = 16 * 1024 * 1024;

    private const int BATCH = 400;

    /** CurseForge class IDs whose files never run on a server. */
    private const array CLIENT_CLASSES = [12 => 'resource packs', 6552 => 'shader packs', 4546 => 'customization'];

    private const array MODRINTH_LOADER_KEYS = ['fabric-loader' => 'fabric', 'quilt-loader' => 'quilt', 'forge' => 'forge', 'neoforge' => 'neoforge'];

    private const array CURSEFORGE_LOADERS = ['forge', 'fabric', 'quilt', 'neoforge'];

    public function __construct(
        private readonly ModrinthClient $modrinth,
        private readonly ModrinthProvider $modrinthProvider,
        private readonly CurseForgeApi $curseForge,
        private readonly CurseForgeProvider $curseForgeProvider,
        private readonly SideChecker $sides,
        private readonly RemoteArchive $archives,
    ) {}

    /**
     * @param  bool  $withRows  also work out the Modrinth or CurseForge project of every mod, for the Installed list
     */
    public function resolve(string $provider, string $projectId, string $versionId, bool $withRows): ResolvedPack
    {
        return match ($provider) {
            'modrinth' => $this->resolveModrinth($projectId, $versionId, $withRows),
            'curseforge' => $this->resolveCurseForge($projectId, $versionId, $withRows),
            default => throw new ContentUnavailableException('unsupported_provider', 'That provider has no modpacks.'),
        };
    }

    /**
     * Builds a pack from a `modrinth.index.json` that is already read, for an `.mrpack` the user uploaded.
     *
     * @param  array<string, mixed>  $index
     * @param  Source  $source  where the install container finds the archive
     * @param  list<string>  $dirs  the folders at the top of the archive
     * @param  PackMeta  $meta
     */
    public function fromMrpackIndex(array $index, array $source, array $dirs, array $meta, bool $withRows): ResolvedPack
    {
        if (($index['game'] ?? 'minecraft') !== 'minecraft' || ! is_array($index['files'] ?? null) || ! is_array($index['dependencies'] ?? null)) {
            throw new ContentUnavailableException('not_a_modpack', 'That file is not a Minecraft modpack.');
        }

        $software = $this->mrpackSoftware(Json::object($index['dependencies']));
        $files = [];
        $skipped = 0;
        $warnings = [];

        foreach (Json::rows($index['files']) as $file) {
            $env = Json::object($file['env'] ?? null);
            if (($env['server'] ?? null) === 'unsupported') {
                $skipped++;

                continue;
            }

            $files[] = $this->mrpackFile($file);
        }

        $archives = [];
        foreach (['overrides', 'server-overrides'] as $folder) {
            if (in_array($folder, $dirs, true)) {
                $archives[] = $this->archive($source, "$folder/", "$folder/");
            }
        }

        $rows = $withRows ? $this->modrinthRows($files) : [];
        $size = array_sum(array_map(fn (array $file): int => $file['size'] ?? 0, $files)) + (int) ($source['size'] ?? 0);

        return new ResolvedPack($meta['provider'], $meta['project_id'], $meta['version_id'], $meta['title'], $meta['icon_url'], $meta['version_number'], $software, $files, $archives, $rows, count($files), $skipped, 0, $size, $warnings);
    }

    /**
     * Builds a pack from a CurseForge `manifest.json` that is already read, resolving every file through the API.
     *
     * @param  array<string, mixed>  $manifest
     * @param  Source  $source
     * @param  list<string>  $dirs
     * @param  PackMeta  $meta
     */
    public function fromCurseForgeManifest(array $manifest, array $source, array $dirs, array $meta, bool $withRows): ResolvedPack
    {
        $minecraft = Json::object($manifest['minecraft'] ?? null);
        if (! is_string($minecraft['version'] ?? null) || ! is_array($manifest['files'] ?? null)) {
            throw new ContentUnavailableException('not_a_modpack', 'That file is not a Minecraft modpack.');
        }

        $software = $this->manifestSoftware($minecraft);

        $wanted = [];
        foreach ($manifest['files'] as $entry) {
            if (is_array($entry) && is_int($entry['projectID'] ?? null) && is_int($entry['fileID'] ?? null) && ($entry['required'] ?? true) !== false) {
                $wanted[$entry['fileID']] = $entry['projectID'];
            }
        }

        $fileRows = $this->curseForgeFiles(array_keys($wanted));
        $mods = $this->curseForgeMods(array_values(array_unique($wanted)));

        $warnings = [];
        $skipped = 0;
        $unverified = 0;
        $blocked = [];
        $candidates = [];

        foreach ($wanted as $fileId => $projectId) {
            $file = $fileRows[$fileId] ?? null;
            if ($file === null) {
                $blocked[] = "file $fileId";

                continue;
            }

            $class = is_int($mods[$projectId]['classId'] ?? null) ? $mods[$projectId]['classId'] : 6;
            if (isset(self::CLIENT_CLASSES[$class])) {
                $skipped++;

                continue;
            }
            if ($class !== 6) {
                // Worlds, data packs and anything else have no place in a server's mods folder.
                $skipped++;

                continue;
            }

            $candidates[] = ['file' => $file, 'project_id' => (string) $projectId];
        }

        $sides = $this->sides->forSha1(array_map(fn (array $candidate): ?string => $this->sha1Of($candidate['file']), $candidates));

        $files = [];
        $rows = [];
        foreach ($candidates as $candidate) {
            $file = $candidate['file'];
            $name = is_string($file['fileName'] ?? null) ? $file['fileName'] : null;
            $sha1 = $this->sha1Of($file);
            $side = $sha1 === null ? 'unknown' : ($sides[$sha1] ?? 'unknown');

            if ($side === 'client') {
                $skipped++;

                continue;
            }

            $url = is_string($file['downloadUrl'] ?? null) && $file['downloadUrl'] !== '' ? $file['downloadUrl'] : null;
            if ($name === null || $url === null || $sha1 === null) {
                $blocked[] = $name ?? 'a file';

                continue;
            }

            if ($side === 'unknown') {
                $unverified++;
            }

            $files[] = $this->checkedFile('mods/'.$name, $url, $sha1, null, is_int($file['fileLength'] ?? null) ? $file['fileLength'] : null);

            if ($withRows) {
                $mod = $mods[(int) $candidate['project_id']] ?? [];
                $logo = is_array($mod['logo'] ?? null) ? $mod['logo'] : [];
                $rows[] = [
                    'provider' => 'curseforge',
                    'project_id' => $candidate['project_id'],
                    'version_id' => Json::id($file['id'] ?? null),
                    'slug' => is_string($mod['slug'] ?? null) ? $mod['slug'] : null,
                    'title' => is_string($mod['name'] ?? null) ? $mod['name'] : $name,
                    'icon_url' => is_string($logo['thumbnailUrl'] ?? null) ? $logo['thumbnailUrl'] : null,
                    'filename' => $name,
                    'version_number' => is_string($file['displayName'] ?? null) ? $file['displayName'] : $name,
                    'sha512' => null,
                    'sha1' => $sha1,
                    'install_dir' => 'mods',
                    'project_type' => 'mod',
                ];
            }
        }

        if ($blocked !== []) {
            $warnings[] = count($blocked).' files cannot be downloaded by other sites and were left out: '.implode(', ', array_slice($blocked, 0, 5)).(count($blocked) > 5 ? ', and more' : '').'.';
        }
        if ($unverified > 0) {
            $warnings[] = "$unverified mods could not be checked against Modrinth, so some of them may be client-only.";
        }

        $archives = [];
        $overrides = is_string($manifest['overrides'] ?? null) && $manifest['overrides'] !== '' ? mb_trim($manifest['overrides'], '/') : 'overrides';
        if (in_array($overrides, $dirs, true)) {
            $archives[] = $this->archive($source, "$overrides/", "$overrides/");
        }

        $size = array_sum(array_map(fn (array $file): int => $file['size'] ?? 0, $files)) + (int) ($source['size'] ?? 0);

        return new ResolvedPack($meta['provider'], $meta['project_id'], $meta['version_id'], $meta['title'], $meta['icon_url'], $meta['version_number'], $software, $files, $archives, $rows, count($files), $skipped, $unverified, $size, $warnings);
    }

    /**
     * The one folder every entry of an archive sits in, as `Name/`, or an empty string.
     *
     * @param  list<string>  $names
     */
    public function commonTopFolder(array $names): string
    {
        $tops = [];
        foreach ($names as $name) {
            if ($name === '' || str_starts_with($name, '__MACOSX/')) {
                continue;
            }
            $slash = mb_strpos($name, '/');
            if ($slash === false) {
                return '';
            }
            $tops[mb_substr($name, 0, $slash)] = true;
        }

        return count($tops) === 1 ? array_key_first($tops).'/' : '';
    }

    private function resolveModrinth(string $projectId, string $versionId, bool $withRows): ResolvedPack
    {
        $project = $this->modrinth->project($projectId);
        if (ModrinthClient::sideOf($project) === 'client') {
            throw new ClientOnlyException(is_string($project['title'] ?? null) ? $project['title'] : null);
        }

        $version = $this->modrinthProvider->version($projectId, $versionId);
        if ($version['project_id'] !== $projectId) {
            throw new ContentUnavailableException('wrong_project', 'That version does not belong to the selected modpack.');
        }

        $raw = $this->modrinth->version($versionId);
        $file = $this->mrpackFileOf($raw);
        if ($file === null) {
            throw new ContentUnavailableException('not_a_modpack', 'That version has no .mrpack file.');
        }

        $this->assertHost($file['url'], ['cdn.modrinth.com']);

        $cached = Cache::remember("content:mrpack:$versionId", self::CACHE_TTL, function () use ($file): array {
            $path = $this->archives->download($file['url'], ['cdn.modrinth.com']);
            try {
                $zip = new ZipArchive;
                if ($zip->open($path, ZipArchive::RDONLY) !== true) {
                    throw new ContentUnavailableException('not_a_modpack', 'That file is not a valid modpack.');
                }

                try {
                    $json = $this->readEntry($zip, 'modrinth.index.json') ?? throw new ContentUnavailableException('not_a_modpack', 'That file is not a Modrinth modpack.');

                    return ['index' => $this->decode($json), 'dirs' => $this->topLevelDirs($zip)];
                } finally {
                    $zip->close();
                }
            } finally {
                @unlink($path);
            }
        });

        /** @var array{index: array<string, mixed>, dirs: list<string>} $cached */
        $meta = ['provider' => 'modrinth', 'project_id' => $projectId, 'version_id' => $versionId, 'title' => is_string($project['title'] ?? null) ? $project['title'] : $projectId, 'icon_url' => is_string($project['icon_url'] ?? null) ? $project['icon_url'] : null, 'version_number' => $version['version_number'] ?? ''];

        return $this->fromMrpackIndex($cached['index'], ['url' => $file['url'], 'sha1' => $file['sha1'], 'size' => $file['size']], $cached['dirs'], $meta, $withRows);
    }

    private function resolveCurseForge(string $projectId, string $versionId, bool $withRows): ResolvedPack
    {
        $project = $this->curseForgeProvider->project($projectId);
        $file = $this->objectOf($this->curseForge->get("/mods/$projectId/files/$versionId")['data'] ?? null);
        if (($file['modId'] ?? null) !== (int) $projectId) {
            throw new ContentUnavailableException('wrong_project', 'That file does not belong to the selected modpack.');
        }

        $meta = ['provider' => 'curseforge', 'project_id' => $projectId, 'version_id' => $versionId, 'title' => $project['title'] ?? $projectId, 'icon_url' => $project['icon_url'], 'version_number' => is_string($file['displayName'] ?? null) ? $file['displayName'] : (is_string($file['fileName'] ?? null) ? $file['fileName'] : $versionId)];

        $serverPackId = $file['serverPackFileId'] ?? null;
        if (is_int($serverPackId) && $serverPackId > 0) {
            return $this->resolveServerPack($projectId, $serverPackId, $file, $meta);
        }

        $url = $this->downloadUrl($file, $project['page_url']);
        $sha1 = $this->sha1Of($file);
        $cached = Cache::remember("content:cf-pack:$versionId", self::CACHE_TTL, function () use ($url): array {
            $path = $this->archives->download($url, $this->curseForgeProvider->downloadHosts());
            try {
                $zip = new ZipArchive;
                if ($zip->open($path, ZipArchive::RDONLY) !== true) {
                    throw new ContentUnavailableException('not_a_modpack', 'That file is not a valid modpack.');
                }

                try {
                    $json = $this->readEntry($zip, 'manifest.json') ?? throw new ContentUnavailableException('not_a_modpack', 'That file is not a CurseForge modpack.');

                    return ['manifest' => $this->decode($json), 'dirs' => $this->topLevelDirs($zip)];
                } finally {
                    $zip->close();
                }
            } finally {
                @unlink($path);
            }
        });

        /** @var array{manifest: array<string, mixed>, dirs: list<string>} $cached */
        return $this->fromCurseForgeManifest($cached['manifest'], ['url' => $url, 'sha1' => $sha1, 'size' => is_int($file['fileLength'] ?? null) ? $file['fileLength'] : 0], $cached['dirs'], $meta, $withRows);
    }

    /**
     * The modpack's own server pack: one archive, with its top folder stripped when it has one.
     *
     * @param  array<string, mixed>  $mainFile
     * @param  PackMeta  $meta
     */
    private function resolveServerPack(string $projectId, int $serverPackId, array $mainFile, array $meta): ResolvedPack
    {
        $pack = $this->objectOf($this->curseForge->get("/mods/$projectId/files/$serverPackId")['data'] ?? null);
        $url = $this->downloadUrl($pack, null);
        $sha1 = $this->sha1Of($pack) ?? throw new ContentUnavailableException('invalid_pack', 'CurseForge did not list a hash for the server pack.');

        $warnings = [];
        $names = $this->archives->names($url, $this->curseForgeProvider->downloadHosts());
        $strip = '';
        $jars = 0;
        if ($names === null) {
            $warnings[] = 'The server pack could not be inspected, so its files are unpacked as they are.';
        } else {
            $strip = $this->commonTopFolder($names);
            $jars = count(array_filter($names, fn (string $name): bool => str_ends_with(mb_strtolower($name), '.jar') && str_contains($name, 'mods/')));
        }

        $software = $this->serverPackSoftware($pack, $mainFile);
        $archive = ['url' => $url, 'local' => null, 'sha1' => $sha1, 'strip' => $strip, 'into' => '', 'only' => $strip === '' ? null : $strip];

        return new ResolvedPack($meta['provider'], $meta['project_id'], $meta['version_id'], $meta['title'], $meta['icon_url'], $meta['version_number'], $software, [], [$this->normalizeArchive($archive)], [], $jars, 0, 0, is_int($pack['fileLength'] ?? null) ? $pack['fileLength'] : 0, $warnings);
    }

    /**
     * The software a server pack runs on: the Minecraft version and loader its file lists. The loader version is left
     * blank (latest stable) because a server pack carries no manifest.
     *
     * @param  array<string, mixed>  $pack
     * @param  array<string, mixed>  $main
     * @return array{type: string, minecraft: string, loader: string|null}
     */
    private function serverPackSoftware(array $pack, array $main): array
    {
        $entries = [];
        foreach ([$pack, $main] as $file) {
            foreach (is_array($file['gameVersions'] ?? null) ? $file['gameVersions'] : [] as $entry) {
                if (is_string($entry)) {
                    $entries[] = $entry;
                }
            }
        }

        $minecraft = null;
        $type = 'vanilla';
        foreach ($entries as $entry) {
            if (preg_match('/^\d+\.\d+(\.\d+)?$/', $entry) === 1 && ($minecraft === null || version_compare($entry, $minecraft, '>'))) {
                $minecraft = $entry;
            }
            if (in_array(mb_strtolower($entry), self::CURSEFORGE_LOADERS, true)) {
                $type = mb_strtolower($entry);
            }
        }

        if ($minecraft === null) {
            throw new ContentUnavailableException('invalid_pack', 'The server pack does not say which Minecraft version it needs.');
        }

        return ['type' => $type, 'minecraft' => $minecraft, 'loader' => null];
    }

    /**
     * @param  array<string, mixed>  $dependencies
     * @return array{type: string, minecraft: string, loader: string|null}
     */
    private function mrpackSoftware(array $dependencies): array
    {
        $minecraft = $dependencies['minecraft'] ?? null;
        if (! is_string($minecraft)) {
            throw new ContentUnavailableException('not_a_modpack', 'The modpack does not say which Minecraft version it needs.');
        }

        foreach (self::MODRINTH_LOADER_KEYS as $key => $type) {
            if (is_string($dependencies[$key] ?? null)) {
                return ['type' => $type, 'minecraft' => $minecraft, 'loader' => $dependencies[$key]];
            }
        }

        return ['type' => 'vanilla', 'minecraft' => $minecraft, 'loader' => null];
    }

    /**
     * @param  array<string, mixed>  $minecraft
     * @return array{type: string, minecraft: string, loader: string|null}
     */
    private function manifestSoftware(array $minecraft): array
    {
        $loaders = array_values(array_filter(is_array($minecraft['modLoaders'] ?? null) ? $minecraft['modLoaders'] : [], is_array(...)));
        $chosen = array_find($loaders, fn (array $loader): bool => ($loader['primary'] ?? false) === true) ?? ($loaders[0] ?? null);
        $id = is_array($chosen) && is_string($chosen['id'] ?? null) ? $chosen['id'] : null;

        if ($id !== null && preg_match('/^(forge|fabric|quilt|neoforge)-(.+)$/i', $id, $matches) === 1) {
            return ['type' => mb_strtolower($matches[1]), 'minecraft' => Json::id($minecraft['version'] ?? null), 'loader' => $matches[2]];
        }

        return ['type' => 'vanilla', 'minecraft' => Json::id($minecraft['version'] ?? null), 'loader' => null];
    }

    /**
     * @param  array<string, mixed>  $file
     * @return PackFile
     */
    private function mrpackFile(array $file): array
    {
        $path = $file['path'] ?? null;
        $downloads = is_array($file['downloads'] ?? null) ? array_values(array_filter($file['downloads'], is_string(...))) : [];
        $hashes = is_array($file['hashes'] ?? null) ? $file['hashes'] : [];

        $url = array_find($downloads, fn (string $candidate): bool => InstallPlan::isAllowedUrl($candidate));
        if ($url === null) {
            $host = $downloads === [] ? null : parse_url($downloads[0], PHP_URL_HOST);

            throw new ContentUnavailableException('foreign_host', 'This modpack downloads files from a site other than the Modrinth CDN, which is not allowed.', ['host' => is_string($host) ? $host : null]);
        }

        return $this->checkedFile(is_string($path) ? $path : '', $url, is_string($hashes['sha1'] ?? null) ? $hashes['sha1'] : null, is_string($hashes['sha512'] ?? null) ? $hashes['sha512'] : null, is_int($file['fileSize'] ?? null) ? $file['fileSize'] : null);
    }

    /**
     * @return PackFile
     */
    private function checkedFile(string $path, string $url, ?string $sha1, ?string $sha512, ?int $size): array
    {
        try {
            InstallPlan::safePath($path);
        } catch (InvalidInstallPlanException $exception) {
            throw new ContentUnavailableException('invalid_pack', 'The modpack lists a file outside the server folder: '.$exception->getMessage());
        }

        if (str_starts_with($path, '.astrelyse')) {
            throw new ContentUnavailableException('invalid_pack', 'The modpack lists a file in a reserved folder.');
        }

        if (! InstallPlan::isAllowedUrl($url)) {
            throw new ContentUnavailableException('foreign_host', 'This modpack downloads files from a site that is not allowed.', ['host' => parse_url($url, PHP_URL_HOST) ?: null]);
        }

        if (($sha1 === null || $sha1 === '') && ($sha512 === null || $sha512 === '')) {
            throw new ContentUnavailableException('invalid_pack', "The modpack lists $path without a hash.");
        }

        return ['path' => $path, 'url' => $url, 'sha1' => $sha1 === '' ? null : $sha1, 'sha512' => $sha512 === '' ? null : $sha512, 'size' => $size];
    }

    /**
     * @param  Source  $source
     * @return PackArchive
     */
    private function archive(array $source, string $only, string $strip): array
    {
        return $this->normalizeArchive(['url' => $source['url'] ?? null, 'local' => $source['local'] ?? null, 'sha1' => $source['sha1'] ?? null, 'strip' => $strip, 'into' => '', 'only' => $only]);
    }

    /**
     * @param  array{url: string|null, local: string|null, sha1: string|null, strip: string, into: string, only: string|null}  $archive
     * @return PackArchive
     */
    private function normalizeArchive(array $archive): array
    {
        if ($archive['url'] !== null && ! InstallPlan::isAllowedUrl($archive['url'])) {
            throw new ContentUnavailableException('foreign_host', 'That archive is not hosted on an allowed download server.', ['host' => parse_url($archive['url'], PHP_URL_HOST) ?: null]);
        }

        return $archive;
    }

    /**
     * @param  list<PackFile>  $files
     * @return list<PackMod>
     */
    private function modrinthRows(array $files): array
    {
        $jars = array_values(array_filter($files, fn (array $file): bool => preg_match('#^mods/[^/]+\.jar$#i', $file['path']) === 1 && $file['sha1'] !== null));
        $versions = $this->modrinth->versionsByHashes(array_map(fn (array $file): string => (string) $file['sha1'], $jars), 'sha1');
        $projects = $this->modrinth->projects(array_values(array_filter(array_map(fn (array $version): mixed => $version['project_id'] ?? null, $versions), is_string(...))));

        $rows = [];
        foreach ($jars as $file) {
            $version = $versions[$file['sha1']] ?? null;
            $projectId = is_array($version) && is_string($version['project_id'] ?? null) ? $version['project_id'] : null;
            if ($version === null || $projectId === null || ! is_string($version['id'] ?? null)) {
                continue;
            }

            $project = $projects[$projectId] ?? [];
            $rows[] = [
                'provider' => 'modrinth',
                'project_id' => $projectId,
                'version_id' => $version['id'],
                'slug' => is_string($project['slug'] ?? null) ? $project['slug'] : null,
                'title' => is_string($project['title'] ?? null) ? $project['title'] : basename($file['path']),
                'icon_url' => is_string($project['icon_url'] ?? null) ? $project['icon_url'] : null,
                'filename' => basename($file['path']),
                'version_number' => is_string($version['version_number'] ?? null) ? $version['version_number'] : '',
                'sha512' => $file['sha512'],
                'sha1' => $file['sha1'],
                'install_dir' => 'mods',
                'project_type' => 'mod',
            ];
        }

        return $rows;
    }

    /**
     * @param  array<string, mixed>  $version
     * @return array{url: string, sha1: string|null, size: int}|null
     */
    private function mrpackFileOf(array $version): ?array
    {
        $files = array_values(array_filter(is_array($version['files'] ?? null) ? $version['files'] : [], is_array(...)));
        $file = array_find($files, fn (array $f): bool => is_string($f['filename'] ?? null) && str_ends_with(mb_strtolower($f['filename']), '.mrpack') && ($f['primary'] ?? false) === true)
            ?? array_find($files, fn (array $f): bool => is_string($f['filename'] ?? null) && str_ends_with(mb_strtolower($f['filename']), '.mrpack'));
        if ($file === null || ! is_string($file['url'] ?? null)) {
            return null;
        }

        $hashes = is_array($file['hashes'] ?? null) ? $file['hashes'] : [];

        return ['url' => $file['url'], 'sha1' => is_string($hashes['sha1'] ?? null) ? $hashes['sha1'] : null, 'size' => is_int($file['size'] ?? null) ? $file['size'] : 0];
    }

    /**
     * @param  list<int>  $ids
     * @return array<int, array<string, mixed>>
     */
    private function curseForgeFiles(array $ids): array
    {
        $found = [];
        foreach (array_chunk($ids, self::BATCH) as $chunk) {
            $body = $this->curseForge->post('/mods/files', ['fileIds' => $chunk]);
            foreach (Json::rows($body['data'] ?? null) as $file) {
                if (is_int($file['id'] ?? null)) {
                    $found[$file['id']] = $file;
                }
            }
        }

        return $found;
    }

    /**
     * @param  list<int>  $ids
     * @return array<int, array<string, mixed>>
     */
    private function curseForgeMods(array $ids): array
    {
        $found = [];
        foreach (array_chunk($ids, self::BATCH) as $chunk) {
            $body = $this->curseForge->post('/mods', ['modIds' => $chunk, 'filterPcOnly' => true]);
            foreach (Json::rows($body['data'] ?? null) as $mod) {
                if (is_int($mod['id'] ?? null)) {
                    $found[$mod['id']] = $mod;
                }
            }
        }

        return $found;
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

    /**
     * @param  array<string, mixed>  $file
     */
    private function downloadUrl(array $file, ?string $pageUrl): string
    {
        $url = $file['downloadUrl'] ?? null;
        if (! is_string($url) || $url === '') {
            throw new NotDistributableException($pageUrl);
        }
        $this->assertHost($url, $this->curseForgeProvider->downloadHosts());

        return $url;
    }

    /**
     * @param  list<string>  $hosts
     */
    private function assertHost(string $url, array $hosts): void
    {
        $parts = parse_url($url);
        if ($parts === false || ($parts['scheme'] ?? null) !== 'https' || ! in_array(mb_strtolower($parts['host'] ?? ''), $hosts, true) || isset($parts['user']) || isset($parts['pass']) || isset($parts['port'])) {
            throw new ContentUnavailableException('foreign_host', 'That file is not hosted on the provider\'s download servers.', ['host' => is_array($parts) ? ($parts['host'] ?? null) : null]);
        }
    }

    private function readEntry(ZipArchive $zip, string $name): ?string
    {
        $stat = $zip->statName($name);
        if ($stat === false || $stat['size'] > self::MAX_ENTRY_BYTES) {
            return null;
        }

        $content = $zip->getFromName($name);

        return $content === false ? null : $content;
    }

    /**
     * @return array<string, mixed>
     */
    private function decode(string $json): array
    {
        $data = json_decode($json, true);
        if (! is_array($data)) {
            throw new ContentUnavailableException('invalid_pack', 'The modpack\'s index is not valid JSON.');
        }

        return array_filter($data, is_string(...), ARRAY_FILTER_USE_KEY);
    }

    /**
     * @return list<string>
     */
    private function topLevelDirs(ZipArchive $zip): array
    {
        $dirs = [];
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $name = $zip->getNameIndex($i);
            if (is_string($name) && ($slash = mb_strpos($name, '/')) !== false) {
                $dirs[mb_substr($name, 0, $slash)] = true;
            }
        }

        return array_map('strval', array_keys($dirs));
    }

    /**
     * @return array<string, mixed>
     */
    private function objectOf(mixed $value): array
    {
        return is_array($value) ? array_filter($value, is_string(...), ARRAY_FILTER_USE_KEY) : [];
    }
}
