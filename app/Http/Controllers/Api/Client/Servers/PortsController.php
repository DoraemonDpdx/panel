<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Controllers\Api\Client\Servers;

use Illuminate\Http\JsonResponse;
use Knuckles\Scribe\Attributes\BodyParam;
use Knuckles\Scribe\Attributes\Endpoint;
use Knuckles\Scribe\Attributes\Group;
use Knuckles\Scribe\Attributes\Response as ScribeResponse;
use Knuckles\Scribe\Attributes\Subgroup;
use Pterodactyl\Http\Controllers\Api\Client\ClientApiController;
use Pterodactyl\Http\Requests\Api\Client\Servers\Ports\GetPortsRequest;
use Pterodactyl\Http\Requests\Api\Client\Servers\Ports\PreviewPortsRequest;
use Pterodactyl\Http\Requests\Api\Client\Servers\Ports\ReassignPortsRequest;
use Pterodactyl\Http\Requests\Api\Client\Servers\Ports\RegeneratePortsRequest;
use Pterodactyl\Http\Requests\Api\Client\Servers\Ports\UpdatePortsRequest;
use Pterodactyl\Models\Server;
use Pterodactyl\Services\Servers\Ports\ServerPorts;

#[Group('Client API', 'Endpoints authenticated as a panel user using a client API token.')]
#[Subgroup('Server Ports', 'View and change the port roles and generated environment file of an accessible server.')]
class PortsController extends ClientApiController
{
    private const array PORTS_EXAMPLE = [
        'object' => 'server_ports',
        'attributes' => [
            'roles' => [['role' => 'PORT', 'required' => true, 'allocation' => ['id' => 1, 'ip' => '203.0.113.10', 'ip_alias' => null, 'port' => 25565], 'auto' => true, 'status' => 'free', 'reason' => null]],
            'free_allocations' => [],
            'settings' => ['file_name' => '.env', 'format' => 'dotenv', 'mode' => 'managed', 'conflict_policy' => 'warn', 'extra' => [['key' => 'GREETING', 'value' => 'hi', 'secret' => false]]],
            'restart_required' => false,
            'allocation_limit' => 5,
            'allocation_count' => 1,
            'can_add_role' => true,
            'variables' => ['PORT' => '25565', 'PUBLIC_ADDRESS' => '203.0.113.10:25565'],
        ],
    ];

    private const array WRITE_EXAMPLE = ['written' => true, 'error' => null, 'conflicts' => []];

    public function __construct(private readonly ServerPorts $ports) {}

    #[Endpoint('Get ports and environment', 'Returns the port roles, free allocations, environment file settings and whether a restart is needed.')]
    #[ScribeResponse(self::PORTS_EXAMPLE, status: 200, description: 'Ports and environment settings returned.')]
    public function index(GetPortsRequest $request, Server $server): JsonResponse
    {
        return new JsonResponse(['object' => 'server_ports', 'attributes' => $this->ports->overview($server)]);
    }

    #[Endpoint('Update ports and environment', 'Changes port roles and environment file settings, then rewrites the file. Requires the settings.ports permission.')]
    #[BodyParam('roles', 'object[]', 'Port roles to set; each has role, auto and, when not automatic, allocation_id.', required: false, example: [['role' => 'QUERY_PORT', 'auto' => true]])]
    #[BodyParam('remove_roles', 'string[]', 'Port roles to remove.', required: false, example: ['RCON_PORT'])]
    #[BodyParam('settings', 'object', 'Environment file settings: file_name, format, mode, conflict_policy and extra variables.', required: false, example: ['mode' => 'managed'])]
    #[ScribeResponse(self::PORTS_EXAMPLE, status: 200, description: 'Ports updated; meta.write says whether the file was written.')]
    public function update(UpdatePortsRequest $request, Server $server): JsonResponse
    {
        /** @var array{roles?: list<array{role: string, auto: bool, allocation_id?: int|null}>, remove_roles?: list<string>, settings?: array<string, mixed>} $input */
        $input = $request->validated();
        $write = $this->ports->update($server, $input);

        return new JsonResponse(['object' => 'server_ports', 'attributes' => $this->ports->overview($server), 'meta' => ['write' => $write]]);
    }

    #[Endpoint('Preview the environment file', 'Returns what the environment file would contain, optionally for unsaved settings. Secret values are masked.')]
    #[ScribeResponse(['object' => 'server_ports_preview', 'attributes' => ['path' => '.env', 'mode' => 'managed', 'format' => 'dotenv', 'content' => "PORT=25565\n", 'conflicts' => [], 'writes_file' => true]], status: 200, description: 'Preview returned.')]
    public function preview(PreviewPortsRequest $request, Server $server): JsonResponse
    {
        $draft = $request->validated();

        return new JsonResponse(['object' => 'server_ports_preview', 'attributes' => $this->ports->preview($server, $draft === [] ? null : $draft)]);
    }

    #[Endpoint('Regenerate the environment file', 'Rewrites the environment file now with the current ports and settings. Requires the settings.ports permission.')]
    #[ScribeResponse(['object' => 'server_ports_write', 'attributes' => self::WRITE_EXAMPLE], status: 200, description: 'File regenerated.')]
    public function regenerate(RegeneratePortsRequest $request, Server $server): JsonResponse
    {
        return new JsonResponse(['object' => 'server_ports_write', 'attributes' => $this->ports->regenerate($server)]);
    }

    #[Endpoint('Reassign automatic ports', 'Gives every automatic port role a free allocation again. Requires a root administrator.')]
    #[ScribeResponse(self::PORTS_EXAMPLE, status: 200, description: 'Automatic roles reassigned.')]
    public function reassign(ReassignPortsRequest $request, Server $server): JsonResponse
    {
        $write = $this->ports->reassign($server);

        return new JsonResponse(['object' => 'server_ports', 'attributes' => $this->ports->overview($server), 'meta' => ['write' => $write]]);
    }
}
