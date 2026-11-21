<?php

declare(strict_types=1);

namespace Pterodactyl\Services\Servers\Mods;

use Closure;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Pterodactyl\Exceptions\DisplayException;

/**
 * Thin client for the parts of the Modrinth v2 API the mod installer needs.
 *
 * @phpstan-type ModrinthVersion array<string, mixed>
 */
class ModrinthClient
{
    public const string BASE_URL = 'https://api.modrinth.com/v2';

    public const array SORTS = ['relevance', 'downloads', 'updated', 'newest'];

    private const int SEARCH_TTL = 300;

    private const int GAME_VERSION_TTL = 21600;

    private const int UPDATE_TTL = 600;

    private const int PROJECT_TTL = 600;

    /**
     * The side a project runs on, from its client_side and server_side flags: client (never on a server),
     * server (only on a server), both, or unknown.
     *
     * @param  array<string, mixed>  $project
     */
    public static function sideOf(array $project): string
    {
        return match ($project['server_side'] ?? null) {
            'unsupported' => 'client',
            'required', 'optional' => ($project['client_side'] ?? null) === 'unsupported' ? 'server' : 'both',
            default => 'unknown',
        };
    }

    /**
     * @param  list<string>  $loaders  any of these loaders matches; empty means any loader
     * @return array{hits: list<array<string, mixed>>, total_hits: int}
     */
    public function search(string $query, string $projectType, array $loaders, ?string $gameVersion, int $offset, int $limit, string $sort, ?string $category = null): array
    {
        // Leave out client-only projects (shaders, minimaps, performance mods like Sodium): they do
        // nothing on a server and some crash it on start.
        $facets = [["project_type:$projectType"], ['server_side:required', 'server_side:optional']];
        if ($loaders !== []) {
            $facets[] = array_map(fn (string $loader): string => "categories:$loader", $loaders);
        }
        if ($gameVersion !== null) {
            $facets[] = ["versions:$gameVersion"];
        }
        if ($category !== null) {
            $facets[] = ["categories:$category"];
        }

        $params = [
            'query' => $query,
            'facets' => json_encode($facets, JSON_THROW_ON_ERROR),
            'index' => in_array($sort, self::SORTS, true) ? $sort : 'relevance',
            'offset' => $offset,
            'limit' => $limit,
        ];

        /** @var array<string, mixed> $body */
        $body = Cache::remember('modrinth:search:'.hash('xxh128', json_encode($params, JSON_THROW_ON_ERROR)), self::SEARCH_TTL, fn (): array => $this->object(fn (): Response => $this->http()->get('/search', $params)));

        /** @var list<array<string, mixed>> $hits */
        $hits = is_array($body['hits'] ?? null) ? array_values($body['hits']) : [];

        return ['hits' => $hits, 'total_hits' => is_int($body['total_hits'] ?? null) ? $body['total_hits'] : count($hits)];
    }

    /**
     * @param  list<string>  $loaders
     * @return list<ModrinthVersion>
     */
    public function projectVersions(string $projectId, array $loaders, ?string $gameVersion): array
    {
        $params = [];
        if ($loaders !== []) {
            $params['loaders'] = json_encode($loaders, JSON_THROW_ON_ERROR);
        }
        if ($gameVersion !== null) {
            $params['game_versions'] = json_encode([$gameVersion], JSON_THROW_ON_ERROR);
        }

        $body = $this->json(fn (): Response => $this->http()->get("/project/$projectId/version", $params));

        /** @var list<ModrinthVersion> */
        return array_values(array_filter($body, is_array(...)));
    }

    /**
     * @return ModrinthVersion
     */
    public function version(string $versionId): array
    {
        return $this->object(fn (): Response => $this->http()->get("/version/$versionId"));
    }

    /**
     * One version of a project, addressed by its ID or by its version number (shared links use the number).
     *
     * @return ModrinthVersion
     */
    public function projectVersion(string $project, string $idOrNumber): array
    {
        return $this->object(fn (): Response => $this->http()->get('/project/'.rawurlencode($project).'/version/'.rawurlencode($idOrNumber)));
    }

    /**
     * @return array<string, mixed>
     */
    public function project(string $projectId): array
    {
        return Cache::remember("modrinth:project:$projectId", self::PROJECT_TTL, fn (): array => $this->object(fn (): Response => $this->http()->get("/project/$projectId")));
    }

    /**
     * Every category Modrinth knows, with the project type and group it belongs to.
     *
     * @return list<array<string, mixed>>
     */
    public function categories(): array
    {
        /** @var list<array<string, mixed>> */
        return Cache::remember('modrinth:categories', 3600, fn (): array => array_values(array_filter($this->json(fn (): Response => $this->http()->get('/tag/category')), is_array(...))));
    }

    /**
     * The newest release Minecraft version, used to resolve a `latest` game version.
     */
    public function latestGameVersion(): ?string
    {
        /** @var list<array<string, mixed>> $versions */
        $versions = Cache::remember('modrinth:game_versions', self::GAME_VERSION_TTL, fn (): array => $this->json(fn (): Response => $this->http()->get('/tag/game_version')));

        $releases = array_values(array_filter($versions, fn (array $entry): bool => ($entry['version_type'] ?? null) === 'release' && is_string($entry['version'] ?? null)));
        usort($releases, fn (array $a, array $b): int => strcmp(is_string($b['date'] ?? null) ? $b['date'] : '', is_string($a['date'] ?? null) ? $a['date'] : ''));

        return $releases === [] ? null : (string) $releases[0]['version'];
    }

    /**
     * Newest compatible version for each installed file hash, keyed by that hash.
     *
     * @param  list<string>  $hashes
     * @param  list<string>  $loaders
     * @param  list<string>  $gameVersions
     * @return array<string, ModrinthVersion>
     */
    public function latestForHashes(array $hashes, array $loaders, array $gameVersions): array
    {
        if ($hashes === []) {
            return [];
        }

        $payload = ['hashes' => $hashes, 'algorithm' => 'sha512', 'loaders' => $loaders, 'game_versions' => $gameVersions];

        /** @var array<string, ModrinthVersion> */
        return Cache::remember('modrinth:updates:'.hash('xxh128', json_encode($payload, JSON_THROW_ON_ERROR)), self::UPDATE_TTL, fn (): array => $this->object(fn (): Response => $this->http()->post('/version_files/update', $payload)));
    }

    /**
     * The Modrinth version that owns each file hash, keyed by that hash. Hashes Modrinth does not know are absent.
     *
     * @param  list<string>  $hashes
     * @return array<string, ModrinthVersion>
     */
    public function versionsByHashes(array $hashes, string $algorithm): array
    {
        $hashes = array_values(array_unique($hashes));
        if ($hashes === []) {
            return [];
        }

        $payload = ['hashes' => $hashes, 'algorithm' => $algorithm];

        /** @var array<string, ModrinthVersion> */
        return Cache::remember('modrinth:hashes:'.hash('xxh128', json_encode($payload, JSON_THROW_ON_ERROR)), self::UPDATE_TTL, fn (): array => $this->object(fn (): Response => $this->http()->post('/version_files', $payload)));
    }

    /**
     * Several projects in one request, keyed by project ID.
     *
     * @param  list<string>  $ids
     * @return array<string, array<string, mixed>>
     */
    public function projects(array $ids): array
    {
        $ids = array_values(array_unique($ids));
        $found = [];
        foreach (array_chunk($ids, 100) as $chunk) {
            $key = 'modrinth:projects:'.hash('xxh128', implode(',', $chunk));
            /** @var list<mixed> $rows */
            $rows = Cache::remember($key, self::PROJECT_TTL, fn (): array => $this->json(fn (): Response => $this->http()->get('/projects', ['ids' => json_encode($chunk, JSON_THROW_ON_ERROR)])));
            foreach ($rows as $row) {
                $project = Json::object($row);
                if (is_string($project['id'] ?? null)) {
                    $found[$project['id']] = $project;
                }
            }
        }

        return $found;
    }

    private function http(): PendingRequest
    {
        return Http::baseUrl(self::BASE_URL)
            ->withUserAgent('astrelyse-panel/'.config('app.version'))
            ->acceptJson()
            ->timeout(10);
    }

    /**
     * @param  Closure(): Response  $request
     * @return array<string, mixed>
     */
    private function object(Closure $request): array
    {
        return array_filter($this->json($request), is_string(...), ARRAY_FILTER_USE_KEY);
    }

    /**
     * @param  Closure(): Response  $request
     * @return array<mixed>
     */
    private function json(Closure $request): array
    {
        try {
            $response = $request();
        } catch (ConnectionException) {
            throw new DisplayException('Modrinth is not responding right now. Please try again in a moment.');
        }

        if ($response->failed()) {
            throw new DisplayException($response->status() === 404 ? 'Modrinth could not find that project or version.' : 'Modrinth is not responding right now. Please try again in a moment.');
        }

        $body = $response->json();

        return is_array($body) ? $body : [];
    }
}
