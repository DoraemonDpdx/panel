<?php

declare(strict_types=1);

namespace Pterodactyl\Services\Servers\Mods;

use Illuminate\Support\Facades\Cache;

/**
 * CurseForge Core API (https://docs.curseforge.com). Needs an API key from the admin settings.
 *
 * @phpstan-import-type ModVersion from ModProvider
 * @phpstan-import-type ModProject from ModProvider
 */
class CurseForgeProvider implements ModProvider
{
    /** Class IDs: Mc mods, Bukkit plugins, modpacks and worlds. */
    public const array CLASS_IDS = ['mod' => 6, 'plugin' => 5, 'modpack' => 4471, 'world' => 17];

    /** Minecraft on CurseForge. */
    private const int GAME_ID = 432;

    /** ModLoaderType values. Plugin platforms have none and are filtered by game version only. */
    private const array LOADER_TYPES = ['forge' => 1, 'fabric' => 4, 'quilt' => 5, 'neoforge' => 6];

    /** ModsSearchSortField values: 2 popularity, 3 last updated, 6 total downloads, 11 released date. */
    private const array SORT_FIELDS = ['relevance' => 2, 'downloads' => 6, 'updated' => 3, 'newest' => 11];

    private const array KNOWN_LOADERS = ['forge', 'fabric', 'quilt', 'neoforge', 'bukkit', 'spigot', 'paper', 'purpur', 'folia', 'sponge', 'velocity', 'bungeecord', 'waterfall'];

    private const int SEARCH_TTL = 300;

    private const int PROJECT_TTL = 600;

    private const int UPDATE_TTL = 600;

    private const int MAX_WINDOW = 10000;

    public function __construct(private readonly CurseForgeApi $api, private readonly SideChecker $sides) {}

    public function key(): string
    {
        return 'curseforge';
    }

    public function available(): bool
    {
        return $this->api->available();
    }

    public function idPattern(): string
    {
        return '/^\d{1,10}$/';
    }

    public function downloadHosts(): array
    {
        return ['edge.forgecdn.net', 'mediafilez.forgecdn.net'];
    }

    public function search(string $query, string $projectType, array $loaders, ?string $gameVersion, int $offset, int $limit, string $sort, ?string $category = null): array
    {
        if ($offset >= self::MAX_WINDOW) {
            return ['hits' => [], 'total' => 0];
        }

        $types = $this->loaderTypes($loaders);
        $params = array_filter([
            'gameId' => self::GAME_ID,
            'classId' => self::CLASS_IDS[$projectType] ?? self::CLASS_IDS['mod'],
            'searchFilter' => $query !== '' ? $query : null,
            'gameVersion' => $gameVersion,
            // The API only honours a loader together with a game version.
            'modLoaderType' => $gameVersion !== null && count($types) === 1 ? $types[0] : null,
            'modLoaderTypes' => $gameVersion !== null && count($types) > 1 ? '['.implode(',', $types).']' : null,
            'categoryId' => $category !== null && ctype_digit($category) ? (int) $category : null,
            'sortField' => self::SORT_FIELDS[$sort] ?? self::SORT_FIELDS['relevance'],
            'sortOrder' => 'desc',
            'index' => $offset,
            'pageSize' => min($limit, 50, self::MAX_WINDOW - $offset),
        ], fn (mixed $value): bool => $value !== null);

        $body = Cache::remember('curseforge:search:'.hash('xxh128', json_encode($params, JSON_THROW_ON_ERROR)), self::SEARCH_TTL, fn (): array => $this->api->get('/mods/search', $params));

        $mods = $this->rows($body['data'] ?? null);
        if ($projectType === 'mod' && $types !== []) {
            // The loader parameter is only a hint to CurseForge, so check the files it lists as well.
            $mods = array_values(array_filter($mods, fn (array $mod): bool => $this->builtFor($mod, $types, $gameVersion)));
        }

        $sides = $projectType === 'mod' ? $this->sides->forSha1(array_merge([], ...array_map($this->sampleHashes(...), $mods))) : [];

        $hits = [];
        foreach ($mods as $mod) {
            $side = $projectType === 'mod' ? $this->projectSide($mod, $sides) : ($projectType === 'plugin' ? 'server' : 'both');
            if ($side === 'client') {
                continue;
            }

            $project = $this->normalizeProject($mod);
            $authors = is_array($mod['authors'] ?? null) ? $mod['authors'] : [];
            $categories = is_array($mod['categories'] ?? null) ? $mod['categories'] : [];
            [$gameVersions, $modLoaders] = $this->indexVersions($mod);

            $hits[] = [
                'project_id' => $this->id($mod['id'] ?? null),
                'slug' => $project['slug'],
                'title' => $project['title'],
                'description' => is_string($mod['summary'] ?? null) ? $mod['summary'] : null,
                'icon_url' => $project['icon_url'],
                'downloads' => $this->int($mod['downloadCount'] ?? null),
                'author' => is_array($authors[0] ?? null) && is_string($authors[0]['name'] ?? null) ? $authors[0]['name'] : null,
                'categories' => array_values(array_filter(array_map(fn (mixed $c): mixed => is_array($c) ? ($c['name'] ?? null) : null, $categories), is_string(...))),
                'page_url' => $project['page_url'],
                'distributable' => $project['distributable'],
                'side' => $side,
                'game_versions' => $gameVersions,
                'loaders' => $modLoaders,
            ];
        }

        $pagination = is_array($body['pagination'] ?? null) ? $body['pagination'] : [];

        return ['hits' => $hits, 'total' => is_int($pagination['totalCount'] ?? null) ? $pagination['totalCount'] : count($hits)];
    }

    public function versions(string $projectId, array $loaders, ?string $gameVersion): array
    {
        $project = $this->project($projectId);
        $types = $this->loaderTypes($loaders);
        $params = array_filter([
            'gameVersion' => $gameVersion,
            'modLoaderType' => $gameVersion !== null && count($types) === 1 ? $types[0] : null,
            'pageSize' => 50,
        ], fn (mixed $value): bool => $value !== null);

        $body = $this->api->get("/mods/$projectId/files", $params);
        $files = array_values(array_filter($this->rows($body['data'] ?? null), fn (array $file): bool => ($file['isAvailable'] ?? true) !== false));
        usort($files, fn (array $a, array $b): int => strcmp(is_string($b['fileDate'] ?? null) ? $b['fileDate'] : '', is_string($a['fileDate'] ?? null) ? $a['fileDate'] : ''));

        $versions = array_map(fn (array $file): array => $this->normalizeFile($file, $projectId, $project, 'unknown'), $files);

        // Strict loader: a file built for another loader never shows. Plugin platforms list no loader on some files.
        $versions = array_values(array_filter($versions, fn (array $version): bool => $loaders === []
            || array_intersect($loaders, $version['loaders']) !== []
            || ($types === [] && $version['loaders'] === [])));

        $sides = $types === [] ? [] : $this->sides->forSha1(array_map(fn (array $version): ?string => $version['file']['sha1'] ?? null, $versions));
        $rows = [];
        foreach ($versions as $version) {
            $side = $types === [] ? 'server' : ($sides[mb_strtolower((string) ($version['file']['sha1'] ?? ''))] ?? 'unknown');
            if ($side !== 'client') {
                $rows[] = [...$version, 'side' => $side];
            }
        }

        return $rows;
    }

    public function version(string $projectId, string $versionId): array
    {
        $body = $this->api->get("/mods/$projectId/files/$versionId");
        $file = $this->object($body['data'] ?? null);
        $version = $this->normalizeFile($file, $projectId, $this->project($projectId), 'unknown');

        // Plugin files have no loader; mod files are checked against Modrinth.
        $isMod = array_intersect($version['loaders'], array_keys(self::LOADER_TYPES)) !== [];
        $side = $isMod ? ($this->sides->forSha1([$version['file']['sha1'] ?? null])[mb_strtolower((string) ($version['file']['sha1'] ?? ''))] ?? 'unknown') : 'server';

        return [...$version, 'side' => $side];
    }

    public function project(string $projectId): array
    {
        $body = Cache::remember("curseforge:project:$projectId", self::PROJECT_TTL, fn (): array => $this->api->get("/mods/$projectId"));

        return $this->normalizeProject($this->object($body['data'] ?? null));
    }

    public function details(string $projectId): array
    {
        $body = Cache::remember("curseforge:project:$projectId", self::PROJECT_TTL, fn (): array => $this->api->get("/mods/$projectId"));
        $mod = $this->object($body['data'] ?? null);
        $description = Cache::remember("curseforge:description:$projectId", self::PROJECT_TTL, fn (): array => $this->api->get("/mods/$projectId/description"));

        $text = is_string($description['data'] ?? null) ? $description['data'] : (is_string($mod['summary'] ?? null) ? $mod['summary'] : '');
        $text = (string) preg_replace('#<(script|style)\b[^>]*>.*?</\1>#is', '', $text);
        $text = (string) preg_replace('#<\s*(br|/p|/div|/li|/h[1-6])\s*/?>#i', "\n", $text);
        $text = html_entity_decode(strip_tags($text), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $text = mb_trim((string) preg_replace(["/[ \t]+/", "/\n{3,}/"], [' ', "\n\n"], $text));

        $gallery = [];
        foreach (is_array($mod['screenshots'] ?? null) ? $mod['screenshots'] : [] as $shot) {
            if (is_array($shot) && ModrinthProvider::https($shot['url'] ?? null) !== null) {
                $gallery[] = ['url' => Json::id($shot['url']), 'title' => is_string($shot['title'] ?? null) ? $shot['title'] : null];
            }
        }
        $links = is_array($mod['links'] ?? null) ? $mod['links'] : [];

        return [
            'project_id' => $projectId,
            'body' => mb_strcut($text, 0, 20480),
            'gallery' => array_slice($gallery, 0, 8),
            'links' => [
                'source' => ModrinthProvider::https($links['sourceUrl'] ?? null),
                'issues' => ModrinthProvider::https($links['issuesUrl'] ?? null),
                'wiki' => ModrinthProvider::https($links['wikiUrl'] ?? null),
                'discord' => null,
            ],
        ];
    }

    public function categories(string $projectType): array
    {
        $classId = self::CLASS_IDS[$projectType] ?? self::CLASS_IDS['mod'];
        $body = Cache::remember("curseforge:categories:$classId", 3600, fn (): array => $this->api->get('/categories', ['gameId' => self::GAME_ID, 'classId' => $classId]));

        $rows = [];
        foreach ($this->rows($body['data'] ?? null) as $category) {
            if (($category['isClass'] ?? false) !== true && isset($category['id']) && is_string($category['name'] ?? null)) {
                $rows[] = ['id' => $this->id($category['id']), 'label' => $category['name']];
            }
        }

        return $rows;
    }

    public function latestFor(iterable $installs, array $loaders, ?string $gameVersion): array
    {
        $ids = [];
        foreach ($installs as $install) {
            if (preg_match($this->idPattern(), $install->project_id) === 1) {
                $ids[] = (int) $install->project_id;
            }
        }
        if ($ids === []) {
            return [];
        }

        $payload = ['modIds' => $ids, 'filterPcOnly' => true];
        $body = Cache::remember('curseforge:updates:'.hash('xxh128', json_encode($payload, JSON_THROW_ON_ERROR)), self::UPDATE_TTL, fn (): array => $this->api->post('/mods', $payload));

        $types = $this->loaderTypes($loaders);
        $updates = [];
        foreach ($this->rows($body['data'] ?? null) as $mod) {
            $indexes = array_values(array_filter(is_array($mod['latestFilesIndexes'] ?? null) ? $mod['latestFilesIndexes'] : [], fn (mixed $index): bool => is_array($index)
                && ($gameVersion === null || ($index['gameVersion'] ?? null) === $gameVersion)
                // Plugin platforms have no loader type; mod loaders must match one of the accepted ones.
                && ($types === [] || in_array($index['modLoader'] ?? null, $types, true))));
            if ($indexes === []) {
                continue;
            }

            $releases = array_values(array_filter($indexes, fn (array $index): bool => ($index['releaseType'] ?? null) === 1));
            $pool = $releases !== [] ? $releases : $indexes;
            usort($pool, fn (array $a, array $b): int => $this->int($b['fileId'] ?? null) <=> $this->int($a['fileId'] ?? null));

            $updates[$this->id($mod['id'] ?? null)] = [
                'version_id' => $this->id($pool[0]['fileId'] ?? null),
                'version_number' => is_string($pool[0]['filename'] ?? null) ? $pool[0]['filename'] : '',
            ];
        }

        return $updates;
    }

    /**
     * @param  array<string, mixed>  $mod
     * @return ModProject
     */
    private function normalizeProject(array $mod): array
    {
        $links = is_array($mod['links'] ?? null) ? $mod['links'] : [];
        $logo = is_array($mod['logo'] ?? null) ? $mod['logo'] : [];

        return [
            'slug' => is_string($mod['slug'] ?? null) ? $mod['slug'] : null,
            'title' => is_string($mod['name'] ?? null) ? $mod['name'] : null,
            'icon_url' => is_string($logo['thumbnailUrl'] ?? null) ? $logo['thumbnailUrl'] : null,
            'page_url' => is_string($links['websiteUrl'] ?? null) ? $links['websiteUrl'] : null,
            // Only an explicit false forbids distribution; null means the author never set it.
            'distributable' => ($mod['allowModDistribution'] ?? null) !== false,
        ];
    }

    /**
     * @param  array<string, mixed>  $file
     * @param  ModProject  $project
     * @return ModVersion
     */
    private function normalizeFile(array $file, string $projectId, array $project, string $side): array
    {
        $url = is_string($file['downloadUrl'] ?? null) && $file['downloadUrl'] !== '' ? $file['downloadUrl'] : null;
        $entries = is_array($file['gameVersions'] ?? null) ? array_values(array_filter($file['gameVersions'], is_string(...))) : [];
        $loaders = array_values(array_filter(array_map(mb_strtolower(...), $entries), fn (string $entry): bool => in_array($entry, self::KNOWN_LOADERS, true)));
        $hashes = [];
        foreach (is_array($file['hashes'] ?? null) ? $file['hashes'] : [] as $hash) {
            if (is_array($hash) && is_string($hash['value'] ?? null)) {
                $hashes[$this->int($hash['algo'] ?? null)] = $hash['value'];
            }
        }
        $dependencies = array_values(array_filter(is_array($file['dependencies'] ?? null) ? $file['dependencies'] : [], is_array(...)));

        return [
            'id' => $this->id($file['id'] ?? null),
            'project_id' => $this->id($file['modId'] ?? $projectId),
            'name' => is_string($file['displayName'] ?? null) ? $file['displayName'] : null,
            'version_number' => is_string($file['displayName'] ?? null) ? $file['displayName'] : (is_string($file['fileName'] ?? null) ? $file['fileName'] : null),
            'version_type' => match ($file['releaseType'] ?? null) {
                1 => 'release',
                2 => 'beta',
                3 => 'alpha',
                default => null,
            },
            'date_published' => is_string($file['fileDate'] ?? null) ? $file['fileDate'] : null,
            'game_versions' => array_values(array_filter($entries, fn (string $entry): bool => preg_match('/^\d/', $entry) === 1)),
            'loaders' => array_values(array_unique($loaders)),
            'file' => ! is_string($file['fileName'] ?? null) ? null : [
                'filename' => $file['fileName'],
                'url' => $url,
                'size' => $this->int($file['fileLength'] ?? null),
                'sha512' => null,
                'sha1' => $hashes[1] ?? null,
            ],
            'dependencies' => array_map(fn (array $d): array => [
                'project_id' => isset($d['modId']) ? $this->id($d['modId']) : null,
                'version_id' => null,
                'dependency_type' => match ($d['relationType'] ?? null) {
                    3 => 'required',
                    2 => 'optional',
                    5 => 'incompatible',
                    default => 'embedded',
                },
            ], $dependencies),
            'distributable' => $project['distributable'] && $url !== null,
            'page_url' => $project['page_url'],
            'side' => $side,
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function rows(mixed $value): array
    {
        /** @var list<array<string, mixed>> */
        return is_array($value) ? array_values(array_filter($value, is_array(...))) : [];
    }

    /**
     * @return array<string, mixed>
     */
    private function object(mixed $value): array
    {
        return is_array($value) ? array_filter($value, is_string(...), ARRAY_FILTER_USE_KEY) : [];
    }

    private function int(mixed $value): int
    {
        return is_int($value) ? $value : (is_string($value) && ctype_digit($value) ? (int) $value : 0);
    }

    private function id(mixed $value): string
    {
        return is_int($value) || is_string($value) ? (string) $value : '';
    }

    /**
     * ModLoaderType values for the loaders that have one. Plugin platforms have none.
     *
     * @param  list<string>  $loaders
     * @return list<int>
     */
    private function loaderTypes(array $loaders): array
    {
        $types = [];
        foreach ($loaders as $loader) {
            if (isset(self::LOADER_TYPES[$loader])) {
                $types[] = self::LOADER_TYPES[$loader];
            }
        }

        return array_values(array_unique($types));
    }

    /**
     * Whether a search hit lists a file for one of the loader types, and the game version when given. A hit with no
     * file index at all is kept, since there is nothing to judge it by.
     *
     * @param  array<string, mixed>  $mod
     * @param  list<int>  $types
     */
    private function builtFor(array $mod, array $types, ?string $gameVersion): bool
    {
        $indexes = array_values(array_filter(is_array($mod['latestFilesIndexes'] ?? null) ? $mod['latestFilesIndexes'] : [], is_array(...)));
        if ($indexes === []) {
            return true;
        }

        return array_any($indexes, fn (array $index): bool => in_array($index['modLoader'] ?? null, $types, true) && ($gameVersion === null || ($index['gameVersion'] ?? null) === $gameVersion));
    }

    /**
     * The game versions and loaders of a search hit, from the files CurseForge lists as its latest.
     *
     * @param  array<string, mixed>  $mod
     * @return array{list<string>, list<string>}
     */
    private function indexVersions(array $mod): array
    {
        $names = [1 => 'forge', 4 => 'fabric', 5 => 'quilt', 6 => 'neoforge'];
        $versions = [];
        $loaders = [];
        foreach (is_array($mod['latestFilesIndexes'] ?? null) ? $mod['latestFilesIndexes'] : [] as $index) {
            if (! is_array($index)) {
                continue;
            }
            if (is_string($index['gameVersion'] ?? null)) {
                $versions[] = $index['gameVersion'];
            }
            if (is_int($index['modLoader'] ?? null) && isset($names[$index['modLoader']])) {
                $loaders[] = $names[$index['modLoader']];
            }
        }

        return [array_values(array_unique($versions)), array_values(array_unique($loaders))];
    }

    /**
     * A few sha1s of a hit's newest files, enough to find it on Modrinth.
     *
     * @param  array<string, mixed>  $mod
     * @return list<string>
     */
    private function sampleHashes(array $mod): array
    {
        $files = array_values(array_filter(is_array($mod['latestFiles'] ?? null) ? $mod['latestFiles'] : [], is_array(...)));
        usort($files, fn (array $a, array $b): int => $this->int($b['id'] ?? null) <=> $this->int($a['id'] ?? null));

        $hashes = [];
        foreach (array_slice($files, 0, 3) as $file) {
            foreach (is_array($file['hashes'] ?? null) ? $file['hashes'] : [] as $hash) {
                if (is_array($hash) && ($hash['algo'] ?? null) === 1 && is_string($hash['value'] ?? null)) {
                    $hashes[] = $hash['value'];
                }
            }
        }

        return $hashes;
    }

    /**
     * The first side Modrinth knows for any sampled file of the hit, or `unknown`.
     *
     * @param  array<string, mixed>  $mod
     * @param  array<string, string>  $sides
     */
    private function projectSide(array $mod, array $sides): string
    {
        foreach ($this->sampleHashes($mod) as $hash) {
            $side = $sides[mb_strtolower($hash)] ?? 'unknown';
            if ($side !== 'unknown') {
                return $side;
            }
        }

        return 'unknown';
    }
}
