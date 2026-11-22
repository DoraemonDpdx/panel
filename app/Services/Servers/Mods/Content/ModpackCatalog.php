<?php

declare(strict_types=1);

namespace Pterodactyl\Services\Servers\Mods\Content;

use Pterodactyl\Exceptions\Mods\ClientOnlyException;
use Pterodactyl\Services\Servers\Mods\CurseForgeApi;
use Pterodactyl\Services\Servers\Mods\CurseForgeProvider;
use Pterodactyl\Services\Servers\Mods\Json;
use Pterodactyl\Services\Servers\Mods\ModProvider;
use Pterodactyl\Services\Servers\Mods\ModrinthClient;
use Pterodactyl\Services\Servers\Mods\ModrinthProvider;

/**
 * Searches modpacks and worlds. Unlike mods they are not limited to the server's loader: a modpack may change it, so
 * every row says which loader and Minecraft version it needs.
 *
 * @phpstan-import-type ModHit from ModProvider
 */
class ModpackCatalog
{
    public function __construct(
        private readonly ModrinthProvider $modrinth,
        private readonly CurseForgeProvider $curseForge,
        private readonly CurseForgeApi $api,
        private readonly ModrinthClient $modrinthClient,
    ) {}

    /**
     * @param  'modpack'|'world'  $type
     * @return array{data: list<array<string, mixed>>, total: int}
     */
    public function search(string $provider, string $type, string $query, ?string $gameVersion, int $offset, int $limit, string $sort): array
    {
        $result = $this->provider($provider)->search($query, $type, [], $gameVersion, $offset, $limit, $sort);

        $data = array_map(fn (array $hit): array => [
            ...$hit,
            'provider' => $provider,
            'loader' => $hit['loaders'][0] ?? null,
            'minecraft' => $this->newest($hit['game_versions']),
        ], $result['hits']);

        return ['data' => $data, 'total' => $result['total']];
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function versions(string $provider, string $projectId): array
    {
        return $provider === 'curseforge' ? $this->curseForgeVersions($projectId) : $this->modrinthVersions($projectId);
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function modrinthVersions(string $projectId): array
    {
        $project = $this->modrinthClient->project($projectId);
        if (ModrinthClient::sideOf($project) === 'client') {
            throw new ClientOnlyException(is_string($project['title'] ?? null) ? $project['title'] : null);
        }

        $rows = [];
        foreach ($this->modrinth->versions($projectId, [], null) as $version) {
            if ($version['file'] === null || ! str_ends_with(mb_strtolower((string) $version['file']['filename']), '.mrpack')) {
                continue;
            }

            $rows[] = [
                'provider' => 'modrinth',
                'id' => $version['id'],
                'name' => $version['name'],
                'version_number' => $version['version_number'],
                'version_type' => $version['version_type'],
                'date_published' => $version['date_published'],
                'game_versions' => $version['game_versions'],
                'loaders' => $version['loaders'],
                'loader' => $version['loaders'][0] ?? null,
                'minecraft' => $this->newest($version['game_versions']),
                'size' => $version['file']['size'],
                'file' => ['filename' => $version['file']['filename'], 'size' => $version['file']['size'], 'sha1' => $version['file']['sha1']],
                'server_pack' => false,
            ];
        }

        return $rows;
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function curseForgeVersions(string $projectId): array
    {
        $body = $this->api->get("/mods/$projectId/files", ['pageSize' => 50]);
        $files = array_values(array_filter(is_array($body['data'] ?? null) ? $body['data'] : [], fn (mixed $file): bool => is_array($file) && ($file['isAvailable'] ?? true) !== false && ($file['isServerPack'] ?? false) !== true));
        usort($files, fn (array $a, array $b): int => strcmp(is_string($b['fileDate'] ?? null) ? $b['fileDate'] : '', is_string($a['fileDate'] ?? null) ? $a['fileDate'] : ''));

        $rows = [];
        foreach ($files as $file) {
            $entries = array_values(array_filter(is_array($file['gameVersions'] ?? null) ? $file['gameVersions'] : [], is_string(...)));
            $versions = array_values(array_filter($entries, fn (string $entry): bool => preg_match('/^\d/', $entry) === 1));
            $loaders = array_values(array_unique(array_filter(array_map(strtolower(...), $entries), fn (string $entry): bool => in_array($entry, ['forge', 'fabric', 'quilt', 'neoforge'], true))));

            $rows[] = [
                'provider' => 'curseforge',
                'id' => Json::id($file['id'] ?? null),
                'name' => is_string($file['displayName'] ?? null) ? $file['displayName'] : null,
                'version_number' => is_string($file['displayName'] ?? null) ? $file['displayName'] : (is_string($file['fileName'] ?? null) ? $file['fileName'] : null),
                'version_type' => match ($file['releaseType'] ?? null) {
                    1 => 'release',
                    2 => 'beta',
                    3 => 'alpha',
                    default => null,
                },
                'date_published' => is_string($file['fileDate'] ?? null) ? $file['fileDate'] : null,
                'game_versions' => $versions,
                'loaders' => $loaders,
                'loader' => $loaders[0] ?? null,
                'minecraft' => $this->newest($versions),
                'size' => is_int($file['fileLength'] ?? null) ? $file['fileLength'] : 0,
                'file' => ['filename' => is_string($file['fileName'] ?? null) ? $file['fileName'] : null, 'size' => is_int($file['fileLength'] ?? null) ? $file['fileLength'] : 0, 'sha1' => null],
                'server_pack' => is_int($file['serverPackFileId'] ?? null) && $file['serverPackFileId'] > 0,
            ];
        }

        return $rows;
    }

    private function provider(string $key): ModProvider
    {
        return $key === 'curseforge' ? $this->curseForge : $this->modrinth;
    }

    /**
     * @param  list<string>  $versions
     */
    private function newest(array $versions): ?string
    {
        $releases = array_values(array_filter($versions, fn (string $version): bool => preg_match('/^\d+(\.\d+)*$/', $version) === 1));
        if ($releases === []) {
            return $versions[0] ?? null;
        }

        usort($releases, fn (string $a, string $b): int => version_compare($b, $a));

        return $releases[0];
    }
}
