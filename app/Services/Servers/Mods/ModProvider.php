<?php

declare(strict_types=1);

namespace Pterodactyl\Services\Servers\Mods;

use Pterodactyl\Models\ServerModInstall;

/**
 * A catalogue mods and plugins can be searched in and installed from.
 *
 * @phpstan-type ModHit array{project_id: string, slug: string|null, title: string|null, description: string|null, icon_url: string|null, downloads: int, author: string|null, categories: list<string>, page_url: string|null, distributable: bool, side: string, game_versions: list<string>, loaders: list<string>}
 * @phpstan-type ModFile array{filename: string|null, url: string|null, size: int, sha512: string|null, sha1: string|null}
 * @phpstan-type ModDependency array{project_id: string|null, version_id: string|null, dependency_type: string|null}
 * @phpstan-type ModVersion array{id: string, project_id: string, name: string|null, version_number: string|null, version_type: string|null, date_published: string|null, game_versions: list<string>, loaders: list<string>, file: ModFile|null, dependencies: list<ModDependency>, distributable: bool, page_url: string|null, side: string}
 * @phpstan-type ModProject array{slug: string|null, title: string|null, icon_url: string|null, page_url: string|null, distributable: bool}
 * @phpstan-type ModDetails array{project_id: string, body: string, gallery: list<array{url: string, title: string|null}>, links: array{source: string|null, issues: string|null, wiki: string|null, discord: string|null}}
 * @phpstan-type ModCategory array{id: string, label: string}
 * @phpstan-type ModUpdate array{version_id: string, version_number: string}
 */
interface ModProvider
{
    /** The value stored in `server_mod_installs.provider` and sent as the `provider` parameter. */
    public function key(): string;

    /** Whether the provider can be used right now, such as having an API key. */
    public function available(): bool;

    /** Regular expression a project or version ID of this provider must match. */
    public function idPattern(): string;

    /**
     * Hosts a download URL may point at. Matched exactly.
     *
     * @return list<string>
     */
    public function downloadHosts(): array;

    /**
     * Client-only projects are left out. `$loaders` is the set the server accepts (see LoaderCompatibility); an
     * empty set means any loader. `$projectType` is mod, plugin, modpack or world.
     *
     * @param  list<string>  $loaders
     * @return array{hits: list<ModHit>, total: int}
     */
    public function search(string $query, string $projectType, array $loaders, ?string $gameVersion, int $offset, int $limit, string $sort, ?string $category = null): array;

    /**
     * Versions built for one of `$loaders`. Files known to be client-only are left out.
     *
     * @param  list<string>  $loaders
     * @return list<ModVersion>
     */
    public function versions(string $projectId, array $loaders, ?string $gameVersion): array;

    /**
     * @return ModVersion
     */
    public function version(string $projectId, string $versionId): array;

    /**
     * @return ModProject
     */
    public function project(string $projectId): array;

    /**
     * The long description, screenshots and links of a project, for its detail view. Text only, links https only.
     *
     * @return ModDetails
     */
    public function details(string $projectId): array;

    /**
     * Topic categories for a project type (mod or plugin), for a filter row.
     *
     * @return list<ModCategory>
     */
    public function categories(string $projectType): array;

    /**
     * The newest compatible version of each installed project, keyed by project ID.
     *
     * @param  iterable<ServerModInstall>  $installs
     * @param  list<string>  $loaders
     * @return array<string, ModUpdate>
     */
    public function latestFor(iterable $installs, array $loaders, ?string $gameVersion): array;
}
