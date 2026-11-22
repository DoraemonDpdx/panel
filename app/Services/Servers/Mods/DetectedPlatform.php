<?php

declare(strict_types=1);

namespace Pterodactyl\Services\Servers\Mods;

/**
 * The mod loader or plugin platform a server runs, as detected by MinecraftPlatformDetector.
 *
 * `platform` is a Modrinth loader slug. `source` records how it was found: `egg_name`,
 * `startup`, `variable`, or `none`.
 */
final readonly class DetectedPlatform
{
    public function __construct(
        public bool $eligible,
        public ?string $platform,
        public ?string $game_version,
        public ?string $project_type,
        public ?string $install_dir,
        public string $source,
    ) {}

    /**
     * A server that cannot take mods or plugins: not a Java Minecraft egg, a Bedrock egg, or
     * one with no recognisable platform.
     */
    public static function ineligible(): self
    {
        return new self(false, null, null, null, null, 'none');
    }

    /**
     * @return array{eligible: bool, platform: ?string, game_version: ?string, project_type: ?string, install_dir: ?string, source: string}
     */
    public function toArray(): array
    {
        return [
            'eligible' => $this->eligible,
            'platform' => $this->platform,
            'game_version' => $this->game_version,
            'project_type' => $this->project_type,
            'install_dir' => $this->install_dir,
            'source' => $this->source,
        ];
    }
}
