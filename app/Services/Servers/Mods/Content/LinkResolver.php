<?php

declare(strict_types=1);

namespace Pterodactyl\Services\Servers\Mods\Content;

use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Exceptions\Mods\ContentUnavailableException;
use Pterodactyl\Models\Server;
use Pterodactyl\Services\Servers\Mods\CurseForgeApi;
use Pterodactyl\Services\Servers\Mods\CurseForgeProvider;
use Pterodactyl\Services\Servers\Mods\DetectedPlatform;
use Pterodactyl\Services\Servers\Mods\Import\ModLinkParser;
use Pterodactyl\Services\Servers\Mods\Import\ParsedLink;
use Pterodactyl\Services\Servers\Mods\Json;
use Pterodactyl\Services\Servers\Mods\MinecraftPlatformDetector;
use Pterodactyl\Services\Servers\Mods\ModInstaller;
use Pterodactyl\Services\Servers\Mods\ModProvider;
use Pterodactyl\Services\Servers\Mods\ModrinthClient;
use Pterodactyl\Services\Servers\Mods\ModrinthProvider;

/**
 * Turns a pasted Modrinth or CurseForge link into the project (and version) it names, and says whether it can be
 * installed on this server.
 *
 * @phpstan-type Resolved array{kind: string, provider: string, project_id: string, version_id: string|null, slug: string|null, title: string, icon_url: string|null, page_url: string|null, side: string|null, compatible: bool, reason?: string}
 */
class LinkResolver
{
    private const string CLIENT_ONLY = 'Client-only content can\'t be installed on a server.';

    public function __construct(
        private readonly ModLinkParser $parser,
        private readonly ModrinthClient $modrinth,
        private readonly ModrinthProvider $modrinthProvider,
        private readonly CurseForgeApi $api,
        private readonly CurseForgeProvider $curseForge,
        private readonly MinecraftPlatformDetector $detector,
        private readonly ModInstaller $installer,
        private readonly VersionPicker $picker,
    ) {}

    /**
     * @return Resolved
     */
    public function resolve(Server $server, string $url): array
    {
        $link = $this->parser->parse($url) ?? throw new ContentUnavailableException('unsupported_link', 'That is not a Modrinth or CurseForge link this panel can read.');

        if (in_array($link->kind, ['shader', 'resourcepack'], true)) {
            return $this->refused($link, self::CLIENT_ONLY);
        }

        return $link->provider === 'curseforge' ? $this->curseForgeLink($server, $link) : $this->modrinthLink($server, $link);
    }

    /**
     * @return Resolved
     */
    private function modrinthLink(Server $server, ParsedLink $link): array
    {
        $project = $this->modrinth->project($link->slugOrId);
        $projectId = is_string($project['id'] ?? null) ? $project['id'] : $link->slugOrId;
        $type = is_string($project['project_type'] ?? null) ? $project['project_type'] : $link->kind;
        $title = is_string($project['title'] ?? null) ? $project['title'] : $link->slugOrId;
        $slug = is_string($project['slug'] ?? null) ? $project['slug'] : null;
        $side = ModrinthClient::sideOf($project);

        $base = [
            'kind' => $type,
            'provider' => 'modrinth',
            'project_id' => $projectId,
            'version_id' => null,
            'slug' => $slug,
            'title' => $title,
            'icon_url' => is_string($project['icon_url'] ?? null) ? $project['icon_url'] : null,
            'page_url' => $slug !== null ? "https://modrinth.com/$type/$slug" : null,
            'side' => $side,
        ];

        if (in_array($type, ['shader', 'resourcepack'], true) || $side === 'client') {
            return [...$base, 'compatible' => false, 'reason' => self::CLIENT_ONLY];
        }
        if ($type === 'datapack') {
            return [...$base, 'compatible' => false, 'reason' => 'Data packs can\'t be installed from here yet.'];
        }

        if ($type === 'modpack') {
            $version = $link->versionId !== null ? $this->modrinthProvider->versionByReference($projectId, $link->versionId) : ($this->modrinthProvider->versions($projectId, [], null)[0] ?? null);

            return [...$base, 'version_id' => $version['id'] ?? null, 'compatible' => $version !== null, ...($version === null ? ['reason' => 'This modpack has no downloadable version.'] : [])];
        }

        return $this->contentCompatibility($server, $base, $this->modrinthProvider, $projectId, $link->versionId, true);
    }

    /**
     * @return Resolved
     */
    private function curseForgeLink(Server $server, ParsedLink $link): array
    {
        if (! $this->curseForge->available()) {
            return $this->refused($link, 'CurseForge is not configured on this panel.');
        }

        $mod = $this->curseForgeProject($link);
        $projectId = Json::id($mod['id']);
        $project = $this->curseForge->project($projectId);

        $base = [
            'kind' => $link->kind,
            'provider' => 'curseforge',
            'project_id' => $projectId,
            'version_id' => null,
            'slug' => $project['slug'],
            'title' => $project['title'] ?? $link->slugOrId,
            'icon_url' => $project['icon_url'],
            'page_url' => $project['page_url'],
            'side' => null,
        ];

        if ($link->kind === 'world' || $link->kind === 'modpack') {
            $versions = $this->curseForge->versions($projectId, [], null);
            $version = $link->fileId !== null ? array_find($versions, fn (array $v): bool => $v['id'] === $link->fileId) : ($versions[0] ?? null);

            return [...$base, 'version_id' => $version['id'] ?? $link->fileId, 'compatible' => $version !== null || $link->fileId !== null, ...($version === null && $link->fileId === null ? ['reason' => 'No downloadable file was found.'] : [])];
        }

        return $this->contentCompatibility($server, $base, $this->curseForge, $projectId, $link->fileId, false);
    }

    /**
     * @param  array<string, mixed>  $base
     * @return Resolved
     */
    private function contentCompatibility(Server $server, array $base, ModProvider $provider, string $projectId, ?string $versionRef, bool $byReference): array
    {
        /** @var Resolved $base */
        $platform = $this->detector->detect($server);
        if (! $platform->eligible || $platform->platform === null) {
            return [...$base, 'compatible' => false, 'reason' => 'This server type does not take mods or plugins. Change it on the Software page.'];
        }

        if ($base['kind'] !== $platform->project_type && in_array($base['kind'], ['mod', 'plugin'], true)) {
            return [...$base, 'compatible' => false, 'reason' => $base['kind'] === 'mod' ? 'This is a mod, but this server runs plugins.' : 'This is a plugin, but this server runs mods.'];
        }

        $gameVersion = $this->gameVersion($platform);

        try {
            if ($versionRef !== null) {
                $version = $byReference && $provider instanceof ModrinthProvider ? $provider->versionByReference($projectId, $versionRef) : $provider->version($projectId, $versionRef);
                $problem = $this->picker->problem($version, $platform, $gameVersion);

                return $problem === null
                    ? [...$base, 'version_id' => $version['id'], 'side' => $version['side'], 'compatible' => true]
                    : [...$base, 'version_id' => $version['id'], 'side' => $version['side'], 'compatible' => false, 'reason' => $problem];
            }

            $version = $this->picker->latest($provider, $projectId, $platform, $gameVersion);
        } catch (DisplayException $exception) {
            return [...$base, 'compatible' => false, 'reason' => $exception->getMessage()];
        }

        if ($version === null) {
            return [...$base, 'compatible' => false, 'reason' => $this->picker->whyNone($provider, $projectId, $platform, $gameVersion)];
        }

        return [...$base, 'version_id' => $version['id'], 'side' => $version['side'], 'compatible' => true];
    }

    /**
     * @return array<string, mixed>
     */
    private function curseForgeProject(ParsedLink $link): array
    {
        $classIds = CurseForgeProvider::CLASS_IDS;
        $body = $this->api->get('/mods/search', array_filter([
            'gameId' => 432,
            'classId' => $classIds[$link->kind] ?? null,
            'slug' => $link->slugOrId,
        ], fn (mixed $value): bool => $value !== null));

        $mod = is_array($body['data'] ?? null) ? ($body['data'][0] ?? null) : null;
        if (! is_array($mod) || ! isset($mod['id'])) {
            throw new ContentUnavailableException('not_found', 'CurseForge has no project at that link.');
        }

        return Json::object($mod);
    }

    private function gameVersion(DetectedPlatform $platform): ?string
    {
        try {
            return $this->installer->resolveGameVersion($platform);
        } catch (DisplayException) {
            return $platform->game_version;
        }
    }

    /**
     * @return Resolved
     */
    private function refused(ParsedLink $link, string $reason): array
    {
        return [
            'kind' => $link->kind,
            'provider' => $link->provider,
            'project_id' => $link->slugOrId,
            'version_id' => $link->versionId ?? $link->fileId,
            'slug' => $link->slugOrId,
            'title' => $link->slugOrId,
            'icon_url' => null,
            'page_url' => null,
            'side' => null,
            'compatible' => false,
            'reason' => $reason,
        ];
    }
}
