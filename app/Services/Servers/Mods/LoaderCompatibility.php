<?php

declare(strict_types=1);

namespace Pterodactyl\Services\Servers\Mods;

/**
 * Which content loaders a server accepts. A server only sees content built for what it runs: there is no
 * loader override, so a Fabric mod never appears on a Forge server.
 */
final class LoaderCompatibility
{
    private const array SETS = [
        'fabric' => ['fabric'],
        'quilt' => ['quilt', 'fabric'],
        'forge' => ['forge'],
        'neoforge' => ['neoforge'],
        'paper' => ['paper', 'spigot', 'bukkit'],
        'purpur' => ['purpur', 'paper', 'spigot', 'bukkit'],
        'folia' => ['folia'],
        'spigot' => ['spigot', 'bukkit'],
        'velocity' => ['velocity'],
        'bungeecord' => ['bungeecord'],
        'waterfall' => ['waterfall'],
    ];

    /**
     * The loaders content may be built for to run on the given platform, the platform itself first.
     *
     * @return list<string>
     */
    public static function for(string $platform): array
    {
        return self::SETS[$platform] ?? [$platform];
    }

    /**
     * Whether content built for the given loaders runs on the platform.
     *
     * @param  list<string>  $loaders
     */
    public static function accepts(string $platform, array $loaders): bool
    {
        return array_intersect(self::for($platform), array_map(mb_strtolower(...), $loaders)) !== [];
    }
}
