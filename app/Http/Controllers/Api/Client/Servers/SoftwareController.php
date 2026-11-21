<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Controllers\Api\Client\Servers;

use Illuminate\Http\JsonResponse;
use Illuminate\Validation\ValidationException;
use Knuckles\Scribe\Attributes\BodyParam;
use Knuckles\Scribe\Attributes\Endpoint;
use Knuckles\Scribe\Attributes\Group;
use Knuckles\Scribe\Attributes\QueryParam;
use Knuckles\Scribe\Attributes\Response as ScribeResponse;
use Knuckles\Scribe\Attributes\Subgroup;
use Pterodactyl\Enum\EggSpecificTags;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Exceptions\Software\ServerNotOfflineException;
use Pterodactyl\Http\Controllers\Api\Client\ClientApiController;
use Pterodactyl\Http\Requests\Api\Client\Servers\Software\CatalogRequest;
use Pterodactyl\Http\Requests\Api\Client\Servers\Software\ClearServerRequest;
use Pterodactyl\Http\Requests\Api\Client\Servers\Software\InstallSoftwareRequest;
use Pterodactyl\Http\Requests\Api\Client\Servers\Software\SoftwareManageRequest;
use Pterodactyl\Http\Requests\Api\Client\Servers\Software\SoftwareReadRequest;
use Pterodactyl\Models\InstallOperation;
use Pterodactyl\Models\Server;
use Pterodactyl\Services\Servers\Mods\Content\ContentFinalizer;
use Pterodactyl\Services\Servers\Software\InstallPlanRunner;
use Pterodactyl\Services\Servers\Software\ServerFileWiper;
use Pterodactyl\Services\Servers\Software\SoftwareCatalog;
use Pterodactyl\Services\Servers\Software\SoftwareSwitcher;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Throwable;

#[Group('Client API', 'Endpoints authenticated as a panel user using a client API token.')]
#[Subgroup('Server Software', 'Switch, reinstall and clear the Minecraft server software on an accessible server.')]
class SoftwareController extends ClientApiController
{
    private const array OPERATION_EXAMPLE = ['id' => 1, 'kind' => 'install', 'status' => 'running', 'summary' => ['type' => 'fabric', 'minecraft' => '1.21.1', 'loader' => '0.16.9'], 'error' => null, 'started_at' => '2026-11-21T10:00:00+00:00', 'finished_at' => null];

    private const array UNSUPPORTED = ['error' => 'software_unsupported'];

    private const array NOT_MANAGED = ['error' => 'not_astrelyse_egg'];

    public function __construct(
        private readonly SoftwareSwitcher $switcher,
        private readonly SoftwareCatalog $catalog,
        private readonly InstallPlanRunner $runner,
        private readonly ServerFileWiper $wiper,
        private readonly ContentFinalizer $content,
    ) {}

    #[Endpoint('Get the server software', 'Returns the software the server runs, the available types and the latest install operation.')]
    #[ScribeResponse(['current' => ['type' => 'fabric', 'minecraft' => '1.21.1', 'loader' => '0.16.9', 'egg_managed' => true], 'types' => [['type' => 'fabric', 'label' => 'Fabric', 'kind' => 'mod', 'icon' => 'fabric', 'description' => 'A light, fast mod loader.']], 'operation' => self::OPERATION_EXAMPLE], status: 200, description: 'The current software.')]
    #[ScribeResponse(self::UNSUPPORTED, status: 409, description: 'Not a Minecraft Java server.')]
    public function index(SoftwareReadRequest $request, Server $server): JsonResponse
    {
        $this->assertJava($server);

        $types = [];
        foreach (SoftwareCatalog::TYPES as $type => $meta) {
            $types[] = ['type' => $type, ...$meta];
        }

        try {
            $this->content->apply($server);
        } catch (Throwable) {
            // A Wings hiccup during staging cleanup must not hide the page; it is retried on the next read.
        }

        return new JsonResponse([
            'current' => $this->switcher->current($server),
            'types' => $types,
            'operation' => $this->runner->latest($server)?->toPayload(),
            'modpack' => $server->modpack()->first()?->toPayload(),
        ]);
    }

    #[Endpoint('Get the software catalog', 'Lists Minecraft versions and loader or build versions for a software type.')]
    #[QueryParam('type', 'string', 'The software type.', required: true, example: 'fabric')]
    #[QueryParam('include_snapshots', 'boolean', 'Include snapshots and pre-releases.', required: false, example: false)]
    #[QueryParam('minecraft', 'string', 'Only return loaders for this Minecraft version.', required: false, example: '1.21.1')]
    #[ScribeResponse(['minecraft' => [['id' => '1.21.1', 'type' => 'release', 'latest' => true]], 'loaders' => ['1.21.1' => [['id' => '0.16.9', 'stable' => true]]]], status: 200, description: 'The catalog.')]
    public function catalog(CatalogRequest $request, Server $server): JsonResponse
    {
        $this->assertJava($server);

        return new JsonResponse($this->catalog->catalog(
            $request->string('type')->toString(),
            $request->boolean('include_snapshots'),
            $request->filled('minecraft') ? $request->string('minecraft')->toString() : null,
        ));
    }

    #[Endpoint('Switch the server software', 'Installs another software type or version. The server is stopped and reinstalled.')]
    #[BodyParam('type', 'string', 'The software type.', required: true, example: 'fabric')]
    #[BodyParam('minecraft', 'string', 'The Minecraft version.', required: true, example: '1.21.1')]
    #[BodyParam('loader', 'string', 'The loader or build version. The newest stable one when omitted.', required: false, example: '0.16.9')]
    #[BodyParam('wipe', 'object', 'Start fresh: {enabled, keep_worlds}.', required: false)]
    #[BodyParam('mods_action', 'string', 'What happens to the mods or plugins folder when it no longer fits: keep, disable or remove.', required: false, example: 'disable')]
    #[ScribeResponse(self::OPERATION_EXAMPLE, status: 202, description: 'The install started.')]
    #[ScribeResponse(self::NOT_MANAGED, status: 409, description: 'The server is not on the Astrelyse egg.')]
    public function install(InstallSoftwareRequest $request, Server $server): JsonResponse
    {
        $this->assertManaged($server);

        $wipe = $request->input('wipe');
        $mods = $request->input('mods_action');
        $loader = $request->input('loader');

        $operation = $this->switcher->install($server, $request->user(), [
            'type' => $request->string('type')->toString(),
            'minecraft' => $request->string('minecraft')->toString(),
            'loader' => is_string($loader) ? $loader : null,
            'wipe' => ['enabled' => is_array($wipe) && ! empty($wipe['enabled']), 'keep_worlds' => ! is_array($wipe) || ! array_key_exists('keep_worlds', $wipe) || (bool) $wipe['keep_worlds']],
            'mods_action' => is_string($mods) ? $mods : null,
        ]);

        return new JsonResponse($operation->toPayload(), 202);
    }

    #[Endpoint('Reinstall the current software', 'Repairs the installed software and keeps the files.')]
    #[ScribeResponse(self::OPERATION_EXAMPLE, status: 202, description: 'The install started.')]
    public function reinstall(SoftwareManageRequest $request, Server $server): JsonResponse
    {
        $this->assertManaged($server);

        return new JsonResponse($this->switcher->reinstall($server, $request->user())->toPayload(), 202);
    }

    #[Endpoint('Clear the server files', 'Deletes every file, optionally keeping worlds, then reinstalls the software. The server must be offline.')]
    #[BodyParam('keep_worlds', 'boolean', 'Keep the world folders.', required: true, example: true)]
    #[BodyParam('confirm', 'string', 'The server name, typed to confirm.', required: true, example: 'My server')]
    #[ScribeResponse(self::OPERATION_EXAMPLE, status: 202, description: 'The clear started.')]
    #[ScribeResponse(['error' => 'server_not_offline'], status: 409, description: 'The server is running.')]
    public function clear(ClearServerRequest $request, Server $server): JsonResponse
    {
        $this->assertManaged($server);

        if (mb_trim($request->string('confirm')->toString()) !== $server->name) {
            throw ValidationException::withMessages(['confirm' => 'The name does not match this server.']);
        }

        try {
            $operation = $this->wiper->clear($server, $request->user(), $request->boolean('keep_worlds'));
        } catch (ServerNotOfflineException) {
            return new JsonResponse(['error' => 'server_not_offline'], 409);
        }

        return new JsonResponse($operation->toPayload(), 202);
    }

    #[Endpoint('Convert to the Astrelyse egg', 'Moves a Minecraft Java server onto the Astrelyse egg, keeping its files. Only the server owner can do this.')]
    #[ScribeResponse(['type' => 'fabric', 'minecraft' => '1.21.1', 'loader' => null, 'egg_managed' => true], status: 200, description: 'The server now runs the Astrelyse egg.')]
    public function convert(SoftwareManageRequest $request, Server $server): JsonResponse
    {
        $this->assertJava($server);

        $user = $request->user();
        if ($server->owner_id !== $user->id && ! $user->root_admin) {
            throw new HttpException(403, 'Only the server owner can convert the egg.');
        }

        try {
            return new JsonResponse($this->switcher->convert($server, $user));
        } catch (DisplayException $exception) {
            return new JsonResponse(['error' => 'cannot_convert', 'message' => $exception->getMessage()], 409);
        }
    }

    #[Endpoint('Get an install operation', 'Returns the status of a software, modpack or world install.')]
    #[ScribeResponse(self::OPERATION_EXAMPLE, status: 200, description: 'The operation.')]
    public function operation(SoftwareReadRequest $request, Server $server, int $operation): JsonResponse
    {
        $found = InstallOperation::query()->where('server_id', $server->id)->whereKey($operation)->firstOrFail();

        return new JsonResponse($found->toPayload());
    }

    private function assertJava(Server $server): void
    {
        if (! $server->hasTag(EggSpecificTags::Minecraft->value) || $server->hasTag(EggSpecificTags::Bedrock->value)) {
            throw new \Illuminate\Http\Exceptions\HttpResponseException(new JsonResponse(self::UNSUPPORTED, 409));
        }
    }

    private function assertManaged(Server $server): void
    {
        $this->assertJava($server);

        if (! $this->runner->supports($server)) {
            throw new \Illuminate\Http\Exceptions\HttpResponseException(new JsonResponse(self::NOT_MANAGED, 409));
        }
    }
}
