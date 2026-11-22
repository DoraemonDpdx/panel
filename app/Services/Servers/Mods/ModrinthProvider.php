<?php

declare(strict_types=1);

namespace Pterodactyl\Services\Servers\Mods;

/**
 * @phpstan-import-type ModHit from ModProvider
 * @phpstan-import-type ModVersion from ModProvider
 * @phpstan-import-type ModProject from ModProvider
 */
class ModrinthProvider implements ModProvider
{
    private const array LOADER_SLUGS = [
        'fabric', 'quilt', 'forge', 'neoforge', 'liteloader', 'rift', 'modloader',
        'paper', 'purpur', 'folia', 'spigot', 'bukkit', 'sponge', 'velocity', 'bungeecord', 'waterfall',
        'datapack', 'minecraft', 'iris', 'optifine', 'canvas', 'vanilla',
    ];

    public function __construct(private readonly ModrinthClient $client) {}

    /**
     * The value when it is an https URL without userinfo, else null.
     */
    public static function https(mixed $value): ?string
    {
        if (! is_string($value) || mb_strlen($value) > 2048) {
            return null;
        }
        $parts = parse_url($value);

        return $parts !== false && ($parts['scheme'] ?? null) === 'https' && isset($parts['host']) && ! isset($parts['user']) && ! isset($parts['pass']) ? $value : null;
    }

    public function key(): string
    {
        return 'modrinth';
    }

    public function available(): bool
    {
        return true;
    }

    public function idPattern(): string
    {
        return '/^[A-Za-z0-9]{8}$/';
    }

    public function downloadHosts(): array
    {
        return ['cdn.modrinth.com'];
    }

    public function search(string $query, string $projectType, array $loaders, ?string $gameVersion, int $offset, int $limit, string $sort, ?string $category = null): array
    {
        $result = $this->client->search($query, $projectType, $loaders, $gameVersion, $offset, $limit, $sort, $category);

        $hits = array_map(function (array $hit) use ($projectType): array {
            $slug = is_string($hit['slug'] ?? null) ? $hit['slug'] : null;
            $categories = $hit['display_categories'] ?? $hit['categories'] ?? [];

            return [
                'project_id' => is_string($hit['project_id'] ?? null) ? $hit['project_id'] : '',
                'slug' => $slug,
                'title' => is_string($hit['title'] ?? null) ? $hit['title'] : null,
                'description' => is_string($hit['description'] ?? null) ? $hit['description'] : null,
                'icon_url' => is_string($hit['icon_url'] ?? null) ? $hit['icon_url'] : null,
                'downloads' => is_int($hit['downloads'] ?? null) ? $hit['downloads'] : 0,
                'author' => is_string($hit['author'] ?? null) ? $hit['author'] : null,
                // Modrinth lists loaders among the categories; the loader is already known here, so keep only real topics.
                'categories' => is_array($categories) ? array_values(array_filter($categories, fn (mixed $c): bool => is_string($c) && ! in_array($c, self::LOADER_SLUGS, true))) : [],
                'date_modified' => is_string($hit['date_modified'] ?? null) ? $hit['date_modified'] : null,
                'page_url' => $slug !== null ? "https://modrinth.com/$projectType/$slug" : null,
                'distributable' => true,
                'side' => ModrinthClient::sideOf($hit),
                'game_versions' => $this->strings($hit['versions'] ?? null),
                'loaders' => array_values(array_filter($this->strings($hit['categories'] ?? null), fn (string $c): bool => in_array($c, self::LOADER_SLUGS, true))),
            ];
        }, $result['hits']);

        return ['hits' => $hits, 'total' => $result['total_hits']];
    }

    public function versions(string $projectId, array $loaders, ?string $gameVersion): array
    {
        $side = ModrinthClient::sideOf($this->client->project($projectId));

        return array_values(array_filter(
            array_map(fn (array $version): array => $this->normalize($version, $side), $this->client->projectVersions($projectId, $loaders, $gameVersion)),
            fn (array $version): bool => $loaders === [] || array_intersect($loaders, $version['loaders']) !== [],
        ));
    }

    public function version(string $projectId, string $versionId): array
    {
        return $this->normalize($this->client->version($versionId), ModrinthClient::sideOf($this->client->project($projectId)));
    }

    /**
     * A version addressed by its ID or its version number, as shared links use.
     *
     * @return ModVersion
     */
    public function versionByReference(string $projectId, string $reference): array
    {
        return $this->normalize($this->client->projectVersion($projectId, $reference), ModrinthClient::sideOf($this->client->project($projectId)));
    }

    public function project(string $projectId): array
    {
        $project = $this->client->project($projectId);
        $slug = is_string($project['slug'] ?? null) ? $project['slug'] : null;
        $type = is_string($project['project_type'] ?? null) ? $project['project_type'] : 'mod';

        return [
            'slug' => $slug,
            'title' => is_string($project['title'] ?? null) ? $project['title'] : null,
            'icon_url' => is_string($project['icon_url'] ?? null) ? $project['icon_url'] : null,
            'page_url' => $slug !== null ? "https://modrinth.com/$type/$slug" : null,
            'distributable' => true,
        ];
    }

    public function details(string $projectId): array
    {
        $project = $this->client->project($projectId);
        $gallery = [];
        foreach (is_array($project['gallery'] ?? null) ? $project['gallery'] : [] as $image) {
            if (is_array($image) && self::https($image['url'] ?? null) !== null) {
                $gallery[] = ['url' => Json::id($image['url']), 'title' => is_string($image['title'] ?? null) ? $image['title'] : null];
            }
        }

        return [
            'project_id' => is_string($project['id'] ?? null) ? $project['id'] : $projectId,
            'body' => is_string($project['body'] ?? null) ? mb_strcut($project['body'], 0, 20480) : '',
            'gallery' => array_slice($gallery, 0, 8),
            'links' => [
                'source' => self::https($project['source_url'] ?? null),
                'issues' => self::https($project['issues_url'] ?? null),
                'wiki' => self::https($project['wiki_url'] ?? null),
                'discord' => self::https($project['discord_url'] ?? null),
            ],
        ];
    }

    public function categories(string $projectType): array
    {
        $rows = [];
        foreach ($this->client->categories() as $category) {
            if (($category['project_type'] ?? null) === $projectType && ($category['header'] ?? null) === 'categories' && is_string($category['name'] ?? null)) {
                $rows[] = ['id' => $category['name'], 'label' => ucfirst(str_replace('-', ' ', $category['name']))];
            }
        }

        return $rows;
    }

    public function latestFor(iterable $installs, array $loaders, ?string $gameVersion): array
    {
        $hashes = [];
        foreach ($installs as $install) {
            if ($install->sha512 !== null) {
                $hashes[] = $install->sha512;
            }
        }

        $updates = [];
        foreach ($this->client->latestForHashes($hashes, $loaders, $gameVersion === null ? [] : [$gameVersion]) as $version) {
            if (is_string($version['project_id'] ?? null) && is_string($version['id'] ?? null)) {
                $updates[$version['project_id']] = ['version_id' => $version['id'], 'version_number' => is_string($version['version_number'] ?? null) ? $version['version_number'] : ''];
            }
        }

        return $updates;
    }

    /**
     * @param  array<string, mixed>  $version
     * @return ModVersion
     */
    private function normalize(array $version, string $side): array
    {
        $files = array_values(array_filter(is_array($version['files'] ?? null) ? $version['files'] : [], is_array(...)));
        $file = array_find($files, fn (array $f): bool => ($f['primary'] ?? false) === true)
            ?? array_find($files, fn (array $f): bool => is_string($f['filename'] ?? null) && str_ends_with($f['filename'], '.jar'));

        $hashes = is_array($file['hashes'] ?? null) ? $file['hashes'] : [];
        $dependencies = array_values(array_filter(is_array($version['dependencies'] ?? null) ? $version['dependencies'] : [], is_array(...)));

        $projectId = is_string($version['project_id'] ?? null) ? $version['project_id'] : '';

        return [
            'id' => is_string($version['id'] ?? null) ? $version['id'] : '',
            'project_id' => $projectId,
            'name' => is_string($version['name'] ?? null) ? $version['name'] : null,
            'version_number' => is_string($version['version_number'] ?? null) ? $version['version_number'] : null,
            'version_type' => is_string($version['version_type'] ?? null) ? $version['version_type'] : null,
            'date_published' => is_string($version['date_published'] ?? null) ? $version['date_published'] : null,
            'game_versions' => $this->strings($version['game_versions'] ?? null),
            'loaders' => $this->strings($version['loaders'] ?? null),
            'file' => $file === null ? null : [
                'filename' => is_string($file['filename'] ?? null) ? $file['filename'] : null,
                'url' => is_string($file['url'] ?? null) ? $file['url'] : null,
                'size' => is_int($file['size'] ?? null) ? $file['size'] : 0,
                'sha512' => is_string($hashes['sha512'] ?? null) ? $hashes['sha512'] : null,
                'sha1' => is_string($hashes['sha1'] ?? null) ? $hashes['sha1'] : null,
            ],
            'dependencies' => array_map(fn (array $d): array => [
                'project_id' => is_string($d['project_id'] ?? null) ? $d['project_id'] : null,
                'version_id' => is_string($d['version_id'] ?? null) ? $d['version_id'] : null,
                'dependency_type' => is_string($d['dependency_type'] ?? null) ? $d['dependency_type'] : null,
            ], $dependencies),
            'distributable' => true,
            'page_url' => $projectId !== '' ? "https://modrinth.com/project/$projectId" : null,
            'side' => $side,
        ];
    }

    /**
     * @return list<string>
     */
    private function strings(mixed $value): array
    {
        return is_array($value) ? array_values(array_filter($value, is_string(...))) : [];
    }
}
