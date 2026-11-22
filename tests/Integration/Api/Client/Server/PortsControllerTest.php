<?php

declare(strict_types=1);

namespace Pterodactyl\Tests\Pest\Integration\Api\Client\Server\PortsControllerTest;

use GuzzleHttp\Promise\PromiseInterface;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Pterodactyl\Contracts\Servers\SendsServerPower;
use Pterodactyl\Enum\Permissions;
use Pterodactyl\Models\Allocation;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\ServerEnvSetting;
use Pterodactyl\Models\ServerPortBinding;
use Pterodactyl\Services\Servers\EnvironmentService;
use Pterodactyl\Services\Servers\Ports\PortAssigner;
use Pterodactyl\Tests\Integration\Api\Client\ClientApiIntegrationTestCase;
use Pterodactyl\Tests\Support\Fakes\FakeDaemonFile;
use Pterodactyl\Tests\Support\Fakes\FakeDaemonPower;

uses(ClientApiIntegrationTestCase::class);

/** A daemon whose file endpoint remembers what was written, so regeneration can be repeated. */
class StatefulDaemonFile extends FakeDaemonFile
{
    /** @var array<string, string> */
    public array $disk = [];

    protected function responseFor(Request $request): ?PromiseInterface
    {
        $path = parse_url($request->url(), PHP_URL_PATH);
        parse_str(parse_url($request->url(), PHP_URL_QUERY) ?: '', $query);
        $file = $query['file'] ?? '';

        if (preg_match('#/files/contents$#', $path) === 1) {
            if (! array_key_exists($file, $this->disk)) {
                return Http::response(['error' => 'not found'], 404);
            }

            $this->record('getContent', ['path' => $file]);

            return Http::response($this->disk[$file]);
        }

        if (preg_match('#/files/write$#', $path) === 1) {
            $this->disk[$file] = $request->body();
            $this->record('putContent', ['path' => $file, 'content' => $request->body()]);

            return Http::response('');
        }

        return null;
    }
}

function freePort(Server $server, int $port): Allocation
{
    return Allocation::factory()->create(['node_id' => $server->node_id, 'ip' => $server->allocation->ip, 'port' => $port]);
}

function spec(Server $server, array $spec): void
{
    $server->egg->forceFill(['port_spec' => $spec])->save();
    $server->unsetRelation('egg');
}

test('a new server gets every required role bound to a free port', function (): void {
    [, $server] = $this->generateTestAccount();
    spec($server, [['role' => 'PORT', 'required' => true], ['role' => 'QUERY_PORT', 'required' => true], ['role' => 'RCON_PORT', 'required' => false]]);
    $query = freePort($server, 25566);
    freePort($server, 25575);

    app(PortAssigner::class)->assignDefaults($server->refresh());

    $bindings = ServerPortBinding::query()->where('server_id', $server->id)->get()->keyBy('role');
    expect($bindings->keys()->all())->toBe(['PORT', 'QUERY_PORT'])
        ->and($bindings['PORT']->allocation_id)->toBe($server->allocation_id)
        ->and($bindings['QUERY_PORT']->allocation_id)->toBe($query->id)
        ->and($query->refresh()->server_id)->toBe($server->id)
        ->and(ServerEnvSetting::query()->where('server_id', $server->id)->exists())->toBeTrue();
});

test('PORT equals SERVER_PORT and every role is injected without beating egg variables', function (): void {
    [, $server] = $this->generateTestAccount();
    spec($server, [['role' => 'PORT', 'required' => true], ['role' => 'QUERY_PORT', 'required' => true]]);
    freePort($server, 25566);
    app(PortAssigner::class)->assignDefaults($server->refresh());

    $env = app(EnvironmentService::class)->forServer($server->refresh());

    expect($env['PORT'])->toBe((string) $server->allocation->port)
        ->and($env['QUERY_PORT'])->toBe('25566')
        ->and($env['ALLOCATION_LIST'])->toBe($server->allocation->toString().','.$server->allocation->ip.':25566')
        ->and($env['PORT_1'])->toBe('25566')
        ->and($env['PUBLIC_ADDRESS'])->toBe($server->allocation->alias.':'.$server->allocation->port);

    $variable = $server->egg->variables()->create(['name' => 'Port', 'env_variable' => 'QUERY_PORT', 'default_value' => '1111', 'user_viewable' => true, 'user_editable' => true, 'rules' => 'required']);
    expect(app(EnvironmentService::class)->forServer($server->refresh())['QUERY_PORT'])->toBe($variable->default_value);
});

test('the ports card data is readable by any subuser but only editable with settings.ports', function (): void {
    [$user, $server] = $this->generateTestAccount([Permissions::WebsocketConnect->value]);

    $this->actingAs($user)->getJson($this->link($server, '/settings/ports'))->assertOk()->assertJsonPath('object', 'server_ports')->assertJsonPath('attributes.roles.0.role', 'PORT');
    $this->actingAs($user)->putJson($this->link($server, '/settings/ports'), ['settings' => ['mode' => 'off']])->assertForbidden();
    $this->actingAs($user)->postJson($this->link($server, '/settings/ports/regenerate'))->assertForbidden();
    $this->actingAs($user)->postJson($this->link($server, '/settings/ports/reassign'))->assertForbidden();
});

test('a role can be added automatically up to the allocation limit', function (): void {
    [$user, $server] = $this->generateTestAccount([Permissions::SettingsPorts->value]);
    new StatefulDaemonFile;
    $server->update(['allocation_limit' => 2]);
    freePort($server, 30001);
    freePort($server, 30002);

    $this->actingAs($user)->putJson($this->link($server, '/settings/ports'), ['roles' => [['role' => 'QUERY_PORT', 'auto' => true]]])
        ->assertOk()
        ->assertJsonPath('attributes.restart_required', true);

    $this->actingAs($user)->putJson($this->link($server, '/settings/ports'), ['roles' => [['role' => 'RCON_PORT', 'auto' => true]]])
        ->assertStatus(400);
    expect(ServerPortBinding::query()->where('server_id', $server->id)->pluck('role')->all())->toBe(['QUERY_PORT']);
    $this->assertActivityFor('server:ports.assign', $user, $server);
});

test('manual override binds a chosen allocation and the file follows', function (): void {
    [$user, $server] = $this->generateTestAccount([Permissions::SettingsPorts->value]);
    $disk = new StatefulDaemonFile;
    $server->update(['allocation_limit' => 3]);
    $mine = freePort($server, 31000);
    $mine->update(['server_id' => $server->id]);

    $response = $this->actingAs($user)->putJson($this->link($server, '/settings/ports'), ['roles' => [['role' => 'QUERY_PORT', 'auto' => false, 'allocation_id' => $mine->id]]]);

    $response->assertOk()->assertJsonPath('meta.write.written', true);
    expect($disk->disk['/.env'])->toContain("QUERY_PORT=31000\n")->toContain('SERVER_PORT='.$server->allocation->port);

    // Changing PORT to a different allocation breaks the PORT = SERVER_PORT default by choice.
    $other = freePort($server, 31001);
    $other->update(['server_id' => $server->id]);
    $this->actingAs($user)->putJson($this->link($server, '/settings/ports'), ['roles' => [['role' => 'PORT', 'auto' => false, 'allocation_id' => $other->id]]])->assertOk();
    expect($disk->disk['/.env'])->toContain("\nPORT=31001\n")->toContain('SERVER_PORT='.$server->allocation->port);
});

test('ports that are unsafe cannot be assigned and the reason is returned', function (): void {
    [$user, $server] = $this->generateTestAccount([Permissions::SettingsPorts->value]);
    new StatefulDaemonFile;
    $server->update(['allocation_limit' => 5]);
    $other = $this->createServerModel();

    $foreign = Allocation::factory()->create(['node_id' => $server->node_id, 'port' => 32000, 'server_id' => $other->id]);
    $reserved = Allocation::factory()->create(['node_id' => $server->node_id, 'port' => 80, 'server_id' => $server->id]);
    $offNode = Allocation::factory()->create(['port' => 32001, 'server_id' => $server->id]);
    $dupe = Allocation::factory()->create(['node_id' => $server->node_id, 'ip' => $server->allocation->ip, 'port' => 32002, 'server_id' => $server->id]);
    // Same port number held by another server on the node, on a different IP.
    Allocation::factory()->create(['node_id' => $server->node_id, 'ip' => '10.9.9.9', 'port' => 32002, 'server_id' => $other->id]);

    foreach ([$foreign, $reserved, $offNode, $dupe] as $allocation) {
        $this->actingAs($user)->putJson($this->link($server, '/settings/ports'), ['roles' => [['role' => 'QUERY_PORT', 'auto' => false, 'allocation_id' => $allocation->id]]])->assertStatus(400);
    }

    $this->actingAs($user)->putJson($this->link($server, '/settings/ports'), ['roles' => [['role' => 'QUERY_PORT', 'auto' => false, 'allocation_id' => $foreign->id]]])
        ->assertStatus(400)
        ->assertJsonPath('errors.0.detail', 'The port is already in use by another server on the node.');

    // Reserved names and duplicate roles.
    $this->actingAs($user)->putJson($this->link($server, '/settings/ports'), ['roles' => [['role' => 'SERVER_IP', 'auto' => true]]])->assertStatus(400);
    $this->actingAs($user)->putJson($this->link($server, '/settings/ports'), ['roles' => [['role' => 'lower', 'auto' => true]]])->assertUnprocessable();
    expect(ServerPortBinding::query()->where('server_id', $server->id)->count())->toBe(0);

    // The same allocation cannot back two roles.
    $good = Allocation::factory()->create(['node_id' => $server->node_id, 'ip' => $server->allocation->ip, 'port' => 32100, 'server_id' => $server->id]);
    $this->actingAs($user)->putJson($this->link($server, '/settings/ports'), ['roles' => [['role' => 'A_PORT', 'auto' => false, 'allocation_id' => $good->id]]])->assertOk();
    $this->actingAs($user)->putJson($this->link($server, '/settings/ports'), ['roles' => [['role' => 'B_PORT', 'auto' => false, 'allocation_id' => $good->id]]])->assertStatus(400);
});

test('a port in use on the node is shown with its status', function (): void {
    [$user, $server] = $this->generateTestAccount([Permissions::SettingsPorts->value]);
    $other = $this->createServerModel();
    $allocation = Allocation::factory()->create(['node_id' => $server->node_id, 'port' => 33000, 'server_id' => $server->id]);
    ServerPortBinding::query()->create(['server_id' => $server->id, 'allocation_id' => $allocation->id, 'role' => 'QUERY_PORT', 'auto' => false]);
    Allocation::factory()->create(['node_id' => $server->node_id, 'ip' => '10.8.8.8', 'port' => 33000, 'server_id' => $other->id]);

    $row = collect($this->actingAs($user)->getJson($this->link($server, '/settings/ports'))->assertOk()->json('attributes.roles'))->firstWhere('role', 'QUERY_PORT');

    expect($row['status'])->toBe('conflict')->and($row['reason'])->toBe('The port is already in use by another server on the node.');
});

test('user lines in .env survive ten regenerations and port changes', function (): void {
    [$user, $server] = $this->generateTestAccount([Permissions::SettingsPorts->value]);
    $disk = new StatefulDaemonFile;
    $userFile = "# my app\nDB_HOST=localhost\nSECRET=\"a b\"\n\nLAST=1\n";
    $disk->disk['/.env'] = $userFile;
    $server->update(['allocation_limit' => 4]);
    freePort($server, 34000);
    $b = freePort($server, 34001);
    $b->update(['server_id' => $server->id]);

    $this->actingAs($user)->putJson($this->link($server, '/settings/ports'), ['roles' => [['role' => 'QUERY_PORT', 'auto' => true]]])->assertOk();

    for ($i = 0; $i < 10; $i++) {
        $this->actingAs($user)->postJson($this->link($server, '/settings/ports/regenerate'))->assertOk()->assertJsonPath('attributes.written', true);
        if ($i === 4) {
            $this->actingAs($user)->putJson($this->link($server, '/settings/ports'), ['roles' => [['role' => 'QUERY_PORT', 'auto' => false, 'allocation_id' => $b->id]]])->assertOk();
        }
    }

    $content = $disk->disk['/.env'];
    expect($content)->toStartWith($userFile)
        ->and(substr_count($content, '# >>> astrelyse ports'))->toBe(1)
        ->and($content)->toContain('QUERY_PORT=34001');
    $this->assertActivityFor('server:ports.regenerate', $user, $server);
});

test('off mode writes nothing yet still injects the variables', function (): void {
    [$user, $server] = $this->generateTestAccount([Permissions::SettingsPorts->value]);
    $disk = new StatefulDaemonFile;
    $server->update(['allocation_limit' => 2]);
    freePort($server, 35000);

    $this->actingAs($user)->putJson($this->link($server, '/settings/ports'), [
        'roles' => [['role' => 'QUERY_PORT', 'auto' => true]],
        'settings' => ['mode' => 'off', 'extra' => [['key' => 'GREETING', 'value' => 'hi', 'secret' => false]]],
    ])->assertOk()->assertJsonPath('meta.write.written', false);

    $this->actingAs($user)->postJson($this->link($server, '/settings/ports/regenerate'))->assertOk()->assertJsonPath('attributes.written', false);
    app(SendsServerPower::class);
    new FakeDaemonPower;
    app(SendsServerPower::class)->send($server, 'start');

    expect($disk->callsFor('putContent'))->toBe([]);
    $env = app(EnvironmentService::class)->forServer($server->refresh());
    expect($env['QUERY_PORT'])->toBe('35000')->and($env['PORT'])->toBe((string) $server->allocation->port)->and($env['GREETING'])->toBe('hi');
    $preview = $this->actingAs($user)->postJson($this->link($server, '/settings/ports/preview'))->assertOk();
    expect($preview->json('attributes.writes_file'))->toBeFalse()->and($preview->json('attributes.content'))->toBe('');
});

test('separate file mode leaves .env alone and secret extras are masked', function (): void {
    [$user, $server] = $this->generateTestAccount([Permissions::SettingsPorts->value]);
    $disk = new StatefulDaemonFile;
    $disk->disk['/.env'] = "MINE=1\n";

    $this->actingAs($user)->putJson($this->link($server, '/settings/ports'), ['settings' => ['mode' => 'separate', 'file_name' => '.env']])->assertStatus(400);
    $response = $this->actingAs($user)->putJson($this->link($server, '/settings/ports'), [
        'settings' => ['mode' => 'separate', 'file_name' => 'config/ports.env', 'extra' => [['key' => 'TOKEN', 'value' => 'hunter2', 'secret' => true]]],
    ])->assertOk();

    expect($disk->disk['/.env'])->toBe("MINE=1\n")
        ->and($disk->disk['/config/ports.env'])->toContain('TOKEN=hunter2')
        ->and(json_encode($response->json()))->not->toContain('hunter2');

    $preview = $this->actingAs($user)->postJson($this->link($server, '/settings/ports/preview'))->assertOk()->json('attributes.content');
    expect($preview)->toContain('TOKEN=')->not->toContain('hunter2');

    // Saving without sending the secret again keeps it.
    $this->actingAs($user)->putJson($this->link($server, '/settings/ports'), ['settings' => ['extra' => [['key' => 'TOKEN', 'secret' => true]]]])->assertOk();
    expect($disk->disk['/config/ports.env'])->toContain('TOKEN=hunter2');
});

test('file names that escape the server are rejected', function (): void {
    [$user, $server] = $this->generateTestAccount([Permissions::SettingsPorts->value]);

    foreach (['../x', '/etc/env', 'a/../b', 'dir/', 'bad name'] as $name) {
        $this->actingAs($user)->putJson($this->link($server, '/settings/ports'), ['settings' => ['file_name' => $name]])->assertStatus(400);
    }
});

test('starting a server through the panel refreshes the file and clears the restart flag', function (): void {
    [$user, $server] = $this->generateTestAccount([Permissions::SettingsPorts->value]);
    $disk = new StatefulDaemonFile;
    $server->update(['allocation_limit' => 2]);
    freePort($server, 36000);
    $this->actingAs($user)->putJson($this->link($server, '/settings/ports'), ['roles' => [['role' => 'QUERY_PORT', 'auto' => true]]])->assertOk();
    $disk->disk = [];
    $disk->calls = [];
    new FakeDaemonPower;

    app(SendsServerPower::class)->send($server, 'start');

    expect(ServerEnvSetting::forServer($server)->restart_required)->toBeFalse();
});

test('a daemon failure while writing does not stop the change from being saved', function (): void {
    [$user, $server] = $this->generateTestAccount([Permissions::SettingsPorts->value]);
    Http::fake(['*' => Http::response(['error' => 'boom'], 500)]);

    $this->actingAs($user)->putJson($this->link($server, '/settings/ports'), ['settings' => ['conflict_policy' => 'panel']])
        ->assertOk()
        ->assertJsonPath('meta.write.written', false);

    expect(ServerEnvSetting::forServer($server)->conflict_policy)->toBe('panel');
});

test('reassigning is for root admins only, even for the owner with settings.ports', function (): void {
    [$user, $server] = $this->generateTestAccount([Permissions::SettingsPorts->value]);
    new StatefulDaemonFile;

    $this->actingAs($user)->postJson($this->link($server, '/settings/ports/reassign'))->assertForbidden();
    $this->actingAs(\Pterodactyl\Models\User::query()->findOrFail($server->owner_id))->postJson($this->link($server, '/settings/ports/reassign'))->assertForbidden();
});

test('reassigning gives automatic roles fresh ports and logs it', function (): void {
    [$user, $server] = $this->generateTestAccount([Permissions::SettingsPorts->value]);
    new StatefulDaemonFile;
    $server->update(['allocation_limit' => 3]);
    $first = freePort($server, 37000);
    freePort($server, 37001);
    $this->actingAs($user)->putJson($this->link($server, '/settings/ports'), ['roles' => [['role' => 'QUERY_PORT', 'auto' => true]]])->assertOk();
    expect($first->refresh()->server_id)->toBe($server->id);

    $user->forceFill(['root_admin' => true, 'use_totp' => true])->save();
    $this->actingAs($user->refresh())->postJson($this->link($server, '/settings/ports/reassign'))->assertOk();

    $this->assertActivityFor('server:ports.reassign', $user, $server);
});
