<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Controllers\Api\Client\Servers;

use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Validation\ValidationException;
use Knuckles\Scribe\Attributes\BodyParam;
use Knuckles\Scribe\Attributes\Endpoint;
use Knuckles\Scribe\Attributes\Group;
use Knuckles\Scribe\Attributes\QueryParam;
use Knuckles\Scribe\Attributes\Response as ScribeResponse;
use Knuckles\Scribe\Attributes\Subgroup;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Exceptions\Mods\NotDistributableException;
use Pterodactyl\Exceptions\Mods\ProviderUnavailableException;
use Pterodactyl\Http\Controllers\Api\Client\ClientApiController;
use Pterodactyl\Http\Requests\Api\Client\Servers\Mods\CategoriesRequest;
use Pterodactyl\Http\Requests\Api\Client\Servers\Mods\ChangeModVersionRequest;
use Pterodactyl\Http\Requests\Api\Client\Servers\Mods\DeleteModRequest;
use Pterodactyl\Http\Requests\Api\Client\Servers\Mods\InstallModRequest;
use Pterodactyl\Http\Requests\Api\Client\Servers\Mods\ModsReadRequest;
use Pterodactyl\Http\Requests\Api\Client\Servers\Mods\ProjectDetailsRequest;
use Pterodactyl\Http\Requests\Api\Client\Servers\Mods\ProjectVersionsRequest;
use Pterodactyl\Http\Requests\Api\Client\Servers\Mods\RemoveModRequest;
use Pterodactyl\Http\Requests\Api\Client\Servers\Mods\SearchModsRequest;
use Pterodactyl\Http\Requests\Api\Client\Servers\Mods\ToggleModRequest;
use Pterodactyl\Models\Server;
use Pterodactyl\Services\Servers\Mods\Content\ContentFinalizer;
use Pterodactyl\Services\Servers\Mods\DetectedPlatform;
use Pterodactyl\Services\Servers\Mods\LoaderCompatibility;
use Pterodactyl\Services\Servers\Mods\MinecraftPlatformDetector;
use Pterodactyl\Services\Servers\Mods\ModInstaller;
use Pterodactyl\Services\Servers\Mods\ModProvider;
use Pterodactyl\Services\Servers\Mods\ModProviderRegistry;

#[Group('Client API', 'Endpoints authenticated as a panel user using a client API token.')]
#[Subgroup('Server Mods', 'Search Modrinth and install, update, disable and remove mods or plugins on an accessible Minecraft server.')]
class ModsController extends ClientApiController
{
    private const array INSTALLED_ROW_EXAMPLE = ['id' => 1, 'project_id' => 'AANobbMI', 'version_id' => 'tFw0iWAk', 'slug' => 'sodium', 'project_type' => 'mod', 'page_url' => 'https://modrinth.com/mod/sodium', 'title' => 'Sodium', 'icon_url' => null, 'provider' => 'modrinth', 'distributable' => true, 'filename' => 'sodium-fabric-0.6.0.jar', 'version_number' => '0.6.0', 'enabled' => true, 'tracked' => true, 'from_modpack' => false, 'present' => true, 'update' => null];

    private const array UNSUPPORTED = ['error' => 'mods_unsupported'];

    private const array PROVIDER_UNAVAILABLE = ['error' => 'provider_unavailable'];

    public function __construct(
        private readonly MinecraftPlatformDetector $detector,
        private readonly ModProviderRegistry $providers,
        private readonly ModInstaller $installer,
        private readonly ContentFinalizer $finalizer,
    ) {}

    #[Endpoint('Get the mod platform', 'Returns the loader and Minecraft version detected for the server, and whether mods can be installed.')]
    #[ScribeResponse(['object' => 'mod_platform', 'attributes' => ['eligible' => true, 'platform' => 'fabric', 'game_version' => '1.21.4', 'project_type' => 'mod', 'install_dir' => 'mods', 'source' => 'egg_name', 'resolved_game_version' => '1.21.4', 'providers' => ['modrinth', 'curseforge']]], status: 200, description: 'Detected platform returned.')]
    public function platform(ModsReadRequest $request, Server $server): JsonResponse
    {
        $platform = $this->detector->detect($server);

        $resolved = null;
        if ($platform->eligible) {
            try {
                $resolved = $this->installer->resolveGameVersion($platform);
            } catch (DisplayException) {
                $resolved = null;
            }
        }

        return new JsonResponse(['object' => 'mod_platform', 'attributes' => [...$platform->toArray(), 'resolved_game_version' => $resolved, 'providers' => $this->providers->availableKeys()]]);
    }

    #[Endpoint('Search Modrinth', 'Searches for mods or plugins that run on the server: its loader (and the loaders it accepts, such as Fabric on Quilt) and Minecraft version. Client-only projects are left out.')]
    #[QueryParam('provider', 'string', 'modrinth or curseforge; defaults to modrinth.', required: false, example: 'modrinth')]
    #[QueryParam('query', 'string', 'Text to search for.', required: false, example: 'sodium')]
    #[QueryParam('game_version', 'string', 'Minecraft version, defaulting to the detected one.', required: false, example: '1.21.4')]
    #[QueryParam('category', 'string', 'A category id from the categories endpoint.', required: false, example: 'optimization')]
    #[QueryParam('offset', 'integer', 'Results to skip.', required: false, example: 0)]
    #[QueryParam('limit', 'integer', 'Results to return, at most 50.', required: false, example: 20)]
    #[QueryParam('sort', 'string', 'One of relevance, downloads, updated or newest.', required: false, example: 'relevance')]
    #[ScribeResponse(['object' => 'list', 'data' => [['project_id' => 'AANobbMI', 'slug' => 'sodium', 'title' => 'Sodium', 'description' => 'A rendering engine.', 'icon_url' => null, 'downloads' => 1000, 'author' => 'jellysquid3', 'categories' => ['optimization'], 'installed' => false, 'side' => 'both']], 'meta' => ['total' => 1, 'offset' => 0, 'limit' => 20, 'loader' => 'fabric', 'loaders' => ['fabric'], 'game_version' => '1.21.4']], status: 200, description: 'Search results returned.')]
    #[ScribeResponse(self::UNSUPPORTED, status: 409, description: 'This server cannot install mods.')]
    public function search(SearchModsRequest $request, Server $server): JsonResponse
    {
        $platform = $this->eligible($server);
        $provider = $this->provider($request);
        [$loaders, $gameVersion] = $this->filters($request, $platform);
        $offset = $request->integer('offset', 0);
        $limit = $request->integer('limit', 20);

        $result = $provider->search(
            $request->string('query')->toString(),
            (string) $platform->project_type,
            $loaders,
            $gameVersion,
            $offset,
            $limit,
            $request->string('sort', 'relevance')->toString(),
            $request->filled('category') ? $request->string('category')->toString() : null,
        );

        $ids = array_column($result['hits'], 'project_id');
        $installed = $server->modInstalls()->where('provider', $provider->key())->whereIn('project_id', $ids)->pluck('project_id')->all();

        $data = array_map(fn (array $hit): array => [...$hit, 'provider' => $provider->key(), 'installed' => in_array($hit['project_id'], $installed, true)], $result['hits']);

        return new JsonResponse([
            'object' => 'list',
            'data' => $data,
            'meta' => ['total' => $result['total'], 'offset' => $offset, 'limit' => $limit, 'loader' => $platform->platform, 'loaders' => $loaders, 'game_version' => $gameVersion, 'provider' => $provider->key()],
        ]);
    }

    #[Endpoint('List project versions', 'Lists the versions of a project built for a loader the server accepts, for its Minecraft version unless overridden. Files known to be client-only are left out.')]
    #[QueryParam('game_version', 'string', 'Minecraft version, defaulting to the detected one.', required: false, example: '1.21.4')]
    #[ScribeResponse(['object' => 'list', 'data' => [['id' => 'tFw0iWAk', 'name' => 'Sodium 0.6.0', 'version_number' => '0.6.0', 'version_type' => 'release', 'date_published' => '2025-01-01T00:00:00Z', 'game_versions' => ['1.21.4'], 'loaders' => ['fabric'], 'file' => ['filename' => 'sodium-fabric-0.6.0.jar', 'url' => 'https://cdn.modrinth.com/data/AANobbMI/versions/tFw0iWAk/sodium-fabric-0.6.0.jar', 'size' => 1024, 'sha512' => 'abc'], 'dependencies' => []]]], status: 200, description: 'Versions returned.')]
    #[ScribeResponse(self::UNSUPPORTED, status: 409, description: 'This server cannot install mods.')]
    public function versions(ProjectVersionsRequest $request, Server $server, string $projectId): JsonResponse
    {
        $platform = $this->eligible($server);
        $provider = $this->provider($request);
        [$loaders, $gameVersion] = $this->filters($request, $platform);

        $data = [];
        foreach ($provider->versions($projectId, $loaders, $gameVersion) as $version) {
            if ($version['file'] === null) {
                continue;
            }

            $data[] = [
                'provider' => $provider->key(),
                'id' => $version['id'],
                'name' => $version['name'],
                'version_number' => $version['version_number'],
                'version_type' => $version['version_type'],
                'date_published' => $version['date_published'],
                'game_versions' => $version['game_versions'],
                'loaders' => $version['loaders'],
                'file' => $version['file'],
                'dependencies' => $version['dependencies'],
                'distributable' => $version['distributable'],
                'page_url' => $version['page_url'],
                'side' => $version['side'],
            ];
        }

        return new JsonResponse(['object' => 'list', 'data' => $data]);
    }

    #[Endpoint('Get project details', 'Returns the description, screenshots and links of a project, as plain text and https links only.')]
    #[QueryParam('provider', 'string', 'modrinth or curseforge; defaults to modrinth.', required: false, example: 'modrinth')]
    #[ScribeResponse(['object' => 'mod_project', 'attributes' => ['project_id' => 'AANobbMI', 'body' => 'A rendering engine.', 'gallery' => [['url' => 'https://cdn.modrinth.com/data/AANobbMI/images/a.png', 'title' => 'Screenshot']], 'links' => ['source' => 'https://github.com/example/sodium', 'issues' => null, 'wiki' => null, 'discord' => null]]], status: 200, description: 'Project details returned.')]
    #[ScribeResponse(self::UNSUPPORTED, status: 409, description: 'This server cannot install mods.')]
    public function project(ProjectDetailsRequest $request, Server $server, string $projectId): JsonResponse
    {
        $this->eligible($server);

        return new JsonResponse(['object' => 'mod_project', 'attributes' => $this->provider($request)->details($projectId)]);
    }

    #[Endpoint('List categories', 'Lists the topic categories mods or plugins can be filtered by on this server.')]
    #[QueryParam('provider', 'string', 'modrinth or curseforge; defaults to modrinth.', required: false, example: 'modrinth')]
    #[ScribeResponse(['data' => [['id' => 'optimization', 'label' => 'Optimization']]], status: 200, description: 'Categories returned.')]
    #[ScribeResponse(self::UNSUPPORTED, status: 409, description: 'This server cannot install mods.')]
    public function categories(CategoriesRequest $request, Server $server): JsonResponse
    {
        $platform = $this->eligible($server);

        return new JsonResponse(['data' => $this->provider($request)->categories((string) $platform->project_type)]);
    }

    #[Endpoint('List installed mods', 'Lists every jar in the mod directory, tracked or not, with whether it is enabled and whether an update exists. When Wings cannot be reached it lists the tracked mods with present null and meta.disk_unavailable true.')]
    #[ScribeResponse(['object' => 'list', 'data' => [self::INSTALLED_ROW_EXAMPLE]], status: 200, description: 'Installed mods returned.')]
    #[ScribeResponse(self::UNSUPPORTED, status: 409, description: 'This server cannot install mods.')]
    public function installed(ModsReadRequest $request, Server $server): JsonResponse
    {
        $platform = $this->eligible($server);
        $this->finalizer->apply($server);

        $installed = $this->installer->installed($server, $platform);

        return new JsonResponse(['object' => 'list', 'data' => $installed['rows'], 'meta' => ['disk_unavailable' => $installed['disk_unavailable']]]);
    }

    #[Endpoint('Install a mod version', 'Has Wings download a Modrinth version into the mod directory. Installing another version of an installed project replaces the old file.')]
    #[BodyParam('provider', 'string', 'modrinth or curseforge; defaults to modrinth.', required: false, example: 'modrinth')]
    #[BodyParam('project_id', 'string', 'The project ID: 8 characters on Modrinth, digits on CurseForge.', example: 'AANobbMI')]
    #[BodyParam('version_id', 'string', 'The Modrinth version ID.', example: 'tFw0iWAk')]
    #[ScribeResponse(['object' => 'mod_install', 'attributes' => self::INSTALLED_ROW_EXAMPLE], status: 202, description: 'Install queued.')]
    #[ScribeResponse(self::UNSUPPORTED, status: 409, description: 'This server cannot install mods, or the provider is not configured.')]
    #[ScribeResponse(['error' => 'not_distributable', 'page_url' => 'https://www.curseforge.com/minecraft/mc-mods/example'], status: 422, description: 'The author does not allow this file to be downloaded by other sites.')]
    #[ScribeResponse(['error' => 'not_distributable', 'page_url' => 'https://www.curseforge.com/minecraft/mc-mods/example'], status: 422, description: 'The author does not allow this file to be downloaded by other sites.')]
    public function install(InstallModRequest $request, Server $server): JsonResponse
    {
        $platform = $this->eligible($server);
        $provider = $this->provider($request);

        return $this->respondWithInstall($server, $platform, $provider, $request->string('project_id')->toString(), $request->string('version_id')->toString());
    }

    #[Endpoint('Change an installed version', 'Switches an installed mod to any compatible version, newer or older. A disabled mod stays disabled.')]
    #[BodyParam('version_id', 'string', 'The Modrinth version ID.', example: 'tFw0iWAk')]
    #[ScribeResponse(['object' => 'mod_install', 'attributes' => self::INSTALLED_ROW_EXAMPLE], status: 202, description: 'Version change queued.')]
    #[ScribeResponse(self::UNSUPPORTED, status: 409, description: 'This server cannot install mods.')]
    public function changeVersion(ChangeModVersionRequest $request, Server $server, int $install): JsonResponse
    {
        $platform = $this->eligible($server);
        $row = $server->modInstalls()->findOrFail($install);
        $provider = $this->providers->get($row->provider);
        $versionId = $request->string('version_id')->toString();
        if (preg_match($provider->idPattern(), $versionId) !== 1) {
            throw ValidationException::withMessages(['version_id' => 'The version id format is invalid.']);
        }

        return $this->respondWithInstall($server, $platform, $provider, $row->project_id, $versionId);
    }

    #[Endpoint('Enable or disable a mod', 'Renames a jar to or from .jar.disabled. Works on jars the panel did not install.')]
    #[BodyParam('filename', 'string', 'The file name on disk, ending in .jar or .jar.disabled.', example: 'sodium-fabric-0.6.0.jar')]
    #[BodyParam('enabled', 'boolean', 'Whether the mod should be enabled.', example: false)]
    #[ScribeResponse(['object' => 'mod_install', 'attributes' => self::INSTALLED_ROW_EXAMPLE], status: 200, description: 'Mod toggled.')]
    #[ScribeResponse(self::UNSUPPORTED, status: 409, description: 'This server cannot install mods.')]
    public function toggle(ToggleModRequest $request, Server $server): JsonResponse
    {
        $platform = $this->eligible($server);
        $row = $this->installer->toggle($server, $platform, $request->string('filename')->toString(), $request->boolean('enabled'));

        return new JsonResponse(['object' => 'mod_install', 'attributes' => $row]);
    }

    #[Endpoint('Delete a mod by file name', 'Deletes a jar, enabled or disabled, and forgets it. Works on jars the panel did not install.')]
    #[BodyParam('filename', 'string', 'The file name on disk, ending in .jar or .jar.disabled.', example: 'sodium-fabric-0.6.0.jar')]
    #[ScribeResponse(status: 204, description: 'Mod deleted.')]
    #[ScribeResponse(self::UNSUPPORTED, status: 409, description: 'This server cannot install mods.')]
    public function delete(DeleteModRequest $request, Server $server): JsonResponse
    {
        $platform = $this->eligible($server);
        $this->installer->delete($server, $platform, $request->string('filename')->toString());

        return new JsonResponse([], Response::HTTP_NO_CONTENT);
    }

    #[Endpoint('Remove an installed mod', 'Deletes an installed mod by ID. Same as deleting it by file name.')]
    #[ScribeResponse(status: 204, description: 'Mod removed.')]
    #[ScribeResponse(self::UNSUPPORTED, status: 409, description: 'This server cannot install mods.')]
    public function remove(RemoveModRequest $request, Server $server, int $install): JsonResponse
    {
        $this->eligible($server);
        $this->installer->remove($server, $server->modInstalls()->findOrFail($install));

        return new JsonResponse([], Response::HTTP_NO_CONTENT);
    }

    /**
     * Runs an install and turns a file the author does not allow others to distribute into a 422 with the page to get it from.
     */
    private function respondWithInstall(Server $server, DetectedPlatform $platform, ModProvider $provider, string $projectId, string $versionId): JsonResponse
    {
        try {
            $install = $this->installer->install($server, $platform, $provider, $projectId, $versionId);
        } catch (NotDistributableException $exception) {
            return new JsonResponse(['error' => 'not_distributable', 'page_url' => $exception->pageUrl], Response::HTTP_UNPROCESSABLE_ENTITY);
        } catch (ProviderUnavailableException) {
            throw new HttpResponseException(new JsonResponse(self::PROVIDER_UNAVAILABLE, Response::HTTP_CONFLICT));
        }

        return new JsonResponse(['object' => 'mod_install', 'attributes' => $this->installer->row($install)], Response::HTTP_ACCEPTED);
    }

    /**
     * The requested provider (Modrinth unless given), or a 409 when it is not configured.
     */
    private function provider(Request $request): ModProvider
    {
        $key = $request->input('provider', ModProviderRegistry::DEFAULT);
        $provider = $this->providers->get(is_string($key) ? $key : ModProviderRegistry::DEFAULT);
        if (! $provider->available()) {
            throw new HttpResponseException(new JsonResponse(self::PROVIDER_UNAVAILABLE, Response::HTTP_CONFLICT));
        }

        return $provider;
    }

    /**
     * The detected platform, or a 409 when the server cannot take mods.
     */
    private function eligible(Server $server): DetectedPlatform
    {
        $platform = $this->detector->detect($server);
        if (! $platform->eligible || $platform->install_dir === null || $platform->platform === null) {
            throw new HttpResponseException(new JsonResponse(self::UNSUPPORTED, Response::HTTP_CONFLICT));
        }

        return $platform;
    }

    /**
     * @return array{0: list<string>, 1: string|null} the loaders the server accepts and the resolved game version. There is
     *                                                no loader override: the loader changes only on the Software page.
     */
    private function filters(SearchModsRequest|ProjectVersionsRequest $request, DetectedPlatform $platform): array
    {
        $override = $request->filled('game_version') ? $request->string('game_version')->toString() : null;

        return [LoaderCompatibility::for((string) $platform->platform), $this->installer->resolveGameVersion($platform, $override)];
    }
}
