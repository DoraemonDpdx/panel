<?php

declare(strict_types=1);

namespace Pterodactyl\Services\Servers\Mods\Content;

use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Exceptions\Mods\ClientOnlyException;
use Pterodactyl\Exceptions\Mods\ContentUnavailableException;
use Pterodactyl\Exceptions\Mods\NotDistributableException;
use Pterodactyl\Exceptions\Software\InvalidInstallPlanException;
use Pterodactyl\Models\InstallOperation;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\User;
use Pterodactyl\Services\Servers\Mods\CurseForgeApi;
use Pterodactyl\Services\Servers\Mods\CurseForgeProvider;
use Pterodactyl\Services\Servers\Mods\DetectedPlatform;
use Pterodactyl\Services\Servers\Mods\Import\ModLinkParser;
use Pterodactyl\Services\Servers\Mods\Import\PrismEntry;
use Pterodactyl\Services\Servers\Mods\Import\PrismListParser;
use Pterodactyl\Services\Servers\Mods\Json;
use Pterodactyl\Services\Servers\Mods\LoaderCompatibility;
use Pterodactyl\Services\Servers\Mods\MinecraftPlatformDetector;
use Pterodactyl\Services\Servers\Mods\ModInstaller;
use Pterodactyl\Services\Servers\Mods\ModProvider;
use Pterodactyl\Services\Servers\Mods\ModProviderRegistry;
use Pterodactyl\Services\Servers\Mods\ModrinthClient;
use Pterodactyl\Services\Servers\Mods\ModrinthProvider;
use Pterodactyl\Services\Servers\Software\InstallPlan;

/**
 * Imports a Prism Launcher mod list: matches every entry to a project that runs on this server, and installs the
 * chosen ones as one install plan.
 *
 * @phpstan-import-type ModVersion from ModProvider
 *
 * @phpstan-type Matched array{provider: string, project_id: string, version_id: string, title: string, icon_url: string|null, filename: string}
 * @phpstan-type Item array{line: int, name: string, url: string|null, matched: Matched|null, match: string, side: string|null, compatible: bool, selected: bool, reason?: string}
 */
class PrismImporter
{
    /** Entries resolved per preview; each one costs a few API calls. */
    public const int MAX_ENTRIES = 100;

    public const int MAX_INSTALL = 200;

    public function __construct(
        private readonly PrismListParser $parser,
        private readonly ModLinkParser $links,
        private readonly ModProviderRegistry $providers,
        private readonly ModrinthClient $modrinth,
        private readonly ModrinthProvider $modrinthProvider,
        private readonly CurseForgeProvider $curseForge,
        private readonly CurseForgeApi $api,
        private readonly MinecraftPlatformDetector $detector,
        private readonly ModInstaller $installer,
        private readonly VersionPicker $picker,
        private readonly ContentRunner $runner,
    ) {}

    /**
     * @return array{items: list<Item>, total: int, truncated: bool}
     */
    public function preview(Server $server, string $text): array
    {
        $platform = $this->platform($server);
        $gameVersion = $this->installer->resolveGameVersion($platform);

        $entries = $this->parser->parse($text);
        $items = [];
        foreach (array_slice($entries, 0, self::MAX_ENTRIES) as $entry) {
            try {
                $items[] = $this->resolveEntry($entry, $platform, $gameVersion);
            } catch (DisplayException $exception) {
                $items[] = $this->item($entry, null, 'none', null, false, $exception->getMessage());
            }
        }

        return ['items' => $items, 'total' => count($entries), 'truncated' => count($entries) > self::MAX_ENTRIES];
    }

    /**
     * Re-validates every item on the server and installs them as one plan. Nothing is trusted from the preview.
     *
     * @param  list<array{provider: string, project_id: string, version_id: string}>  $items
     */
    public function install(Server $server, User $by, array $items): InstallOperation
    {
        $this->runner->assertManaged($server);
        $platform = $this->platform($server);
        $dir = (string) $platform->install_dir;

        $files = [];
        $rows = [];
        $remove = [];
        $problems = [];
        $seen = [];

        foreach ($items as $item) {
            $key = $item['provider'].':'.$item['project_id'];
            if (isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;

            try {
                $provider = $this->providers->get($item['provider']);
                if (! $provider->available()) {
                    throw new ContentUnavailableException('provider_unavailable', "The {$item['provider']} provider is not available on this panel.");
                }
                if (preg_match($provider->idPattern(), $item['project_id']) !== 1 || preg_match($provider->idPattern(), $item['version_id']) !== 1) {
                    throw new ContentUnavailableException('invalid_item', 'That item has an invalid id.');
                }

                $version = $provider->version($item['project_id'], $item['version_id']);
                $project = $provider->project($item['project_id']);

                if ($version['project_id'] !== $item['project_id']) {
                    throw new ContentUnavailableException('wrong_project', 'That version does not belong to the selected project.');
                }
                if ($version['side'] === 'client') {
                    throw new ClientOnlyException($project['title']);
                }
                $acceptsEmpty = $item['provider'] === 'curseforge' && $platform->project_type === 'plugin' && $version['loaders'] === [];
                if (! LoaderCompatibility::accepts((string) $platform->platform, $version['loaders']) && ! $acceptsEmpty) {
                    throw new ContentUnavailableException('incompatible', 'That version does not support this server\'s loader.');
                }
                if (! $version['distributable']) {
                    throw new NotDistributableException($version['page_url']);
                }

                $file = $this->installer->chooseFile($version, $provider);
                $files[] = ['path' => "$dir/{$file['filename']}", 'url' => $file['url'], 'sha1' => $file['sha1'], 'sha512' => $file['sha512'], 'size' => null];
                $rows[] = [
                    'provider' => $item['provider'],
                    'project_id' => $item['project_id'],
                    'version_id' => $version['id'],
                    'slug' => $project['slug'],
                    'title' => $project['title'] ?? $version['name'] ?? $item['project_id'],
                    'icon_url' => $project['icon_url'],
                    'filename' => $file['filename'],
                    'version_number' => $version['version_number'] ?? '',
                    'sha512' => $file['sha512'],
                    'sha1' => $file['sha1'],
                    'install_dir' => $dir,
                    'project_type' => $platform->project_type ?? 'mod',
                ];

                // A newer file of an installed mod replaces the old one.
                $existing = $server->modInstalls()->where('provider', $item['provider'])->where('project_id', $item['project_id'])->first();
                if ($existing !== null && $existing->filename !== $file['filename']) {
                    $remove[] = "{$existing->install_dir}/{$existing->filename}";
                    $remove[] = "{$existing->install_dir}/{$existing->filename}.disabled";
                }
            } catch (DisplayException $exception) {
                $problems[] = [
                    'provider' => $item['provider'],
                    'project_id' => $item['project_id'],
                    'error' => $exception instanceof ClientOnlyException ? 'client_only' : ($exception instanceof ContentUnavailableException ? $exception->error : ($exception instanceof NotDistributableException ? 'not_distributable' : 'refused')),
                    'message' => $exception->getMessage(),
                ];
            }
        }

        if ($problems !== []) {
            throw new ContentUnavailableException($problems[0]['error'], 'Some of these mods cannot be installed on this server.', ['items' => $problems]);
        }
        if ($files === []) {
            throw new ContentUnavailableException('nothing_to_install', 'Choose at least one mod to install.');
        }

        try {
            $plan = new InstallPlan('mods', false, InstallPlan::DEFAULT_KEEP, null, [], array_values(array_unique($remove)), $files, []);
        } catch (InvalidInstallPlanException $exception) {
            throw new ContentUnavailableException('invalid_item', 'These mods cannot be installed: '.$exception->getMessage());
        }

        return $this->runner->run($server, $by, $plan, 'mods', ['count' => count($files), 'source' => 'prism'], ['mods' => $rows]);
    }

    private function platform(Server $server): DetectedPlatform
    {
        $platform = $this->detector->detect($server);
        if (! $platform->eligible || $platform->platform === null || $platform->install_dir === null) {
            throw new \Illuminate\Http\Exceptions\HttpResponseException(new \Illuminate\Http\JsonResponse(['error' => 'mods_unsupported'], 409));
        }

        return $platform;
    }

    /**
     * @return Item
     */
    private function resolveEntry(PrismEntry $entry, DetectedPlatform $platform, ?string $gameVersion): array
    {
        $loaders = LoaderCompatibility::for((string) $platform->platform);

        // 1. An explicit link.
        if ($entry->url !== null) {
            $link = $this->links->parse($entry->url);
            if ($link !== null && in_array($link->kind, ['shader', 'resourcepack'], true)) {
                return $this->item($entry, null, 'url', 'client', false, 'Client-only content can\'t be installed on a server.');
            }
            if ($link !== null && in_array($link->kind, ['mod', 'plugin'], true)) {
                $found = $this->fromLink($link->provider, $link->slugOrId, $link->versionId ?? $link->fileId);
                if ($found !== null) {
                    return $this->judge($entry, $found['provider'], $found['project_id'], $found['version_ref'], 'url', true, $platform, $gameVersion);
                }
            }
        }

        // 2. The file name, as a slug-ish name.
        if ($entry->filename !== null) {
            $hit = $this->searchTop($this->slugish($entry->filename), $platform, $loaders, $gameVersion);
            if ($hit !== null && $this->same($this->slugish($entry->filename), $hit)) {
                return $this->judge($entry, 'modrinth', $hit['project_id'], null, 'filename', true, $platform, $gameVersion);
            }
        }

        // 3. The name: only an exact title is trusted.
        $hit = $this->searchTop($entry->name, $platform, $loaders, $gameVersion);
        if ($hit === null) {
            return $this->item($entry, null, 'none', null, false, 'No matching mod was found.');
        }

        $exact = $this->normalise((string) $hit['title']) === $this->normalise($entry->name);

        return $this->judge($entry, 'modrinth', $hit['project_id'], null, 'name', $exact, $platform, $gameVersion);
    }

    /**
     * @return array{provider: string, project_id: string, version_ref: string|null}|null
     */
    private function fromLink(string $provider, string $slugOrId, ?string $versionRef): ?array
    {
        if ($provider === 'curseforge') {
            if (! $this->curseForge->available()) {
                return null;
            }
            $body = $this->api->get('/mods/search', ['gameId' => 432, 'slug' => $slugOrId]);
            $mod = is_array($body['data'] ?? null) ? ($body['data'][0] ?? null) : null;

            return is_array($mod) && isset($mod['id']) ? ['provider' => 'curseforge', 'project_id' => Json::id($mod['id']), 'version_ref' => $versionRef] : null;
        }

        $project = $this->modrinth->project($slugOrId);

        return is_string($project['id'] ?? null) ? ['provider' => 'modrinth', 'project_id' => $project['id'], 'version_ref' => $versionRef] : null;
    }

    /**
     * Looks the project up, picks a version and decides whether it can be installed.
     *
     * @param  bool  $trusted  whether the match is certain enough to be ticked
     * @return Item
     */
    private function judge(PrismEntry $entry, string $providerKey, string $projectId, ?string $versionRef, string $match, bool $trusted, DetectedPlatform $platform, ?string $gameVersion): array
    {
        $provider = $this->providers->get($providerKey);
        $project = $provider->project($projectId);

        $version = null;
        if ($versionRef !== null) {
            $version = $provider instanceof ModrinthProvider ? $provider->versionByReference($projectId, $versionRef) : $provider->version($projectId, $versionRef);
            if ($this->picker->problem($version, $platform, $gameVersion) !== null && $version['side'] !== 'client') {
                // The link's version does not fit this server: fall back to the newest one that does.
                $version = $this->picker->latest($provider, $projectId, $platform, $gameVersion);
            }
        } else {
            $version = $this->picker->latest($provider, $projectId, $platform, $gameVersion);
        }

        $side = $version['side'] ?? ($providerKey === 'modrinth' ? ModrinthClient::sideOf($this->modrinth->project($projectId)) : 'unknown');
        $matched = $version === null ? null : [
            'provider' => $providerKey,
            'project_id' => $projectId,
            'version_id' => $version['id'],
            'title' => $project['title'] ?? $projectId,
            'icon_url' => $project['icon_url'],
            'filename' => $version['file']['filename'] ?? '',
        ];

        if ($side === 'client') {
            return $this->item($entry, $matched ?? $this->bare($providerKey, $projectId, $project), $match, 'client', false, 'Client-only: this mod does nothing on a server.');
        }
        if ($version === null) {
            return $this->item($entry, $this->bare($providerKey, $projectId, $project), $match, $side, false, $this->picker->whyNone($provider, $projectId, $platform, $gameVersion));
        }

        $problem = $this->picker->problem($version, $platform, $gameVersion);
        if ($problem !== null) {
            return $this->item($entry, $matched, $match, $side, false, $problem);
        }
        if (! $version['distributable']) {
            return $this->item($entry, $matched, $match, $side, false, 'The author does not allow other sites to download this file.');
        }

        $reason = null;
        if (! $trusted) {
            $reason = 'Closest match by name. Check it before installing.';
        } elseif ($side === 'unknown') {
            $reason = 'Unverified: this file could not be checked against Modrinth, so it may be client-only.';
        }

        return $this->item($entry, $matched, $match, $side, true, $reason, $trusted && $side !== 'unknown');
    }

    /**
     * @param  array<string, mixed>  $project
     * @return Matched
     */
    private function bare(string $provider, string $projectId, array $project): array
    {
        return ['provider' => $provider, 'project_id' => $projectId, 'version_id' => '', 'title' => is_string($project['title'] ?? null) ? $project['title'] : $projectId, 'icon_url' => is_string($project['icon_url'] ?? null) ? $project['icon_url'] : null, 'filename' => ''];
    }

    /**
     * @param  Matched|null  $matched
     * @return Item
     */
    private function item(PrismEntry $entry, ?array $matched, string $match, ?string $side, bool $compatible, ?string $reason, bool $selected = false): array
    {
        return [
            'line' => $entry->line,
            'name' => $entry->name,
            'url' => $entry->url,
            'matched' => $matched,
            'match' => $match,
            'side' => $side,
            'compatible' => $compatible,
            'selected' => $compatible && $side !== 'unknown' && $selected,
            ...($reason === null ? [] : ['reason' => $reason]),
        ];
    }

    /**
     * The top Modrinth search hit for a query, limited to the server's loaders and game version.
     *
     * @param  list<string>  $loaders
     * @return array{project_id: string, title: string|null, slug: string|null}|null
     */
    private function searchTop(string $query, DetectedPlatform $platform, array $loaders, ?string $gameVersion): ?array
    {
        if (mb_trim($query) === '') {
            return null;
        }

        $result = $this->modrinthProvider->search($query, (string) $platform->project_type, $loaders, $gameVersion, 0, 1, 'relevance');
        $hit = $result['hits'][0] ?? null;

        return $hit === null || $hit['project_id'] === '' ? null : ['project_id' => $hit['project_id'], 'title' => $hit['title'], 'slug' => $hit['slug']];
    }

    /**
     * @param  array{project_id: string, title: string|null, slug: string|null}  $hit
     */
    private function same(string $name, array $hit): bool
    {
        $wanted = $this->normalise($name);

        return $wanted !== '' && ($this->normalise((string) $hit['slug']) === $wanted || $this->normalise((string) $hit['title']) === $wanted);
    }

    /**
     * `sodium-fabric-0.5.8+mc1.21.jar` becomes `sodium`: the leading words before a version or loader token.
     */
    private function slugish(string $filename): string
    {
        $base = (string) preg_replace('/\.(jar|disabled)$/i', '', (string) preg_replace('/\.disabled$/i', '', $filename));
        $words = [];
        foreach (preg_split('/[-_\s]+/', $base) ?: [] as $part) {
            if ($part === '' || preg_match('/^(v?\d|mc\d|fabric|forge|neoforge|quilt|bukkit|paper|spigot|1\.\d)/i', $part) === 1) {
                break;
            }
            $words[] = $part;
        }

        return implode('-', $words);
    }

    private function normalise(string $value): string
    {
        return (string) preg_replace('/[^a-z0-9]+/', '', mb_strtolower($value));
    }
}
