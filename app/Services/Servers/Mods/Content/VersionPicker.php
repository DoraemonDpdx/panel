<?php

declare(strict_types=1);

namespace Pterodactyl\Services\Servers\Mods\Content;

use Pterodactyl\Services\Servers\Mods\DetectedPlatform;
use Pterodactyl\Services\Servers\Mods\LoaderCompatibility;
use Pterodactyl\Services\Servers\Mods\ModProvider;

/**
 * Picks the version of a project that runs on a server, and says in plain words why none does.
 *
 * @phpstan-import-type ModVersion from ModProvider
 */
class VersionPicker
{
    /**
     * The newest release that fits the server's loader set and game version, or the newest of any type.
     *
     * @return ModVersion|null
     */
    public function latest(ModProvider $provider, string $projectId, DetectedPlatform $platform, ?string $gameVersion): ?array
    {
        $versions = $provider->versions($projectId, LoaderCompatibility::for((string) $platform->platform), $gameVersion);

        return array_find($versions, fn (array $version): bool => $version['version_type'] === 'release' && $version['file'] !== null)
            ?? array_find($versions, fn (array $version): bool => $version['file'] !== null);
    }

    /**
     * Why no version of the project fits.
     */
    public function whyNone(ModProvider $provider, string $projectId, DetectedPlatform $platform, ?string $gameVersion): string
    {
        $label = ucfirst((string) $platform->platform);

        if ($gameVersion !== null && $provider->versions($projectId, LoaderCompatibility::for((string) $platform->platform), null) !== []) {
            return "No version of this project supports Minecraft $gameVersion.";
        }

        return "This project has no version for $label.";
    }

    /**
     * Why a specific version cannot be used on the server, or null when it can.
     *
     * @param  ModVersion  $version
     */
    public function problem(array $version, DetectedPlatform $platform, ?string $gameVersion): ?string
    {
        if ($version['side'] === 'client') {
            return 'This version is client-only and does nothing on a server.';
        }

        $acceptsEmpty = $version['loaders'] === [] && $platform->project_type === 'plugin';
        if (! LoaderCompatibility::accepts((string) $platform->platform, $version['loaders']) && ! $acceptsEmpty) {
            return 'This version is built for '.implode(', ', array_map(ucfirst(...), $version['loaders'])).', but this server runs '.ucfirst((string) $platform->platform).'.';
        }

        if ($gameVersion !== null && $version['game_versions'] !== [] && ! in_array($gameVersion, $version['game_versions'], true)) {
            return "This version is for Minecraft {$version['game_versions'][0]}, but this server runs $gameVersion.";
        }

        return null;
    }
}
