<?php

declare(strict_types=1);

namespace Pterodactyl\Services\Servers\Mods\Import;

/**
 * A project, version or file link read by ModLinkParser.
 *
 * `provider` is `modrinth` or `curseforge`. `kind` is one of `mod`, `plugin`, `modpack`, `world`,
 * `datapack`, `shader` or `resourcepack`. `slugOrId` is the project slug, or the project id for
 * Modrinth `project/{id}` and CDN links. `versionId` and `fileId` are set only when the link names one.
 */
final readonly class ParsedLink
{
    public function __construct(
        public string $provider,
        public string $kind,
        public string $slugOrId,
        public ?string $versionId = null,
        public ?string $fileId = null,
    ) {}
}
