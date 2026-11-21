<?php

declare(strict_types=1);

namespace Pterodactyl\Services\Servers\Mods;

use Pterodactyl\Enum\EggSpecificTags;
use Pterodactyl\Models\Server;

/**
 * Works out which mod loader or plugin platform a Minecraft server runs, and its game version,
 * so the Modrinth installer can filter searches to files that run on it.
 *
 * Rules are applied first match wins. Platform is taken from the egg name, then the startup
 * command and docker image, then the variable names. Game version comes from the server's
 * variable values.
 */
final readonly class MinecraftPlatformDetector
{
    /**
     * Keyword to platform, checked in order against a lowercased haystack. Order matters:
     * `neoforge` must win over `forge`, and `sponge` over `vanilla` ("SpongeVanilla").
     */
    private const array PLATFORM_KEYWORDS = [
        'neoforge' => 'neoforge',
        'forge' => 'forge',
        'fabric' => 'fabric',
        'quilt' => 'quilt',
        'purpur' => 'purpur',
        'folia' => 'folia',
        'paper' => 'paper',
        'spigot' => 'spigot',
        'bukkit' => 'bukkit',
        'sponge' => 'sponge',
        'velocity' => 'velocity',
        'waterfall' => 'waterfall',
        'bungee' => 'bungeecord',
        'vanilla' => 'vanilla',
    ];

    /**
     * Variable name to platform, checked in order against the egg's variable names.
     */
    private const array PLATFORM_VARIABLES = [
        'FORGE_VERSION' => 'forge',
        'FABRIC_VERSION' => 'fabric',
        'SPONGE_VERSION' => 'sponge',
        'VANILLA_VERSION' => 'vanilla',
    ];

    /**
     * Variables that hold the Minecraft version, first non-empty wins.
     */
    private const array GAME_VERSION_VARIABLES = [
        'MC_VERSION',
        'MINECRAFT_VERSION',
        'VANILLA_VERSION',
        'GAME_VERSION',
        'VERSION',
    ];

    /**
     * Values of the Astrelyse egg's SERVER_TYPE variable.
     */
    private const array SERVER_TYPES = ['vanilla', 'paper', 'purpur', 'folia', 'fabric', 'quilt', 'forge', 'neoforge'];

    private const array MOD_LOADERS = ['fabric', 'quilt', 'forge', 'neoforge'];

    private const array PLUGIN_PLATFORMS = ['paper', 'purpur', 'folia', 'spigot', 'bukkit', 'sponge', 'velocity', 'bungeecord', 'waterfall'];

    /**
     * Proxies do not run a Minecraft game version, so none is reported for them.
     */
    private const array PROXY_PLATFORMS = ['velocity', 'bungeecord', 'waterfall'];

    public function detect(Server $server): DetectedPlatform
    {
        $tags = $server->tagSlugs();

        if (! in_array(EggSpecificTags::Minecraft->value, $tags, true) || in_array(EggSpecificTags::Bedrock->value, $tags, true)) {
            return DetectedPlatform::ineligible();
        }

        $variables = $this->variableValues($server);

        [$platform, $source] = $this->findPlatform($server, $variables) ?? [null, null];

        if ($platform === null || $source === null) {
            return DetectedPlatform::ineligible();
        }

        $projectType = match (true) {
            in_array($platform, self::MOD_LOADERS, true) => 'mod',
            in_array($platform, self::PLUGIN_PLATFORMS, true) => 'plugin',
            default => null,
        };

        return new DetectedPlatform(
            eligible: $platform !== 'vanilla',
            platform: $platform,
            game_version: $this->gameVersion($platform, $variables),
            project_type: $projectType,
            install_dir: match ($projectType) {
                'mod' => 'mods',
                'plugin' => 'plugins',
                default => null,
            },
            source: $source,
        );
    }

    /**
     * @param  array<string, string>  $variables
     * @return array{string, string}|null the platform slug and the source it was found in
     */
    private function findPlatform(Server $server, array $variables): ?array
    {
        // The Astrelyse egg states its software outright, so nothing needs guessing.
        $declared = mb_strtolower($variables['SERVER_TYPE'] ?? '');
        if (in_array($declared, self::SERVER_TYPES, true)) {
            return [$declared, 'variable'];
        }

        $candidates = [
            [$this->platformInText($server->egg?->name), 'egg_name'],
            [$this->platformInText(implode(' ', [$server->startup, $server->image ?? ''])), 'startup'],
            [$this->platformInVariables($variables), 'variable'],
        ];

        // "vanilla" is a weak match: an egg named "Vanilla Minecraft" whose startup was switched to a
        // Fabric launcher is a Fabric server. Only settle on vanilla when no source names a real loader.
        $vanilla = null;
        foreach ($candidates as [$platform, $source]) {
            if ($platform === null) {
                continue;
            }

            if ($platform !== 'vanilla') {
                return [$platform, $source];
            }

            $vanilla ??= [$platform, $source];
        }

        return $vanilla;
    }

    /**
     * @param  array<string, string>  $variables
     */
    private function platformInVariables(array $variables): ?string
    {
        foreach (self::PLATFORM_VARIABLES as $name => $platform) {
            if (array_key_exists($name, $variables)) {
                return $platform;
            }
        }

        return null;
    }

    private function platformInText(?string $text): ?string
    {
        if ($text === null || mb_trim($text) === '') {
            return null;
        }

        $haystack = mb_strtolower($text);

        foreach (self::PLATFORM_KEYWORDS as $keyword => $platform) {
            if (str_contains($haystack, $keyword)) {
                return $platform;
            }
        }

        return null;
    }

    /**
     * @param  array<string, string>  $variables
     */
    private function gameVersion(string $platform, array $variables): ?string
    {
        if (in_array($platform, self::PROXY_PLATFORMS, true)) {
            return null;
        }

        foreach (self::GAME_VERSION_VARIABLES as $name) {
            if (($value = $this->safeVersion($variables[$name] ?? '')) !== null) {
                return $value;
            }
        }

        // SpongeVanilla stores "<minecraft>-<sponge>", e.g. 1.12.2-7.3.0.
        if ($platform === 'sponge') {
            return $this->safeVersion(explode('-', $variables['SPONGE_VERSION'] ?? '', 2)[0]);
        }

        return null;
    }

    /**
     * Variable values are user-editable and end up in Modrinth query facets, so only accept
     * something shaped like a Minecraft version ("1.21.1", "24w14a", "1.20.5-pre1") or "latest".
     */
    private function safeVersion(string $value): ?string
    {
        return preg_match('/^[A-Za-z0-9][A-Za-z0-9._\-]{0,31}$/', $value) === 1 ? $value : null;
    }

    /**
     * The server's value for each egg variable, falling back to the egg default. Keyed by the
     * variable's env name, and trimmed.
     *
     * @return array<string, string>
     */
    private function variableValues(Server $server): array
    {
        $values = [];

        foreach ($server->resolvedVariables() as $variable) {
            $values[$variable->env_variable] = mb_trim((string) ($variable->server_value ?? $variable->default_value));
        }

        return $values;
    }
}
