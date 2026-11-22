<?php

declare(strict_types=1);

namespace Pterodactyl\Services\Servers\Mods\Content;

use Pterodactyl\Exceptions\Mods\ContentUnavailableException;
use Pterodactyl\Exceptions\Software\InvalidInstallPlanException;
use Pterodactyl\Models\InstallOperation;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\User;
use Pterodactyl\Services\Servers\Mods\CurseForgeApi;
use Pterodactyl\Services\Servers\Software\InstallPlan;
use Pterodactyl\Services\Servers\Software\ServerFileWiper;
use Throwable;

/**
 * Previews and installs modpacks, from Modrinth, CurseForge, or an archive the user uploaded.
 *
 * @phpstan-import-type Pending from ContentFinalizer
 */
class ModpackInstaller
{
    public function __construct(
        private readonly ModpackResolver $resolver,
        private readonly ContentRunner $runner,
        private readonly ServerFileWiper $wiper,
        private readonly ServerFiles $files,
        private readonly CurseForgeApi $curseForge,
    ) {}

    /**
     * What installing would do. Changes nothing.
     */
    public function preview(string $provider, string $projectId, string $versionId): ResolvedPack
    {
        return $this->resolver->resolve($provider, $projectId, $versionId, false);
    }

    public function install(Server $server, User $by, string $provider, string $projectId, string $versionId, bool $wipe, bool $keepWorlds): InstallOperation
    {
        $this->runner->assertManaged($server);

        $pack = $this->resolver->resolve($provider, $projectId, $versionId, true);

        return $this->run($server, $by, $pack, $wipe, $keepWorlds, []);
    }

    /**
     * Installs an `.mrpack` or a CurseForge pack zip the user uploaded to the server.
     */
    public function importLocal(Server $server, User $by, string $path, bool $wipe, bool $keepWorlds): InstallOperation
    {
        $this->runner->assertManaged($server);

        $staged = $this->files->stage($server, $path);

        try {
            $this->files->unpack($server, $staged);

            $pack = $this->resolveStaged($server, $staged);

            $this->files->clearUnpacked($server, $staged);

            return $this->run($server, $by, $pack, $wipe, $keepWorlds, [$staged['dir']]);
        } catch (Throwable $exception) {
            $this->files->restore($server, $staged);

            throw $exception;
        }
    }

    /**
     * @param  list<string>  $cleanup
     */
    private function run(Server $server, User $by, ResolvedPack $pack, bool $wipe, bool $keepWorlds, array $cleanup): InstallOperation
    {
        try {
            $plan = new InstallPlan(
                'modpack',
                $wipe,
                $wipe ? $this->wiper->keepList($server, $keepWorlds, true) : InstallPlan::DEFAULT_KEEP,
                $pack->software,
                files: $pack->files,
                archives: $pack->archives,
            );
        } catch (InvalidInstallPlanException $exception) {
            throw new ContentUnavailableException('invalid_pack', 'This modpack cannot be installed: '.$exception->getMessage());
        }

        $pending = [
            'modpack' => ['provider' => $pack->provider, 'project_id' => $pack->projectId, 'version_id' => $pack->versionId, 'title' => $pack->title, 'icon_url' => $pack->iconUrl, 'version_number' => $pack->versionNumber],
            'replace_mods' => $wipe,
            'mods' => $pack->mods,
            'cleanup' => $cleanup,
        ];

        return $this->runner->run($server, $by, $plan, 'modpack', [
            'title' => $pack->title,
            'version' => $pack->versionNumber,
            'provider' => $pack->provider,
            'type' => $pack->software['type'],
            'minecraft' => $pack->software['minecraft'],
            'loader' => $pack->software['loader'],
            'wipe' => $wipe,
            'keep_worlds' => $wipe ? $keepWorlds : true,
        ], $pending, $pack->software);
    }

    /**
     * @param  array{id: string, dir: string, zip: string, original: string}  $staged
     */
    private function resolveStaged(Server $server, array $staged): ResolvedPack
    {
        $root = '/'.$staged['dir'];
        $entries = $this->files->listing($server, $root);
        $dirs = array_values(array_map(fn (array $entry): string => $entry['name'], array_filter($entries, fn (array $entry): bool => $entry['directory'])));
        $source = ['local' => $staged['zip']];

        $index = $this->files->read($server, $root.'/modrinth.index.json');
        if ($index !== null && $index !== '') {
            $data = json_decode($index, true);
            if (! is_array($data)) {
                throw new ContentUnavailableException('invalid_pack', 'The modpack\'s index is not valid JSON.');
            }
            $data = array_filter($data, is_string(...), ARRAY_FILTER_USE_KEY);
            $meta = ['provider' => 'local', 'project_id' => 'local', 'version_id' => 'local', 'title' => is_string($data['name'] ?? null) ? $data['name'] : 'Imported modpack', 'icon_url' => null, 'version_number' => is_string($data['versionId'] ?? null) ? $data['versionId'] : 'imported'];

            return $this->resolver->fromMrpackIndex($data, $source, $dirs, $meta, true);
        }

        $manifest = $this->files->read($server, $root.'/manifest.json');
        if ($manifest !== null && $manifest !== '') {
            $data = json_decode($manifest, true);
            if (! is_array($data)) {
                throw new ContentUnavailableException('invalid_pack', 'The modpack\'s manifest is not valid JSON.');
            }
            if (! $this->curseForge->available()) {
                throw new ContentUnavailableException('provider_unavailable', 'This is a CurseForge pack, and CurseForge is not configured on this panel.');
            }
            $data = array_filter($data, is_string(...), ARRAY_FILTER_USE_KEY);
            $meta = ['provider' => 'local', 'project_id' => 'local', 'version_id' => 'local', 'title' => is_string($data['name'] ?? null) ? $data['name'] : 'Imported modpack', 'icon_url' => null, 'version_number' => is_string($data['version'] ?? null) ? $data['version'] : 'imported'];

            return $this->resolver->fromCurseForgeManifest($data, $source, $dirs, $meta, true);
        }

        throw new ContentUnavailableException('not_a_modpack', 'That file is not a Modrinth or CurseForge modpack.');
    }
}
