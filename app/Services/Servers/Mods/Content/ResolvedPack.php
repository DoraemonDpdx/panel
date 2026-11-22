<?php

declare(strict_types=1);

namespace Pterodactyl\Services\Servers\Mods\Content;

/**
 * A modpack worked out to the last file: the software it needs, what the install container downloads, and what
 * the panel records once it has been installed.
 *
 * @phpstan-type PackFile array{path: string, url: string, sha1: string|null, sha512: string|null, size: int|null}
 * @phpstan-type PackArchive array{url: string|null, local: string|null, sha1: string|null, strip: string, into: string, only: string|null}
 * @phpstan-type PackMod array{provider: string, project_id: string, version_id: string, slug: string|null, title: string, icon_url: string|null, filename: string, version_number: string, sha512: string|null, sha1: string|null, install_dir: string, project_type: string}
 */
final readonly class ResolvedPack
{
    /**
     * @param  array{type: string, minecraft: string, loader: string|null}  $software
     * @param  list<PackFile>  $files
     * @param  list<PackArchive>  $archives
     * @param  list<PackMod>  $mods
     * @param  list<string>  $warnings
     */
    public function __construct(
        public string $provider,
        public string $projectId,
        public string $versionId,
        public string $title,
        public ?string $iconUrl,
        public string $versionNumber,
        public array $software,
        public array $files,
        public array $archives,
        public array $mods,
        public int $serverFiles,
        public int $skippedClient,
        public int $unverified,
        public int $sizeBytes,
        public array $warnings,
    ) {}

    /**
     * What a preview shows. It never changes anything.
     *
     * @return array<string, mixed>
     */
    public function preview(): array
    {
        return [
            'title' => $this->title,
            'icon_url' => $this->iconUrl,
            'version_number' => $this->versionNumber,
            'software' => $this->software,
            'files' => ['server' => $this->serverFiles, 'skipped_client' => $this->skippedClient, 'unverified' => $this->unverified],
            'size_bytes' => $this->sizeBytes,
            'warnings' => $this->warnings,
        ];
    }
}
