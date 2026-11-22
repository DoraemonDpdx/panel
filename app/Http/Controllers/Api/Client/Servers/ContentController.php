<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Controllers\Api\Client\Servers;

use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\JsonResponse;
use Knuckles\Scribe\Attributes\BodyParam;
use Knuckles\Scribe\Attributes\Endpoint;
use Knuckles\Scribe\Attributes\Group;
use Knuckles\Scribe\Attributes\QueryParam;
use Knuckles\Scribe\Attributes\Response as ScribeResponse;
use Knuckles\Scribe\Attributes\Subgroup;
use Pterodactyl\Exceptions\Mods\NotDistributableException;
use Pterodactyl\Http\Controllers\Api\Client\ClientApiController;
use Pterodactyl\Http\Requests\Api\Client\Servers\Content\ModpackImportLocalRequest;
use Pterodactyl\Http\Requests\Api\Client\Servers\Content\ModpackInstallRequest;
use Pterodactyl\Http\Requests\Api\Client\Servers\Content\ModpackPreviewRequest;
use Pterodactyl\Http\Requests\Api\Client\Servers\Content\ModpackSearchRequest;
use Pterodactyl\Http\Requests\Api\Client\Servers\Content\ModpackVersionsRequest;
use Pterodactyl\Http\Requests\Api\Client\Servers\Content\PrismInstallRequest;
use Pterodactyl\Http\Requests\Api\Client\Servers\Content\PrismPreviewRequest;
use Pterodactyl\Http\Requests\Api\Client\Servers\Content\ResolveLinkRequest;
use Pterodactyl\Http\Requests\Api\Client\Servers\Content\WorldImportLocalRequest;
use Pterodactyl\Http\Requests\Api\Client\Servers\Content\WorldInstallRequest;
use Pterodactyl\Http\Requests\Api\Client\Servers\Content\WorldSearchRequest;
use Pterodactyl\Models\Server;
use Pterodactyl\Services\Servers\Mods\Content\ContentFinalizer;
use Pterodactyl\Services\Servers\Mods\Content\ContentRunner;
use Pterodactyl\Services\Servers\Mods\Content\LinkResolver;
use Pterodactyl\Services\Servers\Mods\Content\ModpackCatalog;
use Pterodactyl\Services\Servers\Mods\Content\ModpackInstaller;
use Pterodactyl\Services\Servers\Mods\Content\PrismImporter;
use Pterodactyl\Services\Servers\Mods\Content\WorldInstaller;
use Pterodactyl\Services\Servers\Mods\Json;
use Pterodactyl\Services\Servers\Mods\ModProviderRegistry;

#[Group('Client API', 'Endpoints authenticated as a panel user using a client API token.')]
#[Subgroup('Server Content', 'Install modpacks and worlds, resolve pasted links and import Prism Launcher mod lists on a Minecraft Java server.')]
class ContentController extends ClientApiController
{
    private const array OPERATION_EXAMPLE = ['id' => 1, 'kind' => 'modpack', 'status' => 'running', 'summary' => ['title' => 'Fabulously Optimized', 'type' => 'fabric', 'minecraft' => '1.21.1'], 'error' => null, 'started_at' => '2026-11-21T10:00:00+00:00', 'finished_at' => null];

    private const array PROVIDER_UNAVAILABLE = ['error' => 'provider_unavailable'];

    public function __construct(
        private readonly ModpackCatalog $catalog,
        private readonly ModpackInstaller $modpacks,
        private readonly WorldInstaller $worlds,
        private readonly LinkResolver $links,
        private readonly PrismImporter $prism,
        private readonly ModProviderRegistry $providers,
        private readonly ContentRunner $runner,
        private readonly ContentFinalizer $finalizer,
    ) {}

    #[Endpoint('Search modpacks', 'Searches Modrinth or CurseForge modpacks. Not limited to the server\'s loader, since a modpack may change it; every row says the loader and Minecraft version it needs. Client-only packs are left out.')]
    #[QueryParam('provider', 'string', 'modrinth or curseforge; defaults to modrinth.', required: false, example: 'modrinth')]
    #[QueryParam('query', 'string', 'Text to search for.', required: false, example: 'optimized')]
    #[ScribeResponse(['object' => 'list', 'data' => [['provider' => 'modrinth', 'project_id' => 'BYfVnHa7', 'title' => 'Fabulously Optimized', 'loader' => 'fabric', 'minecraft' => '1.21.1', 'downloads' => 1000]], 'meta' => ['total' => 1, 'offset' => 0, 'limit' => 20, 'provider' => 'modrinth']], status: 200, description: 'Modpacks returned.')]
    public function searchModpacks(ModpackSearchRequest $request, Server $server): JsonResponse
    {
        $this->runner->assertJava($server);

        return $this->browse($request->string('provider', 'modrinth')->toString(), 'modpack', $request->string('query')->toString(), $request->filled('game_version') ? $request->string('game_version')->toString() : null, $request->integer('offset', 0), $request->integer('limit', 20), $request->string('sort', 'relevance')->toString());
    }

    #[Endpoint('List modpack versions', 'Lists the versions of a modpack, each with the loader and Minecraft version it needs.')]
    #[ScribeResponse(['object' => 'list', 'data' => [['provider' => 'modrinth', 'id' => 'abcdefgh', 'version_number' => '1.0.0', 'loader' => 'fabric', 'minecraft' => '1.21.1', 'server_pack' => false]]], status: 200, description: 'Versions returned.')]
    public function modpackVersions(ModpackVersionsRequest $request, Server $server, string $provider, string $projectId): JsonResponse
    {
        $this->runner->assertJava($server);
        $this->available($provider);

        return new JsonResponse(['object' => 'list', 'data' => $this->catalog->versions($provider, $projectId)]);
    }

    #[Endpoint('Preview a modpack install', 'Works out what installing a modpack version would do, without installing anything.')]
    #[BodyParam('provider', 'string', 'modrinth or curseforge.', example: 'modrinth')]
    #[BodyParam('project_id', 'string', 'The modpack project ID.', example: 'BYfVnHa7')]
    #[BodyParam('version_id', 'string', 'The modpack version or file ID.', example: 'abcdefgh')]
    #[ScribeResponse(['object' => 'modpack_preview', 'attributes' => ['software' => ['type' => 'fabric', 'minecraft' => '1.21.1', 'loader' => '0.16.9'], 'files' => ['server' => 142, 'skipped_client' => 31, 'unverified' => 0], 'size_bytes' => 52428800, 'warnings' => []]], status: 200, description: 'Preview returned.')]
    #[ScribeResponse(['error' => 'client_only'], status: 422, description: 'The modpack is client-only.')]
    public function previewModpack(ModpackPreviewRequest $request, Server $server): JsonResponse
    {
        $this->runner->assertJava($server);
        $this->available($request->string('provider')->toString());

        $pack = $this->modpacks->preview($request->string('provider')->toString(), $request->string('project_id')->toString(), $request->string('version_id')->toString());

        return new JsonResponse(['object' => 'modpack_preview', 'attributes' => $pack->preview()]);
    }

    #[Endpoint('Install a modpack', 'Switches the server to the modpack\'s software and installs its server files through the install container.')]
    #[BodyParam('provider', 'string', 'modrinth or curseforge.', example: 'modrinth')]
    #[BodyParam('project_id', 'string', 'The modpack project ID.', example: 'BYfVnHa7')]
    #[BodyParam('version_id', 'string', 'The modpack version or file ID.', example: 'abcdefgh')]
    #[BodyParam('wipe', 'object', 'Start fresh: {enabled, keep_worlds}.', required: false)]
    #[ScribeResponse(self::OPERATION_EXAMPLE, status: 202, description: 'The install started.')]
    public function installModpack(ModpackInstallRequest $request, Server $server): JsonResponse
    {
        $this->runner->assertManaged($server);
        $this->available($request->string('provider')->toString());

        $operation = $this->modpacks->install($server, $request->user(), $request->string('provider')->toString(), $request->string('project_id')->toString(), $request->string('version_id')->toString(), $request->boolean('wipe.enabled'), $request->boolean('wipe.keep_worlds', true));

        return new JsonResponse($operation->toPayload(), 202);
    }

    #[Endpoint('Import a modpack archive', 'Installs a .mrpack or modpack .zip the user uploaded to the server. The file is moved into a staging folder under .astrelyse and removed once the install finishes.')]
    #[BodyParam('path', 'string', 'Server-relative path of the .mrpack or .zip.', example: '.astrelyse/uploads/pack.mrpack')]
    #[BodyParam('wipe', 'object', 'Start fresh: {enabled, keep_worlds}.', required: false)]
    #[ScribeResponse(self::OPERATION_EXAMPLE, status: 202, description: 'The install started.')]
    #[ScribeResponse(['error' => 'not_a_modpack'], status: 422, description: 'The file is not a modpack.')]
    public function importModpack(ModpackImportLocalRequest $request, Server $server): JsonResponse
    {
        $operation = $this->modpacks->importLocal($server, $request->user(), $request->string('path')->toString(), $request->boolean('wipe.enabled'), $request->boolean('wipe.keep_worlds', true));

        return new JsonResponse($operation->toPayload(), 202);
    }

    #[Endpoint('Search worlds', 'Searches CurseForge worlds. Needs a CurseForge API key.')]
    #[QueryParam('query', 'string', 'Text to search for.', required: false, example: 'skyblock')]
    #[ScribeResponse(['object' => 'list', 'data' => [['provider' => 'curseforge', 'project_id' => '123', 'title' => 'A World', 'minecraft' => '1.21.1']], 'meta' => ['total' => 1, 'offset' => 0, 'limit' => 20, 'provider' => 'curseforge']], status: 200, description: 'Worlds returned.')]
    #[ScribeResponse(self::PROVIDER_UNAVAILABLE, status: 409, description: 'CurseForge is not configured.')]
    public function searchWorlds(WorldSearchRequest $request, Server $server): JsonResponse
    {
        $this->runner->assertJava($server);

        return $this->browse('curseforge', 'world', $request->string('query')->toString(), $request->filled('game_version') ? $request->string('game_version')->toString() : null, $request->integer('offset', 0), $request->integer('limit', 20), $request->string('sort', 'relevance')->toString());
    }

    #[Endpoint('List world files', 'Lists the downloadable files of a CurseForge world.')]
    #[ScribeResponse(['object' => 'list', 'data' => [['provider' => 'curseforge', 'id' => '456', 'minecraft' => '1.21.1']]], status: 200, description: 'Files returned.')]
    public function worldVersions(ModpackVersionsRequest $request, Server $server, string $projectId): JsonResponse
    {
        $this->runner->assertJava($server);
        $this->available('curseforge');

        return new JsonResponse(['object' => 'list', 'data' => $this->catalog->versions('curseforge', $projectId)]);
    }

    #[Endpoint('Install a CurseForge world', 'Puts a CurseForge world into the server, replacing the current world (optionally backing it up) or alongside it as a new world.')]
    #[BodyParam('project_id', 'string', 'The CurseForge project ID.', example: '123')]
    #[BodyParam('file_id', 'string', 'The CurseForge file ID.', example: '456')]
    #[BodyParam('mode', 'string', 'replace (default) or new.', required: false, example: 'replace')]
    #[BodyParam('backup', 'boolean', 'Rename the old world to world-backup-<date> first. Defaults to true.', required: false, example: true)]
    #[BodyParam('level_name', 'string', 'The folder of the new world, for mode new.', required: false, example: 'skyblock')]
    #[ScribeResponse(self::OPERATION_EXAMPLE, status: 202, description: 'The install started.')]
    #[ScribeResponse(['error' => 'not_a_world'], status: 422, description: 'The download has no level.dat.')]
    public function installWorld(WorldInstallRequest $request, Server $server): JsonResponse
    {
        $this->runner->assertManaged($server);
        $this->available('curseforge');

        try {
            $operation = $this->worlds->installCurseForge($server, $request->user(), $request->string('project_id')->toString(), $request->string('file_id')->toString(), $request->string('mode', 'replace')->toString() === 'new' ? 'new' : 'replace', $request->boolean('backup', true), $request->filled('level_name') ? $request->string('level_name')->toString() : null);
        } catch (NotDistributableException $exception) {
            return new JsonResponse(['error' => 'not_distributable', 'page_url' => $exception->pageUrl], 422);
        }

        return new JsonResponse($operation->toPayload(), 202);
    }

    #[Endpoint('Import a world zip', 'Installs a world zip the user uploaded to the server. The folder with level.dat is found and unpacked into the level folder.')]
    #[BodyParam('path', 'string', 'Server-relative path of the .zip.', example: '.astrelyse/uploads/world.zip')]
    #[BodyParam('mode', 'string', 'replace (default) or new.', required: false, example: 'replace')]
    #[BodyParam('backup', 'boolean', 'Rename the old world to world-backup-<date> first. Defaults to true.', required: false, example: true)]
    #[BodyParam('level_name', 'string', 'The folder of the new world, for mode new.', required: false, example: 'skyblock')]
    #[ScribeResponse(self::OPERATION_EXAMPLE, status: 202, description: 'The install started.')]
    #[ScribeResponse(['error' => 'not_a_world'], status: 422, description: 'The zip has no level.dat.')]
    public function importWorld(WorldImportLocalRequest $request, Server $server): JsonResponse
    {
        $operation = $this->worlds->installLocal($server, $request->user(), $request->string('path')->toString(), $request->string('mode', 'replace')->toString() === 'new' ? 'new' : 'replace', $request->boolean('backup', true), $request->filled('level_name') ? $request->string('level_name')->toString() : null);

        return new JsonResponse($operation->toPayload(), 202);
    }

    #[Endpoint('Resolve a link', 'Reads a Modrinth or CurseForge link and says what it points at and whether it can be installed on this server.')]
    #[BodyParam('url', 'string', 'The link.', example: 'https://modrinth.com/mod/sodium')]
    #[ScribeResponse(['object' => 'content_link', 'attributes' => ['kind' => 'mod', 'provider' => 'modrinth', 'project_id' => 'AANobbMI', 'version_id' => 'tFw0iWAk', 'title' => 'Sodium', 'icon_url' => null, 'compatible' => true]], status: 200, description: 'Link resolved.')]
    #[ScribeResponse(['error' => 'unsupported_link'], status: 422, description: 'Not a link this panel can read.')]
    public function resolve(ResolveLinkRequest $request, Server $server): JsonResponse
    {
        $this->finalizer->apply($server);

        return new JsonResponse(['object' => 'content_link', 'attributes' => $this->links->resolve($server, $request->string('url')->toString())]);
    }

    #[Endpoint('Preview a Prism mod list', 'Matches every entry of a Prism Launcher "Export mod list" file to a project that runs on this server. Installs nothing.')]
    #[BodyParam('text', 'string', 'The exported list, at most 256 KB.', example: '- [Sodium](https://modrinth.com/mod/sodium)')]
    #[ScribeResponse(['object' => 'list', 'data' => [['line' => 1, 'name' => 'Sodium', 'url' => null, 'matched' => null, 'match' => 'none', 'side' => null, 'compatible' => false, 'selected' => false]], 'meta' => ['total' => 1, 'truncated' => false]], status: 200, description: 'Preview returned.')]
    public function previewPrism(PrismPreviewRequest $request, Server $server): JsonResponse
    {
        $result = $this->prism->preview($server, $request->string('text')->toString());

        return new JsonResponse(['object' => 'list', 'data' => $result['items'], 'meta' => ['total' => $result['total'], 'truncated' => $result['truncated']]]);
    }

    #[Endpoint('Install a Prism import', 'Re-checks every chosen item on the server, then installs them all as one install plan.')]
    #[BodyParam('items', 'object[]', 'The items to install: {provider, project_id, version_id}.')]
    #[ScribeResponse(self::OPERATION_EXAMPLE, status: 202, description: 'The install started.')]
    #[ScribeResponse(['error' => 'client_only'], status: 422, description: 'An item is client-only.')]
    public function installPrism(PrismInstallRequest $request, Server $server): JsonResponse
    {
        $items = array_map(fn (array $item): array => ['provider' => Json::id($item['provider'] ?? null), 'project_id' => Json::id($item['project_id'] ?? null), 'version_id' => Json::id($item['version_id'] ?? null)], Json::rows($request->input('items')));

        $operation = $this->prism->install($server, $request->user(), $items);

        return new JsonResponse($operation->toPayload(), 202);
    }

    /**
     * @param  'modpack'|'world'  $type
     */
    private function browse(string $provider, string $type, string $query, ?string $gameVersion, int $offset, int $limit, string $sort): JsonResponse
    {
        $this->available($provider);
        $result = $this->catalog->search($provider, $type, $query, $gameVersion, $offset, $limit, $sort);

        return new JsonResponse(['object' => 'list', 'data' => $result['data'], 'meta' => ['total' => $result['total'], 'offset' => $offset, 'limit' => $limit, 'provider' => $provider]]);
    }

    private function available(string $provider): void
    {
        if (! $this->providers->get($provider)->available()) {
            throw new HttpResponseException(new JsonResponse(self::PROVIDER_UNAVAILABLE, 409));
        }
    }
}
