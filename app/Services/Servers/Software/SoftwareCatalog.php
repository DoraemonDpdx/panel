<?php

declare(strict_types=1);

namespace Pterodactyl\Services\Servers\Software;

use Closure;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Pterodactyl\Exceptions\DisplayException;

/**
 * The Minecraft versions and loader/build versions each server software offers, read from the upstream
 * metadata APIs and cached for an hour. Newest first everywhere.
 *
 * @phpstan-type McVersion array{id: string, type: 'release'|'snapshot', latest: bool}
 * @phpstan-type Loader array{id: string, stable: bool}
 */
final class SoftwareCatalog
{
    /** The `loaders` key that holds a list valid for every Minecraft version (Fabric and Quilt). */
    public const string ALL_VERSIONS = '*';

    /** @var array<string, array{label: string, kind: string, icon: string, description: string}> */
    public const array TYPES = [
        'vanilla' => ['label' => 'Vanilla', 'kind' => 'vanilla', 'icon' => 'vanilla', 'description' => 'The official Mojang server, with no mods or plugins.'],
        'paper' => ['label' => 'Paper', 'kind' => 'plugin', 'icon' => 'paper', 'description' => 'A fast, widely used plugin server.'],
        'purpur' => ['label' => 'Purpur', 'kind' => 'plugin', 'icon' => 'purpur', 'description' => 'Paper with extra gameplay options.'],
        'folia' => ['label' => 'Folia', 'kind' => 'plugin', 'icon' => 'folia', 'description' => 'Paper with regionised multithreading for very large servers.'],
        'fabric' => ['label' => 'Fabric', 'kind' => 'mod', 'icon' => 'fabric', 'description' => 'A light, fast mod loader.'],
        'quilt' => ['label' => 'Quilt', 'kind' => 'mod', 'icon' => 'quilt', 'description' => 'A Fabric-compatible mod loader.'],
        'forge' => ['label' => 'Forge', 'kind' => 'mod', 'icon' => 'forge', 'description' => 'The long-standing mod loader with the largest library.'],
        'neoforge' => ['label' => 'NeoForge', 'kind' => 'mod', 'icon' => 'neoforge', 'description' => 'The modern Forge successor.'],
    ];

    private const int TTL_SECONDS = 3600;

    private const string MOJANG = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';

    private const string PAPER = 'https://fill.papermc.io/v3/projects';

    private const string PURPUR = 'https://api.purpurmc.org/v2/purpur';

    private const string FABRIC = 'https://meta.fabricmc.net/v2/versions';

    private const string QUILT = 'https://meta.quiltmc.org/v3/versions';

    private const string FORGE_PROMOTIONS = 'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json';

    private const string FORGE_METADATA = 'https://maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml';

    private const string NEOFORGE_METADATA = 'https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml';

    /**
     * The Minecraft version a NeoForge version targets: 21.1.215 is 1.21.1, 21.0.5 is 1.21, and 26.1.2.128 is 26.1.2.
     */
    public static function neoforgeMinecraft(string $version): ?string
    {
        if (preg_match('/^(\d+)\.(\d+)(?:\.(\d+))?/', $version, $m) !== 1) {
            return null;
        }

        $first = (int) $m[1];
        $second = (int) $m[2];
        $third = (int) ($m[3] ?? 0);

        if ($first < 20 || ($first === 20 && $second < 2)) {
            return null;
        }

        if ($first >= 26) {
            return $third > 0 && mb_substr_count(explode('-', $version)[0], '.') >= 3 ? "$first.$second.$third" : "$first.$second";
        }

        return $second === 0 ? "1.$first" : "1.$first.$second";
    }

    /**
     * @return array{minecraft: list<McVersion>, loaders: array<string, list<Loader>>}
     *
     * @throws DisplayException when the upstream service cannot be reached
     */
    public function catalog(string $type, bool $includeSnapshots = false, ?string $minecraft = null): array
    {
        $versions = $this->minecraftVersions($type);
        if (! $includeSnapshots) {
            $versions = array_values(array_filter($versions, fn (array $version): bool => $version['type'] === 'release'));
        }

        return ['minecraft' => $versions, 'loaders' => $this->loaders($type, $minecraft)];
    }

    /**
     * @return list<McVersion>
     */
    public function minecraftVersions(string $type): array
    {
        throw_unless(isset(self::TYPES[$type]), DisplayException::class, 'Unknown server software.');

        return $this->remember("minecraft.$type", fn (): array => match ($type) {
            'vanilla' => $this->vanillaVersions(),
            'paper', 'folia' => $this->paperVersions($type),
            'purpur' => $this->purpurVersions(),
            'fabric' => $this->gameVersions(self::FABRIC.'/game'),
            'quilt' => $this->gameVersions(self::QUILT.'/game'),
            'forge' => $this->forgeVersions(),
            'neoforge' => $this->neoforgeVersions(),
        });
    }

    /**
     * Loader or build versions. With `$minecraft` set only that version is returned; without it Forge and NeoForge
     * return every version, Fabric and Quilt one shared list under ALL_VERSIONS, and Paper, Folia and Purpur nothing
     * (their builds are fetched per Minecraft version).
     *
     * @return array<string, list<Loader>>
     */
    public function loaders(string $type, ?string $minecraft = null): array
    {
        return match ($type) {
            'fabric' => [$minecraft ?? self::ALL_VERSIONS => $this->remember('loaders.fabric', fn (): array => $this->fabricLoaders())],
            'quilt' => [$minecraft ?? self::ALL_VERSIONS => $this->remember('loaders.quilt', fn (): array => $this->quiltLoaders())],
            'forge' => $this->scoped($this->remember('loaders.forge', fn (): array => $this->forgeLoaders()), $minecraft),
            'neoforge' => $this->scoped($this->remember('loaders.neoforge', fn (): array => $this->neoforgeLoaders()), $minecraft),
            'paper', 'folia' => $minecraft === null ? [] : [$minecraft => $this->remember("builds.$type.$minecraft", fn (): array => $this->paperBuilds($type, $minecraft))],
            'purpur' => $minecraft === null ? [] : [$minecraft => $this->remember("builds.purpur.$minecraft", fn (): array => $this->purpurBuilds($minecraft))],
            default => [],
        };
    }

    /** Whether the loader/build id is offered for the Minecraft version (types without loaders accept only an empty one). */
    public function hasLoader(string $type, string $minecraft, string $loader): bool
    {
        $loaders = $this->loaders($type, $minecraft)[$minecraft] ?? [];

        return in_array($loader, array_column($loaders, 'id'), true);
    }

    public function hasMinecraft(string $type, string $minecraft): bool
    {
        return in_array($minecraft, array_column($this->minecraftVersions($type), 'id'), true);
    }

    /**
     * The newest stable loader for a Minecraft version, falling back to the newest of any kind.
     */
    public function recommendedLoader(string $type, string $minecraft): ?string
    {
        $loaders = $this->loaders($type, $minecraft)[$minecraft] ?? [];

        foreach ($loaders as $loader) {
            if ($loader['stable']) {
                return $loader['id'];
            }
        }

        return $loaders[0]['id'] ?? null;
    }

    /**
     * @param  array<string, list<Loader>>  $all
     * @return array<string, list<Loader>>
     */
    private function scoped(array $all, ?string $minecraft): array
    {
        return $minecraft === null ? $all : [$minecraft => $all[$minecraft] ?? []];
    }

    /** @return list<McVersion> */
    private function vanillaVersions(): array
    {
        $manifest = $this->json(self::MOJANG);
        $out = [];

        foreach ($this->arrayAt($manifest, 'versions') as $entry) {
            $entry = $this->arrayAt($entry);
            $id = $entry['id'] ?? null;
            $kind = $entry['type'] ?? null;
            if (! is_string($id) || ! in_array($kind, ['release', 'snapshot'], true)) {
                continue;
            }

            // Mojang publishes server jars from 1.2.5 only.
            if ($kind === 'release' && str_starts_with($id, '1.') && ! $this->atLeast125($id)) {
                continue;
            }

            $out[] = ['id' => $id, 'type' => $kind, 'latest' => false];
        }

        $latest = $this->arrayAt($manifest, 'latest');
        $release = $latest['release'] ?? null;
        $snapshot = $latest['snapshot'] ?? null;

        return $this->markLatest($out, is_string($release) ? $release : null, is_string($snapshot) ? $snapshot : null);
    }

    private function atLeast125(string $id): bool
    {
        return preg_match('/^1\.(\d+)(?:\.(\d+))?/', $id, $m) === 1 && ((int) $m[1] > 2 || ((int) $m[1] === 2 && (int) ($m[2] ?? 0) >= 5));
    }

    /** @return list<McVersion> */
    private function paperVersions(string $project): array
    {
        $groups = $this->arrayAt($this->json(self::PAPER."/$project"), 'versions');
        $out = [];

        foreach ($groups as $versions) {
            foreach ($this->arrayAt($versions) as $id) {
                if (is_string($id)) {
                    $out[] = ['id' => $id, 'type' => str_contains($id, '-') ? 'snapshot' : 'release', 'latest' => false];
                }
            }
        }

        return $this->markLatest($out);
    }

    /** @return list<McVersion> */
    private function purpurVersions(): array
    {
        $ids = array_reverse($this->arrayAt($this->json(self::PURPUR), 'versions'));
        $out = array_map(fn (string $id): array => ['id' => $id, 'type' => str_contains($id, '-') ? 'snapshot' : 'release', 'latest' => false], array_values(array_filter($ids, is_string(...))));

        return $this->markLatest($out);
    }

    /** @return list<McVersion> */
    private function gameVersions(string $url): array
    {
        $out = [];
        foreach ($this->json($url) as $entry) {
            if (is_array($entry) && is_string($entry['version'] ?? null)) {
                $out[] = ['id' => $entry['version'], 'type' => ($entry['stable'] ?? false) ? 'release' : 'snapshot', 'latest' => false];
            }
        }

        return $this->markLatest($out);
    }

    /** @return list<McVersion> */
    private function forgeVersions(): array
    {
        $seen = [];
        foreach (array_reverse($this->forgeEntries()) as [$mc]) {
            $seen[$mc] = ['id' => $mc, 'type' => 'release', 'latest' => false];
        }

        return $this->markLatest(array_values($seen));
    }

    /** @return array<string, list<Loader>> */
    private function forgeLoaders(): array
    {
        $promos = $this->forgePromotions();
        $out = [];

        foreach (array_reverse($this->forgeEntries()) as [$mc, $loader]) {
            $stable = $promos[$mc.'-recommended'] ?? $promos[$mc.'-latest'] ?? null;
            $out[$mc][] = ['id' => $loader, 'stable' => $stable === $loader];
        }

        return $out;
    }

    /** @return array<string, string> */
    private function forgePromotions(): array
    {
        return $this->remember('forge.promotions', function (): array {
            $promos = [];
            foreach ($this->arrayAt($this->json(self::FORGE_PROMOTIONS), 'promos') as $key => $value) {
                if (is_string($value)) {
                    $promos[(string) $key] = $value;
                }
            }

            return $promos;
        });
    }

    /**
     * Oldest first, as listed in the Maven metadata.
     *
     * @return list<array{string, string}> Minecraft version and Forge version
     */
    private function forgeEntries(): array
    {
        $out = [];
        foreach ($this->mavenVersions(self::FORGE_METADATA) as $version) {
            if (preg_match('/^(\d+\.\d+(?:\.\d+)?)-(\d[\w.\-+]*)$/', $version, $m) === 1) {
                $out[] = [$m[1], $m[2]];
            }
        }

        return $out;
    }

    /** @return list<McVersion> */
    private function neoforgeVersions(): array
    {
        return $this->markLatest(array_map(
            fn (string $mc): array => ['id' => $mc, 'type' => 'release', 'latest' => false],
            array_keys($this->neoforgeLoaders()),
        ));
    }

    /** @return array<string, list<Loader>> */
    private function neoforgeLoaders(): array
    {
        $out = [];
        foreach (array_reverse($this->mavenVersions(self::NEOFORGE_METADATA)) as $version) {
            $mc = self::neoforgeMinecraft($version);
            if ($mc !== null) {
                $out[$mc][] = ['id' => $version, 'stable' => ! str_contains($version, '-')];
            }
        }

        return $out;
    }

    /** @return list<Loader> */
    private function fabricLoaders(): array
    {
        $out = [];
        foreach ($this->json(self::FABRIC.'/loader') as $entry) {
            if (is_array($entry) && is_string($entry['version'] ?? null)) {
                $out[] = ['id' => $entry['version'], 'stable' => (bool) ($entry['stable'] ?? false)];
            }
        }

        return $out;
    }

    /** @return list<Loader> */
    private function quiltLoaders(): array
    {
        $out = [];
        foreach ($this->json(self::QUILT.'/loader') as $entry) {
            if (is_array($entry) && is_string($entry['version'] ?? null)) {
                $out[] = ['id' => $entry['version'], 'stable' => ! str_contains($entry['version'], '-')];
            }
        }

        return $out;
    }

    /** @return list<Loader> */
    private function paperBuilds(string $project, string $minecraft): array
    {
        $out = [];
        foreach (array_slice($this->json(self::PAPER."/$project/versions/".rawurlencode($minecraft).'/builds'), 0, 30) as $build) {
            if (is_array($build) && isset($build['id'])) {
                $out[] = ['id' => is_scalar($build['id']) ? (string) $build['id'] : '', 'stable' => ($build['channel'] ?? '') === 'STABLE'];
            }
        }

        return $out;
    }

    /** @return list<Loader> */
    private function purpurBuilds(string $minecraft): array
    {
        $all = $this->arrayAt($this->arrayAt($this->json(self::PURPUR.'/'.rawurlencode($minecraft)), 'builds'), 'all');
        $ids = [];
        foreach ($all as $id) {
            if (is_scalar($id) && is_numeric((string) $id)) {
                $ids[] = (string) $id;
            }
        }

        return array_map(fn (string $id): array => ['id' => $id, 'stable' => true], array_slice(array_reverse($ids), 0, 30));
    }

    /**
     * @param  list<McVersion>  $versions  newest first
     * @return list<McVersion>
     */
    private function markLatest(array $versions, ?string $release = null, ?string $snapshot = null): array
    {
        $seenRelease = false;
        $seenSnapshot = false;

        foreach ($versions as $index => $version) {
            if ($version['type'] === 'release' && ! $seenRelease && ($release === null || $release === $version['id'])) {
                $versions[$index]['latest'] = $seenRelease = true;
            } elseif ($version['type'] === 'snapshot' && ! $seenSnapshot && ($snapshot === null || $snapshot === $version['id'])) {
                $versions[$index]['latest'] = $seenSnapshot = true;
            }
        }

        return $versions;
    }

    /**
     * The array at a key (or the value itself when no key is given), or an empty array when it is not one.
     *
     * @return array<mixed>
     */
    private function arrayAt(mixed $data, ?string $key = null): array
    {
        $value = $key === null ? $data : (is_array($data) ? ($data[$key] ?? null) : null);

        return is_array($value) ? $value : [];
    }

    /** @return list<string> oldest first, as in the metadata file */
    private function mavenVersions(string $url): array
    {
        $body = $this->body($url);
        preg_match_all('#<version>([^<]+)</version>#', $body, $matches);

        return $matches[1];
    }

    /**
     * @template T
     *
     * @param  callable(): T  $callback
     * @return T
     */
    private function remember(string $key, callable $callback): mixed
    {
        return Cache::remember("software.catalog.$key", self::TTL_SECONDS, Closure::fromCallable($callback));
    }

    /**
     * @return array<mixed>
     */
    private function json(string $url): array
    {
        $decoded = json_decode($this->body($url), true);

        return is_array($decoded) ? $decoded : throw new DisplayException('The software list returned an unexpected response. Try again shortly.');
    }

    private function body(string $url): string
    {
        try {
            return Http::withUserAgent('astrelyse-panel/'.config('app.version', 'dev'))
                ->timeout(15)
                ->retry(2, 200, throw: false)
                ->get($url)
                ->throw()
                ->body();
        } catch (ConnectionException|RequestException $exception) {
            throw new DisplayException('The software list could not be loaded right now. Try again shortly.', $exception);
        }
    }
}
