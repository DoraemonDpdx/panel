<?php

declare(strict_types=1);

namespace Pterodactyl\Services\Servers\Mods;

use Illuminate\Support\Facades\Log;
use Pterodactyl\Contracts\Files\PullsFiles;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Exceptions\Http\Connection\DaemonConnectionException;
use Pterodactyl\Exceptions\Mods\ClientOnlyException;
use Pterodactyl\Exceptions\Mods\NotDistributableException;
use Pterodactyl\Exceptions\Mods\ProviderUnavailableException;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Facades\Daemon;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\ServerModInstall;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;
use Throwable;

/**
 * Installs, updates, toggles and removes mods and plugins through Wings.
 *
 * @phpstan-import-type ModVersion from ModProvider
 * @phpstan-import-type ModUpdate from ModProvider
 *
 * @phpstan-type InstalledRow array{id: int|null, project_id: string|null, version_id: string|null, slug: string|null, project_type: string|null, provider: string|null, page_url: string|null, distributable: bool, title: string, icon_url: string|null, filename: string, version_number: string|null, enabled: bool, tracked: bool, from_modpack: bool, present: bool|null, update: array{version_id: string, version_number: string}|null}
 */
class ModInstaller
{
    public const string JAR_PATTERN = '/^[\w.\-+]+\.jar$/';

    /** A file in the install directory: a jar, optionally disabled. */
    public const string DISK_FILE_PATTERN = '/^[\w.\-+]+\.jar(\.disabled)?$/';

    private const string DISABLED_SUFFIX = '.disabled';

    /** Seconds to wait for Wings when listing the install directory for the installed list. */
    private const int LIST_TIMEOUT = 5;

    public function __construct(private readonly ModrinthClient $modrinth, private readonly ModProviderRegistry $providers, private readonly PullsFiles $pull) {}

    /**
     * Installs a version, or switches an installed project to it (newer or older), replacing the old file.
     * A disabled mod stays disabled. When a file is being replaced the pull runs in the foreground, so the
     * old jar is deleted only once the new one is on disk; if the pull fails the old file and row stay.
     */
    public function install(Server $server, DetectedPlatform $platform, ModProvider $provider, string $projectId, string $versionId): ServerModInstall
    {
        $dir = $this->installDir($platform);
        if (! $provider->available()) {
            throw new ProviderUnavailableException($provider->key());
        }

        $version = $provider->version($projectId, $versionId);

        if ($version['project_id'] !== $projectId) {
            throw new DisplayException('That version does not belong to the selected project.');
        }
        // CurseForge does not always list a loader for plugin files, so an empty list is accepted there.
        $acceptsEmpty = $provider->key() === 'curseforge' && $platform->project_type === 'plugin' && $version['loaders'] === [];
        if (! LoaderCompatibility::accepts((string) $platform->platform, $version['loaders']) && ! $acceptsEmpty) {
            throw new DisplayException('That version does not support this server\'s loader.');
        }
        if ($version['side'] === 'client') {
            throw new ClientOnlyException($provider->project($projectId)['title'] ?? null);
        }
        if (! $version['distributable']) {
            throw new NotDistributableException($version['page_url']);
        }

        $file = $this->chooseFile($version, $provider);
        $project = $provider->project($projectId);

        $existing = $server->modInstalls()->where('provider', $provider->key())->where('project_id', $projectId)->first();
        $enabled = $existing->enabled ?? true;
        $target = $file['filename'].($enabled ? '' : self::DISABLED_SUFFIX);

        $options = ['filename' => $target, 'foreground' => $existing instanceof ServerModInstall];
        if ($options['foreground']) {
            $options['timeout'] = 300;
        }
        // Throws on failure, before anything is changed.
        $this->pull->pull($server, $file['url'], '/'.$dir, $options);

        $oldDiskName = $existing instanceof ServerModInstall ? $this->diskName($existing->filename, $existing->enabled) : null;
        $oldDir = $existing->install_dir ?? $dir;

        $install = $server->modInstalls()->updateOrCreate(
            ['provider' => $provider->key(), 'project_id' => $projectId],
            [
                'version_id' => $version['id'],
                'slug' => $project['slug'],
                'project_type' => $platform->project_type ?? 'mod',
                'title' => $project['title'] ?? $version['name'] ?? $projectId,
                'icon_url' => $project['icon_url'],
                'filename' => $file['filename'],
                'version_number' => $version['version_number'] ?? '',
                'sha512' => $file['sha512'],
                'sha1' => $file['sha1'],
                'install_dir' => $dir,
                'enabled' => $enabled,
            ],
        );

        if ($oldDiskName !== null && ($oldDiskName !== $target || $oldDir !== $dir)) {
            try {
                Daemon::server($server)->files()->deleteFiles('/'.$oldDir, [$oldDiskName]);
            } catch (Throwable $exception) {
                Log::warning('Could not delete the replaced mod file.', ['server' => $server->uuid, 'file' => $oldDiskName, 'exception' => $exception->getMessage()]);
            }
        }

        Activity::event('server:mods.install')->subject($server)->property(['title' => $install->title, 'filename' => $install->filename, 'version' => $install->version_number, 'project_id' => $projectId, 'provider' => $provider->key()])->log();

        return $install;
    }

    /**
     * Enables or disables a jar by renaming it to or from `.jar.disabled`.
     *
     * @return InstalledRow
     */
    public function toggle(Server $server, DetectedPlatform $platform, string $filename, bool $enabled): array
    {
        $dir = $this->installDir($platform);
        $files = $this->diskFiles($server, $dir);
        $this->assertOnDisk($files, $filename);

        $base = $this->baseName($filename);
        $isEnabled = ! str_ends_with($filename, self::DISABLED_SUFFIX);

        if ($isEnabled !== $enabled) {
            $to = $this->diskName($base, $enabled);
            if (in_array($to, $files, true)) {
                throw new DisplayException("A file named $to already exists.");
            }

            Daemon::server($server)->files()->renameFiles('/'.$dir, [['from' => $filename, 'to' => $to]]);
            Activity::event($enabled ? 'server:mods.enable' : 'server:mods.disable')->subject($server)->property(['filename' => $base])->log();
        }

        $install = $server->modInstalls()->where('filename', $base)->first();
        $install?->forceFill(['enabled' => $enabled])->save();

        return $install instanceof ServerModInstall
            ? $this->row($install, true, null, $this->diskName($base, $enabled))
            : $this->untrackedRow($this->diskName($base, $enabled));
    }

    /**
     * Deletes a jar (enabled or disabled) and its tracking row, if any.
     */
    public function delete(Server $server, DetectedPlatform $platform, string $filename): void
    {
        $dir = $this->installDir($platform);
        $this->assertOnDisk($this->diskFiles($server, $dir), $filename);

        Daemon::server($server)->files()->deleteFiles('/'.$dir, [$filename]);

        $base = $this->baseName($filename);
        $install = $server->modInstalls()->where('filename', $base)->first();
        $install?->delete();

        Activity::event('server:mods.remove')->subject($server)->property(['title' => $install->title ?? $base, 'filename' => $base])->log();
    }

    /**
     * Removes a tracked install by id, whichever state its file is in.
     */
    public function remove(Server $server, ServerModInstall $install): void
    {
        $files = $this->diskFiles($server, $install->install_dir);
        $onDisk = array_find([$this->diskName($install->filename, true), $this->diskName($install->filename, false)], fn (string $name): bool => in_array($name, $files, true));

        if ($onDisk !== null) {
            Daemon::server($server)->files()->deleteFiles('/'.$install->install_dir, [$onDisk]);
        }

        $install->delete();

        Activity::event('server:mods.remove')->subject($server)->property(['title' => $install->title, 'filename' => $install->filename])->log();
    }

    /**
     * Every jar in the install directory, tracked or not, with update info for tracked ones.
     *
     * When Wings cannot be reached the tracked rows are returned with `present: null` and no untracked jars,
     * and `disk_unavailable` is true, rather than failing the whole list.
     *
     * @return array{rows: list<InstalledRow>, disk_unavailable: bool}
     */
    public function installed(Server $server, DetectedPlatform $platform): array
    {
        $dir = $this->installDir($platform);
        $installs = $server->modInstalls()->where('install_dir', $dir)->orderBy('title')->get();

        try {
            $disk = $this->diskFiles($server, $dir, self::LIST_TIMEOUT);
        } catch (DaemonConnectionException) {
            return [
                'rows' => array_values($installs->map(fn (ServerModInstall $install): array => $this->row($install, null))->all()),
                'disk_unavailable' => true,
            ];
        }

        $updates = $this->updates($platform, $installs, $disk);

        $rows = [];
        $claimed = [];
        foreach ($installs as $install) {
            $name = array_find([$this->diskName($install->filename, $install->enabled), $this->diskName($install->filename, ! $install->enabled)], fn (string $candidate): bool => in_array($candidate, $disk, true));
            $present = $name !== null;
            if ($present) {
                $claimed[] = $name;
                $install->enabled = ! str_ends_with($name, self::DISABLED_SUFFIX);
            }

            $update = $present ? ($updates[$install->provider][$install->project_id] ?? null) : null;
            $newer = $update !== null && $update['version_id'] !== $install->version_id ? $update : null;

            $rows[] = $this->row($install, $present, $newer, $name ?? $this->diskName($install->filename, $install->enabled));
        }

        foreach ($disk as $name) {
            if (! in_array($name, $claimed, true)) {
                $rows[] = $this->untrackedRow($name);
            }
        }

        return ['rows' => $rows, 'disk_unavailable' => false];
    }

    /**
     * @param  array{version_id: string, version_number: string}|null  $update
     * @return InstalledRow
     */
    public function row(ServerModInstall $install, ?bool $present = true, ?array $update = null, ?string $diskName = null): array
    {
        return [
            'id' => $install->id,
            'project_id' => $install->project_id,
            'version_id' => $install->version_id,
            'slug' => $install->slug,
            'project_type' => $install->project_type,
            'provider' => $install->provider,
            'page_url' => $this->pageUrl($install),
            'distributable' => true,
            'title' => $install->title,
            'icon_url' => $install->icon_url,
            'filename' => $diskName ?? $this->diskName($install->filename, $install->enabled),
            'version_number' => $install->version_number,
            'enabled' => $install->enabled,
            'tracked' => true,
            'from_modpack' => $install->from_modpack,
            'present' => $present,
            'update' => $update,
        ];
    }

    public function resolveGameVersion(DetectedPlatform $platform, ?string $override = null): ?string
    {
        $version = $override ?? $platform->game_version;

        return $version === 'latest' ? $this->modrinth->latestGameVersion() : $version;
    }

    /**
     * The version's file. Only a plain jar name on one of the provider's own download hosts is accepted.
     *
     * @param  ModVersion  $version
     * @return array{url: string, filename: string, sha512: string|null, sha1: string|null}
     */
    public function chooseFile(array $version, ModProvider $provider): array
    {
        $file = $version['file'];
        if ($file === null || $file['filename'] === null) {
            throw new DisplayException('That version has no downloadable jar file.');
        }

        $filename = $file['filename'];
        if ($filename !== basename($filename) || preg_match(self::JAR_PATTERN, $filename) !== 1) {
            throw new DisplayException('That version has a file name that cannot be installed.');
        }

        $url = $file['url'];
        if ($url === null) {
            throw new NotDistributableException($version['page_url']);
        }
        $parts = parse_url($url);
        if ($parts === false || ($parts['scheme'] ?? null) !== 'https' || ! in_array($parts['host'] ?? null, $provider->downloadHosts(), true) || isset($parts['user']) || isset($parts['pass']) || isset($parts['port'])) {
            throw new DisplayException('That file is not hosted on the provider\'s download servers and cannot be installed.');
        }

        return ['url' => $url, 'filename' => $filename, 'sha512' => $file['sha512'], 'sha1' => $file['sha1']];
    }

    /**
     * @return InstalledRow
     */
    private function untrackedRow(string $diskName): array
    {
        return [
            'id' => null,
            'project_id' => null,
            'version_id' => null,
            'slug' => null,
            'project_type' => null,
            'provider' => null,
            'page_url' => null,
            'distributable' => true,
            'title' => mb_substr($this->baseName($diskName), 0, -4),
            'icon_url' => null,
            'filename' => $diskName,
            'version_number' => null,
            'enabled' => ! str_ends_with($diskName, self::DISABLED_SUFFIX),
            'tracked' => false,
            'from_modpack' => false,
            'present' => true,
            'update' => null,
        ];
    }

    /**
     * Newest compatible versions per provider and project ID, for installs whose file is on disk.
     *
     * @param  iterable<ServerModInstall>  $installs
     * @param  list<string>  $disk
     * @return array<string, array<string, ModUpdate>>
     */
    private function updates(DetectedPlatform $platform, iterable $installs, array $disk): array
    {
        $byProvider = [];
        foreach ($installs as $install) {
            if (in_array($install->filename, $disk, true) || in_array($install->filename.self::DISABLED_SUFFIX, $disk, true)) {
                $byProvider[$install->provider][] = $install;
            }
        }

        $updates = [];
        $gameVersion = null;
        $resolved = false;
        foreach ($byProvider as $key => $group) {
            $provider = $this->providers->get($key);
            if (! $provider->available()) {
                continue;
            }

            try {
                if (! $resolved) {
                    $gameVersion = $this->resolveGameVersion($platform);
                    $resolved = true;
                }
                $updates[$key] = $provider->latestFor($group, LoaderCompatibility::for((string) $platform->platform), $gameVersion);
            } catch (DisplayException) {
                // Update info is a convenience; the list still works when a provider is down.
            }
        }

        return $updates;
    }

    private function pageUrl(ServerModInstall $install): ?string
    {
        if ($install->slug === null) {
            return null;
        }

        return match ($install->provider) {
            'curseforge' => 'https://www.curseforge.com/minecraft/'.($install->project_type === 'plugin' ? 'bukkit-plugins' : 'mc-mods').'/'.$install->slug,
            default => "https://modrinth.com/{$install->project_type}/{$install->slug}",
        };
    }

    private function installDir(DetectedPlatform $platform): string
    {
        // Always from the detector, never from the request.
        return $platform->install_dir ?? throw new DisplayException('This server does not support mods.');
    }

    /**
     * Names of the files in the install directory that look like jars.
     *
     * @return list<string>
     */
    private function diskFiles(Server $server, string $dir, ?int $timeout = null): array
    {
        try {
            $listing = Daemon::server($server)->files()->getDirectory('/'.$dir, $timeout);
        } catch (DaemonConnectionException $exception) {
            if ($exception->getStatusCode() === 404) {
                return [];
            }

            throw $exception;
        }

        $names = [];
        foreach ($listing as $entry) {
            $name = $entry['name'] ?? null;
            if (($entry['file'] ?? true) !== false && is_string($name) && preg_match(self::DISK_FILE_PATTERN, $name) === 1) {
                $names[] = $name;
            }
        }

        return $names;
    }

    /** @param list<string> $files */
    private function assertOnDisk(array $files, string $filename): void
    {
        if (preg_match(self::DISK_FILE_PATTERN, $filename) !== 1 || $filename !== basename($filename) || ! in_array($filename, $files, true)) {
            throw new NotFoundHttpException('That file was not found in the server\'s mod directory.');
        }
    }

    private function baseName(string $diskName): string
    {
        return str_ends_with($diskName, self::DISABLED_SUFFIX) ? mb_substr($diskName, 0, -mb_strlen(self::DISABLED_SUFFIX)) : $diskName;
    }

    private function diskName(string $base, bool $enabled): string
    {
        return $enabled ? $base : $base.self::DISABLED_SUFFIX;
    }
}
