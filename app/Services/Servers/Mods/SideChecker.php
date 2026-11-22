<?php

declare(strict_types=1);

namespace Pterodactyl\Services\Servers\Mods;

use Illuminate\Support\Facades\Cache;
use Pterodactyl\Exceptions\DisplayException;

/**
 * CurseForge has no client or server flag, so a file is checked against Modrinth: the sha1 finds the Modrinth
 * version, and its project says whether it runs on a server. A file Modrinth does not know is `unknown`.
 */
class SideChecker
{
    private const int KNOWN_TTL = 86400;

    private const int UNKNOWN_TTL = 1800;

    private const int BATCH = 200;

    public function __construct(private readonly ModrinthClient $modrinth) {}

    /**
     * The side of each file, keyed by its lowercased sha1: `client`, `server`, `both` or `unknown`.
     *
     * @param  list<string|null>  $sha1s
     * @return array<string, string>
     */
    public function forSha1(array $sha1s): array
    {
        $hashes = array_values(array_unique(array_map(mb_strtolower(...), array_filter($sha1s, fn (?string $hash): bool => is_string($hash) && $hash !== ''))));
        if ($hashes === []) {
            return [];
        }

        $keys = [];
        foreach ($hashes as $hash) {
            $keys[$hash] = 'modrinth:side:'.$hash;
        }

        $sides = [];
        $missing = [];
        $cached = Cache::many(array_values($keys));
        foreach ($keys as $hash => $key) {
            if (is_string($cached[$key] ?? null)) {
                $sides[$hash] = $cached[$key];
            } else {
                $missing[] = $hash;
            }
        }

        foreach (array_chunk($missing, self::BATCH) as $chunk) {
            foreach ($this->lookup($chunk) as $hash => $side) {
                $sides[$hash] = $side;
            }
        }

        return $sides;
    }

    /**
     * @param  list<string>  $hashes
     * @return array<string, string>
     */
    private function lookup(array $hashes): array
    {
        try {
            $versions = $this->modrinth->versionsByHashes($hashes, 'sha1');
            $ids = [];
            foreach ($versions as $version) {
                if (is_string($version['project_id'] ?? null)) {
                    $ids[] = $version['project_id'];
                }
            }
            $projects = $this->modrinth->projects($ids);
        } catch (DisplayException) {
            // Modrinth being down must not hide or block content: report unknown and do not cache it.
            return array_fill_keys($hashes, 'unknown');
        }

        $result = [];
        foreach ($hashes as $hash) {
            $projectId = $versions[$hash]['project_id'] ?? null;
            $side = is_string($projectId) && isset($projects[$projectId]) ? ModrinthClient::sideOf($projects[$projectId]) : 'unknown';
            $result[$hash] = $side;
            Cache::put('modrinth:side:'.$hash, $side, $side === 'unknown' ? self::UNKNOWN_TTL : self::KNOWN_TTL);
        }

        return $result;
    }
}
