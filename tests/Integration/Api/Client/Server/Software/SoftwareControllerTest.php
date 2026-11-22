<?php

declare(strict_types=1);

namespace Pterodactyl\Tests\Pest\Integration\Api\Client\Server\Software\SoftwareControllerTest;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Pterodactyl\Enum\Permissions;
use Pterodactyl\Models\Egg;
use Pterodactyl\Models\InstallOperation;
use Pterodactyl\Models\Node;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\ServerModInstall;
use Pterodactyl\Models\ServerVariable;
use Pterodactyl\Models\Tag;
use Pterodactyl\Models\User;
use Pterodactyl\Services\Servers\Software\InstallPlanRunner;
use Pterodactyl\Services\Servers\Software\SoftwareSwitcher;
use Pterodactyl\Tests\Integration\Api\Client\ClientApiIntegrationTestCase;
use Pterodactyl\Tests\Support\Fakes\FakeDaemonFile;
use Pterodactyl\Tests\Support\Fakes\FakeDaemonServer;

use function pterodactylTestCase;

uses(ClientApiIntegrationTestCase::class);

const READ = [Permissions::SoftwareRead->value];
const MANAGE = [Permissions::SoftwareRead->value, Permissions::SoftwareManage->value];

beforeEach(function (): void {
    Cache::flush();
});

function astrelyseEgg(): Egg
{
    return Egg::query()->where('author', SoftwareSwitcher::EGG_AUTHOR)->where('name', SoftwareSwitcher::EGG_NAME)->firstOrFail();
}

function setVariables(Server $server, array $values): void
{
    foreach ($values as $env => $value) {
        $variable = $server->egg->variables()->where('env_variable', $env)->firstOrFail();
        ServerVariable::query()->updateOrCreate(['server_id' => $server->id, 'variable_id' => $variable->id], ['variable_value' => $value]);
    }
}

function variableOf(Server $server, string $env): ?string
{
    $variable = $server->egg->variables()->where('env_variable', $env)->firstOrFail();

    return ServerVariable::query()->where('server_id', $server->id)->where('variable_id', $variable->id)->value('variable_value');
}

/**
 * @param  list<string>  $permissions
 * @param  array<string, string>  $variables
 * @return array{User, Server}
 */
function astrelyse(array $permissions = MANAGE, array $variables = ['SERVER_TYPE' => 'paper', 'MC_VERSION' => '1.21.1'], ?string $image = null): array
{
    [$user, $server] = test()->generateTestAccount($permissions);
    $egg = astrelyseEgg();
    $server->forceFill(['egg_id' => $egg->id, 'startup' => $egg->startup, 'image' => $image ?? 'ghcr.io/pterodactyl/yolks:java_21'])->save();
    $server->unsetRelation('egg');
    $server->load('egg');
    setVariables($server, $variables);

    return [$user, $server->refresh()];
}

function catalogs(): void
{
    Http::fake([
        'piston-meta.mojang.com/*' => Http::response(['latest' => ['release' => '1.21.1', 'snapshot' => '24w40a'], 'versions' => [['id' => '1.21.1', 'type' => 'release'], ['id' => '1.16.5', 'type' => 'release']]]),
        'meta.fabricmc.net/v2/versions/game' => Http::response([['version' => '1.21.1', 'stable' => true], ['version' => '1.16.5', 'stable' => true]]),
        'meta.fabricmc.net/v2/versions/loader' => Http::response([['version' => '0.16.9', 'stable' => true], ['version' => '0.16.8', 'stable' => true], ['version' => '0.17.0-beta', 'stable' => false]]),
        'fill.papermc.io/v3/projects/paper' => Http::response(['versions' => ['1.21' => ['1.21.1']]]),
        'fill.papermc.io/v3/projects/paper/versions/*/builds' => Http::response([['id' => 133, 'channel' => 'STABLE']]),
        'api.purpurmc.org/v2/purpur' => Http::response(['versions' => ['1.21.1']]),
        'api.purpurmc.org/v2/purpur/1.21.1' => Http::response(['builds' => ['latest' => '2329', 'all' => ['2329']]]),
        'maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml' => Http::response('<metadata><versioning><versions><version>1.16.5-36.2.39</version><version>1.21.1-52.1.20</version></versions></versioning></metadata>'),
        'files.minecraftforge.net/*' => Http::response(['promos' => ['1.16.5-recommended' => '36.2.39', '1.21.1-recommended' => '52.1.20']]),
    ]);
}

/** @return array<string, mixed> the plan the panel last wrote through Wings */
function writtenPlan(FakeDaemonFile $files): array
{
    $writes = array_values(array_filter($files->callsFor('putContent'), fn (array $call): bool => $call['path'] === '/.astrelyse/plan.json'));
    expect($writes)->not->toBeEmpty();

    return ['raw' => $writes[array_key_last($writes)]['content'], ...json_decode($writes[array_key_last($writes)]['content'], true, flags: JSON_THROW_ON_ERROR)];
}

dataset('endpoints', fn (): array => [
    'index' => ['getJson', '/software'],
    'catalog' => ['getJson', '/software/catalog?type=fabric'],
    'install' => ['postJson', '/software/install'],
    'reinstall' => ['postJson', '/software/reinstall'],
    'clear' => ['postJson', '/software/clear'],
    'convert' => ['postJson', '/software/convert'],
    'operation' => ['getJson', '/software/operations/1'],
]);

test('every endpoint requires authentication and permission', function (string $method, string $path): void {
    [, $server] = astrelyse();
    $this->{$method}($this->link($server, $path))->assertUnauthorized();

    [$user, $server] = astrelyse([Permissions::ControlConsole->value]);
    $this->actingAs($user)->{$method}($this->link($server, $path))->assertForbidden();
})->with('endpoints');

test('software.read cannot change anything', function (): void {
    [$user, $server] = astrelyse(READ);
    $files = new FakeDaemonFile;
    $daemon = new FakeDaemonServer;
    catalogs();

    $this->actingAs($user)->postJson($this->link($server, '/software/install'), ['type' => 'fabric', 'minecraft' => '1.21.1'])->assertForbidden();
    $this->actingAs($user)->postJson($this->link($server, '/software/reinstall'))->assertForbidden();
    $this->actingAs($user)->postJson($this->link($server, '/software/clear'), ['keep_worlds' => true, 'confirm' => $server->name])->assertForbidden();
    $this->actingAs($user)->postJson($this->link($server, '/software/convert'))->assertForbidden();

    expect($files->callsFor('putContent'))->toBeEmpty();
    $daemon->assertNothingHappened();
    $this->actingAs($user)->getJson($this->link($server, '/software'))->assertOk();
});

test('the index reports the current software, the types and the latest operation', function (): void {
    [$user, $server] = astrelyse(READ, ['SERVER_TYPE' => 'fabric', 'MC_VERSION' => '1.21.1', 'LOADER_VERSION' => '0.16.9']);
    InstallOperation::query()->create(['server_id' => $server->id, 'kind' => 'install', 'status' => 'running', 'summary' => ['type' => 'fabric']]);

    $response = $this->actingAs($user)->getJson($this->link($server, '/software'))->assertOk()
        ->assertJsonPath('current', ['type' => 'fabric', 'minecraft' => '1.21.1', 'loader' => '0.16.9', 'egg_managed' => true])
        ->assertJsonPath('operation.status', 'running')
        ->assertJsonPath('operation.kind', 'install');

    expect(array_column($response->json('types'), 'type'))->toBe(['vanilla', 'paper', 'purpur', 'folia', 'fabric', 'quilt', 'forge', 'neoforge'])
        ->and(collect($response->json('types'))->firstWhere('type', 'fabric'))->toMatchArray(['label' => 'Fabric', 'kind' => 'mod', 'icon' => 'fabric'])
        ->and(collect($response->json('types'))->firstWhere('type', 'paper')['kind'])->toBe('plugin')
        ->and(collect($response->json('types'))->firstWhere('type', 'vanilla')['kind'])->toBe('vanilla');
});

test('a server on any other egg opens the page as not managed, and has no catalog until converted', function (): void {
    [$user, $server] = $this->generateTestAccount(MANAGE);
    $server->egg->tags()->detach();
    $server->unsetRelation('egg');

    $this->actingAs($user)->getJson($this->link($server, '/software'))->assertOk()->assertJsonPath('current.egg_managed', false);
    $this->actingAs($user)->getJson($this->link($server, '/software/catalog?type=fabric'))->assertStatus(409);
});

test('the catalog endpoint returns versions and loaders', function (): void {
    [$user, $server] = astrelyse(READ);
    catalogs();

    $this->actingAs($user)->getJson($this->link($server, '/software/catalog?type=fabric&minecraft=1.21.1'))->assertOk()
        ->assertJsonPath('minecraft.0', ['id' => '1.21.1', 'type' => 'release', 'latest' => true])
        ->assertJson(fn ($json) => $json->etc());
    expect($this->actingAs($user)->getJson($this->link($server, '/software/catalog?type=fabric&minecraft=1.21.1'))->json('loaders')['1.21.1'][0])->toBe(['id' => '0.16.9', 'stable' => true]);

    $this->actingAs($user)->getJson($this->link($server, '/software/catalog?type=bedrock'))->assertUnprocessable();
    $this->actingAs($user)->getJson($this->link($server, '/software/catalog'))->assertUnprocessable();
});

test('installing software writes a hashed plan, sets the variables and image, and starts a reinstall', function (): void {
    [$user, $server] = astrelyse();
    catalogs();
    $files = new FakeDaemonFile;
    $daemon = new FakeDaemonServer;

    $response = $this->actingAs($user)->postJson($this->link($server, '/software/install'), ['type' => 'fabric', 'minecraft' => '1.21.1', 'loader' => '0.16.9', 'mods_action' => 'disable'])
        ->assertStatus(202)
        ->assertJsonPath('kind', 'install')
        ->assertJsonPath('status', 'running')
        ->assertJsonPath('summary.type', 'fabric')
        ->assertJsonPath('summary.loader', '0.16.9');

    $plan = writtenPlan($files);
    $server->refresh();

    expect($plan['operation'])->toBe('software')
        ->and($plan['software'])->toBe(['type' => 'fabric', 'minecraft' => '1.21.1', 'loader' => '0.16.9'])
        ->and($plan['wipe']['enabled'])->toBeFalse()
        ->and(variableOf($server, InstallPlanRunner::HASH_VARIABLE))->toBe(hash('sha256', $plan['raw']))
        ->and(variableOf($server, 'SERVER_TYPE'))->toBe('fabric')
        ->and(variableOf($server, 'MC_VERSION'))->toBe('1.21.1')
        ->and(variableOf($server, 'LOADER_VERSION'))->toBe('0.16.9')
        ->and($server->status)->toBe(Server::STATUS_INSTALLING)
        ->and($server->image)->toBe('ghcr.io/pterodactyl/yolks:java_21')
        ->and(InstallOperation::query()->findOrFail($response->json('id'))->plan_sha256)->toBe(hash('sha256', $plan['raw']));

    $daemon->assertReinstalled();
    $this->assertActivityFor('server:software.install', $user, $server);
});

test('the loader defaults to the newest stable one and is stored', function (): void {
    [$user, $server] = astrelyse();
    catalogs();
    $files = new FakeDaemonFile;
    new FakeDaemonServer;

    $this->actingAs($user)->postJson($this->link($server, '/software/install'), ['type' => 'fabric', 'minecraft' => '1.21.1'])->assertStatus(202);

    expect(writtenPlan($files)['software']['loader'])->toBe('0.16.9')
        ->and(variableOf($server, 'LOADER_VERSION'))->toBe('0.16.9');
});

test('the java image follows the minecraft version', function (): void {
    [$user, $server] = astrelyse();
    catalogs();
    new FakeDaemonFile;
    new FakeDaemonServer;

    $this->actingAs($user)->postJson($this->link($server, '/software/install'), ['type' => 'forge', 'minecraft' => '1.16.5', 'loader' => '36.2.39', 'mods_action' => 'keep'])->assertStatus(202);

    expect($server->refresh()->image)->toBe('ghcr.io/pterodactyl/yolks:java_8');
});

test('a choice that is not in the catalog is rejected before anything is written', function (array $body, string $field): void {
    [$user, $server] = astrelyse();
    catalogs();
    $files = new FakeDaemonFile;
    $daemon = new FakeDaemonServer;

    $this->actingAs($user)->postJson($this->link($server, '/software/install'), $body)->assertUnprocessable()->assertJsonPath('errors.0.meta.source_field', $field);

    expect($files->callsFor('putContent'))->toBeEmpty();
    $daemon->assertNothingHappened();
    expect(InstallOperation::query()->where('server_id', $server->id)->count())->toBe(0);
})->with([
    'unknown type' => [['type' => 'bedrock', 'minecraft' => '1.21.1'], 'type'],
    'unknown minecraft' => [['type' => 'fabric', 'minecraft' => '1.2.3'], 'minecraft'],
    'unknown loader' => [['type' => 'fabric', 'minecraft' => '1.21.1', 'loader' => '9.9.9'], 'loader'],
    'shell in version' => [['type' => 'fabric', 'minecraft' => '1.21;id'], 'minecraft'],
    'bad mods action' => [['type' => 'fabric', 'minecraft' => '1.21.1', 'mods_action' => 'burn'], 'mods_action'],
    'vanilla with a loader' => [['type' => 'vanilla', 'minecraft' => '1.21.1', 'loader' => '1'], 'loader'],
]);

test('a server that is not on the Astrelyse egg cannot install and is told to convert', function (): void {
    [$user, $server] = $this->generateTestAccount(MANAGE);
    $server->egg->tags()->syncWithoutDetaching([Tag::query()->where('slug', 'minecraft')->firstOrFail()->id]);
    $server->unsetRelation('egg');
    catalogs();
    $files = new FakeDaemonFile;

    $this->actingAs($user)->postJson($this->link($server, '/software/install'), ['type' => 'fabric', 'minecraft' => '1.21.1'])->assertStatus(409)->assertExactJson(['error' => 'not_astrelyse_egg']);
    $this->actingAs($user)->postJson($this->link($server, '/software/reinstall'))->assertStatus(409);
    $this->actingAs($user)->postJson($this->link($server, '/software/clear'), ['keep_worlds' => true, 'confirm' => $server->name])->assertStatus(409);

    expect($files->callsFor('putContent'))->toBeEmpty();
});

test('moving from plugins to mods applies mods_action to the plugins folder', function (string $action, array $moves, array $remove, bool $enabled, bool $rowsKept): void {
    [$user, $server] = astrelyse(MANAGE, ['SERVER_TYPE' => 'paper', 'MC_VERSION' => '1.21.1']);
    ServerModInstall::factory()->create(['server_id' => $server->id, 'install_dir' => 'plugins']);
    catalogs();
    $files = new FakeDaemonFile;
    new FakeDaemonServer;

    $this->actingAs($user)->postJson($this->link($server, '/software/install'), ['type' => 'fabric', 'minecraft' => '1.21.1', 'mods_action' => $action])->assertStatus(202);

    $plan = writtenPlan($files);
    $date = now()->format('Ymd');

    expect(array_map(fn (array $move): string => $move['from'], $plan['moves']))->toBe(array_map(fn (string $from): string => $from, array_keys($moves)))
        ->and($plan['remove'])->toBe($remove)
        ->and($server->modInstalls()->count())->toBe($rowsKept ? 1 : 0);

    foreach ($plan['moves'] as $move) {
        expect($move['to'])->toStartWith('plugins.disabled-'.$date);
    }

    if ($rowsKept) {
        expect($server->modInstalls()->first()->enabled)->toBe($enabled);
    }
})->with([
    'disable' => ['disable', ['plugins' => true], [], false, true],
    'remove' => ['remove', [], ['plugins'], true, false],
    'keep' => ['keep', [], [], true, true],
]);

test('the mods action defaults to disable when the folder no longer fits and to keep when it does', function (): void {
    [$user, $server] = astrelyse(MANAGE, ['SERVER_TYPE' => 'paper', 'MC_VERSION' => '1.21.1']);
    catalogs();
    $files = new FakeDaemonFile;
    new FakeDaemonServer;

    $this->actingAs($user)->postJson($this->link($server, '/software/install'), ['type' => 'fabric', 'minecraft' => '1.21.1'])->assertStatus(202);
    expect(writtenPlan($files)['moves'])->toHaveCount(1);

    // Purpur runs Paper plugins, so a Paper to Purpur switch leaves the folder alone.
    $server->serverVariables()->delete();
    InstallOperation::query()->where('server_id', $server->id)->delete();
    Server::query()->whereKey($server->id)->update(['status' => null]);
    setVariables($server->refresh(), ['SERVER_TYPE' => 'paper', 'MC_VERSION' => '1.21.1']);
    $files->calls = [];

    $this->actingAs($user)->postJson($this->link($server, '/software/install'), ['type' => 'purpur', 'minecraft' => '1.21.1'])->assertStatus(202);

    $plan = writtenPlan($files);
    expect($plan['moves'])->toBe([])->and($plan['remove'])->toBe([])->and($plan['wipe']['keep'])->toContain('plugins');
});

test('a fresh start keeps worlds, the level-name world and settings, and the chosen folders', function (): void {
    [$user, $server] = astrelyse(MANAGE, ['SERVER_TYPE' => 'paper', 'MC_VERSION' => '1.21.1']);
    catalogs();
    $files = new FakeDaemonFile;
    $files->content = "motd=hi\nlevel-name=survival\n";
    new FakeDaemonServer;

    $this->actingAs($user)->postJson($this->link($server, '/software/install'), ['type' => 'purpur', 'minecraft' => '1.21.1', 'wipe' => ['enabled' => true, 'keep_worlds' => true]])->assertStatus(202);

    $plan = writtenPlan($files);
    expect($plan['wipe']['enabled'])->toBeTrue()
        ->and($plan['wipe']['keep'])->toContain('world', 'world_nether', 'world_the_end', 'survival', 'survival_nether', 'survival_the_end', 'server.properties', 'ops.json', 'plugins');
});

test('a fresh start without worlds keeps no world folder', function (): void {
    [$user, $server] = astrelyse(MANAGE, ['SERVER_TYPE' => 'paper', 'MC_VERSION' => '1.21.1']);
    catalogs();
    $files = new FakeDaemonFile;
    new FakeDaemonServer;

    $this->actingAs($user)->postJson($this->link($server, '/software/install'), ['type' => 'purpur', 'minecraft' => '1.21.1', 'wipe' => ['enabled' => true, 'keep_worlds' => false]])->assertStatus(202);

    $keep = writtenPlan($files)['wipe']['keep'];
    expect($keep)->not->toContain('world')->and($keep)->toContain('server.properties');
});

test('a second install is refused while one is running', function (): void {
    [$user, $server] = astrelyse();
    catalogs();
    new FakeDaemonFile;
    new FakeDaemonServer;

    $this->actingAs($user)->postJson($this->link($server, '/software/install'), ['type' => 'fabric', 'minecraft' => '1.21.1'])->assertStatus(202);
    $this->actingAs($user)->postJson($this->link($server, '/software/install'), ['type' => 'fabric', 'minecraft' => '1.16.5'])->assertStatus(409);
});

test('reinstall repairs the current software with a plan that wipes nothing', function (): void {
    [$user, $server] = astrelyse(MANAGE, ['SERVER_TYPE' => 'fabric', 'MC_VERSION' => '1.21.1', 'LOADER_VERSION' => '0.16.9']);
    $files = new FakeDaemonFile;
    $daemon = new FakeDaemonServer;

    $this->actingAs($user)->postJson($this->link($server, '/software/reinstall'))->assertStatus(202)->assertJsonPath('kind', 'reinstall');

    $plan = writtenPlan($files);
    expect($plan['software'])->toBe(['type' => 'fabric', 'minecraft' => '1.21.1', 'loader' => '0.16.9'])
        ->and($plan['wipe']['enabled'])->toBeFalse();
    $daemon->assertReinstalled();
    $this->assertActivityFor('server:software.reinstall', $user, $server);
});

test('clear is refused while the server is running', function (string $state): void {
    [$user, $server] = astrelyse();
    $files = new FakeDaemonFile;
    $daemon = new FakeDaemonServer;
    $daemon->details = ['state' => $state];

    $this->actingAs($user)->postJson($this->link($server, '/software/clear'), ['keep_worlds' => true, 'confirm' => $server->name])->assertStatus(409)->assertExactJson(['error' => 'server_not_offline']);

    expect($files->callsFor('putContent'))->toBeEmpty()->and($daemon->callsFor('reinstall'))->toBeEmpty();
})->with(['running', 'starting', 'stopping']);

test('clear wipes everything but the worlds once the server is offline', function (): void {
    [$user, $server] = astrelyse();
    $files = new FakeDaemonFile;
    $daemon = new FakeDaemonServer;
    $daemon->details = ['state' => 'offline'];

    $this->actingAs($user)->postJson($this->link($server, '/software/clear'), ['keep_worlds' => true, 'confirm' => $server->name])->assertStatus(202)->assertJsonPath('kind', 'clear');

    $plan = writtenPlan($files);
    expect($plan['operation'])->toBe('clear')
        ->and($plan['wipe'])->toBe(['enabled' => true, 'keep' => ['world', 'world_nether', 'world_the_end']])
        ->and($plan['software'])->toBeNull();
    $daemon->assertReinstalled();
    $this->assertActivityFor('server:software.clear', $user, $server);
});

test('clear without keeping worlds keeps nothing', function (): void {
    [$user, $server] = astrelyse();
    $files = new FakeDaemonFile;
    $daemon = new FakeDaemonServer;
    $daemon->details = ['state' => 'offline'];

    $this->actingAs($user)->postJson($this->link($server, '/software/clear'), ['keep_worlds' => false, 'confirm' => $server->name])->assertStatus(202);

    expect(writtenPlan($files)['wipe']['keep'])->toBe([]);
});

test('clear needs the server name typed exactly', function (string $confirm): void {
    [$user, $server] = astrelyse();
    $files = new FakeDaemonFile;
    $daemon = new FakeDaemonServer;
    $daemon->details = ['state' => 'offline'];

    $this->actingAs($user)->postJson($this->link($server, '/software/clear'), ['keep_worlds' => true, 'confirm' => $confirm])
        ->assertUnprocessable()
        ->assertJsonPath('errors.0.meta.source_field', 'confirm');

    expect($files->callsFor('putContent'))->toBeEmpty()->and($daemon->callsFor('reinstall'))->toBeEmpty();
})->with(['', 'wrong name', 'DELETE']);

test('clear needs the keep worlds choice', function (): void {
    [$user, $server] = astrelyse();

    $this->actingAs($user)->postJson($this->link($server, '/software/clear'), ['confirm' => $server->name])->assertUnprocessable();
});

test('the owner can convert a Minecraft server to the Astrelyse egg and keep its files', function (): void {
    [$user, $server] = $this->generateTestAccount();
    $paper = Egg::query()->where('name', 'Paper')->firstOrFail();
    $server->forceFill(['egg_id' => $paper->id, 'image' => 'ghcr.io/pterodactyl/yolks:java_21'])->save();
    $server->unsetRelation('egg');
    $files = new FakeDaemonFile;
    $daemon = new FakeDaemonServer;

    $variable = $paper->variables()->where('env_variable', 'MINECRAFT_VERSION')->firstOrFail();
    ServerVariable::query()->create(['server_id' => $server->id, 'variable_id' => $variable->id, 'variable_value' => '1.20.4']);

    $this->actingAs($user)->postJson($this->link($server, '/software/convert'))->assertOk()
        ->assertJsonPath('type', 'paper')
        ->assertJsonPath('minecraft', '1.20.4')
        ->assertJsonPath('egg_managed', true);

    $server->refresh();
    expect($server->egg_id)->toBe(astrelyseEgg()->id)
        ->and(variableOf($server, 'SERVER_TYPE'))->toBe('paper')
        ->and(variableOf($server, 'MC_VERSION'))->toBe('1.20.4')
        ->and($server->image)->toBe('ghcr.io/pterodactyl/yolks:java_17')
        ->and($files->calls)->toBe([]);
    $daemon->assertNothingHappened();
    $this->assertActivityFor('server:software.convert', $user, $server);
});

test('converting an already converted server changes nothing', function (): void {
    [$user, $server] = astrelyse([]);

    $this->actingAs($user)->postJson($this->link($server, '/software/convert'))->assertOk()->assertJsonPath('egg_managed', true);
});

test('only the owner can convert', function (): void {
    [$user, $server] = $this->generateTestAccount(MANAGE);
    $server->egg->tags()->syncWithoutDetaching([Tag::query()->where('slug', 'minecraft')->firstOrFail()->id]);
    $server->unsetRelation('egg');

    $this->actingAs($user)->postJson($this->link($server, '/software/convert'))->assertForbidden();
    expect($server->refresh()->egg_id)->not->toBe(astrelyseEgg()->id);
});

test('a server on any egg can be converted, starting as vanilla when it is no Java build', function (): void {
    [$user, $server] = $this->generateTestAccount();
    $server->egg->tags()->detach();
    $server->unsetRelation('egg');
    astrelyseEgg();

    $this->actingAs($user)->postJson($this->link($server, '/software/convert'))->assertOk()
        ->assertJsonPath('egg_managed', true)
        ->assertJsonPath('type', 'vanilla');
    expect($server->refresh()->egg_id)->toBe(astrelyseEgg()->id);
});

test('an operation can be read only through its own server', function (): void {
    [$user, $server] = astrelyse(READ);
    [, $other] = astrelyse(READ);
    $mine = InstallOperation::query()->create(['server_id' => $server->id, 'kind' => 'clear', 'status' => 'failed', 'error' => 'boom', 'summary' => ['keep_worlds' => true]]);
    $theirs = InstallOperation::query()->create(['server_id' => $other->id, 'kind' => 'install', 'status' => 'running']);

    $this->actingAs($user)->getJson($this->link($server, "/software/operations/{$mine->id}"))->assertOk()
        ->assertJsonPath('id', $mine->id)->assertJsonPath('status', 'failed')->assertJsonPath('error', 'boom');
    $this->actingAs($user)->getJson($this->link($server, "/software/operations/{$theirs->id}"))->assertNotFound();
});

/** Reports an install result the way Wings does. */
function report(Server $server, bool $successful, bool $reinstall = true): void
{
    $node = Node::query()->findOrFail($server->node_id);

    pterodactylTestCase()
        ->withHeader('Authorization', "Bearer {$node->daemon_token_id}.".$node->getDecryptedKey())
        ->postJson("/api/remote/servers/{$server->uuid}/install", ['successful' => $successful, 'reinstall' => $reinstall])
        ->assertNoContent();
}

test('a successful install result closes the running operation and drops the plan hash', function (): void {
    [$user, $server] = astrelyse();
    catalogs();
    new FakeDaemonFile;
    new FakeDaemonServer;

    $id = $this->actingAs($user)->postJson($this->link($server, '/software/install'), ['type' => 'fabric', 'minecraft' => '1.21.1'])->assertStatus(202)->json('id');
    expect(variableOf($server, InstallPlanRunner::HASH_VARIABLE))->not->toBeNull();

    report($server, true);

    $operation = InstallOperation::query()->findOrFail($id);
    expect($operation->status)->toBe('succeeded')
        ->and($operation->finished_at)->not->toBeNull()
        ->and($operation->error)->toBeNull()
        ->and(variableOf($server, InstallPlanRunner::HASH_VARIABLE))->toBeNull()
        ->and($server->refresh()->status)->toBeNull();
});

test('a failed install result marks the operation failed with a message', function (): void {
    [$user, $server] = astrelyse();
    catalogs();
    new FakeDaemonFile;
    new FakeDaemonServer;

    $id = $this->actingAs($user)->postJson($this->link($server, '/software/install'), ['type' => 'fabric', 'minecraft' => '1.21.1'])->json('id');

    report($server, false);

    $operation = InstallOperation::query()->findOrFail($id);
    expect($operation->status)->toBe('failed')
        ->and($operation->error)->toContain('install log')
        ->and($operation->finished_at)->not->toBeNull()
        ->and($server->refresh()->status)->toBe(Server::STATUS_REINSTALL_FAILED);
});

test('an install result only closes the newest unfinished operation of that server', function (): void {
    [, $server] = astrelyse();
    [, $other] = astrelyse();
    $old = InstallOperation::query()->create(['server_id' => $server->id, 'kind' => 'install', 'status' => 'succeeded']);
    $current = InstallOperation::query()->create(['server_id' => $server->id, 'kind' => 'install', 'status' => 'running']);
    $elsewhere = InstallOperation::query()->create(['server_id' => $other->id, 'kind' => 'install', 'status' => 'running']);

    report($server, true);

    expect($current->refresh()->status)->toBe('succeeded')
        ->and($old->refresh()->status)->toBe('succeeded')
        ->and($elsewhere->refresh()->status)->toBe('running');
});

test('an install result with no operation, such as a stock reinstall, is fine', function (): void {
    [, $server] = astrelyse();

    report($server, true);

    expect(InstallOperation::query()->where('server_id', $server->id)->count())->toBe(0);
});

test('a plan that cannot be delivered fails the operation and leaves the variables alone', function (): void {
    [$user, $server] = astrelyse();
    catalogs();
    $files = new FakeDaemonFile;
    $files->throwable = new \Illuminate\Http\Client\ConnectionException('down');
    new FakeDaemonServer;

    $this->actingAs($user)->postJson($this->link($server, '/software/install'), ['type' => 'fabric', 'minecraft' => '1.21.1'])->assertStatus(400);

    expect(variableOf($server, 'SERVER_TYPE'))->toBe('paper')
        ->and($server->refresh()->status)->not->toBe(Server::STATUS_INSTALLING);
});

test('the subuser permission catalog offers the software permissions', function (): void {
    expect(Permissions::SoftwareRead->value)->toBe('software.read')
        ->and(Permissions::SoftwareManage->value)->toBe('software.manage')
        ->and(app(\Pterodactyl\Services\Servers\SubuserPermissionCatalog::class)->keys())->toContain('software.read', 'software.manage')
        ->and(trans('server/users.permissions.software_manage'))->not->toBe('server/users.permissions.software_manage');
});
