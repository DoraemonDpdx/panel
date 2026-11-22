<?php

declare(strict_types=1);

namespace Pterodactyl\Tests\Pest\Integration\Api\Client\Server\Content\ContentWorldTest;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Pterodactyl\Enum\Permissions;
use Pterodactyl\Tests\Integration\Api\Client\ClientApiIntegrationTestCase;
use Pterodactyl\Tests\Integration\Api\Client\Server\Content\ContentFiles;
use Pterodactyl\Tests\Integration\Api\Client\Server\Content\ContentSupport as S;
use Pterodactyl\Tests\Support\Fakes\FakeDaemonServer;

uses(ClientApiIntegrationTestCase::class);

const WORLD_PERMS = [Permissions::SoftwareRead->value, Permissions::SoftwareManage->value, Permissions::ModsRead->value];
const CFW = 'api.curseforge.com/v1';

beforeEach(function (): void {
    Cache::flush();
    config()->set('curseforge.api_key', 'cf-key');
});

function daemon(): ContentFiles
{
    $files = new ContentFiles;
    $files->texts['/server.properties'] = "level-name=world\n";
    $files->tree['/'] = [['world', true], ['world_nether', true], ['server.properties', false]];
    new FakeDaemonServer;

    return $files;
}

function worldFile(string $zipBytes): void
{
    Http::fake([
        CFW.'/mods/888' => Http::response(['data' => ['id' => 888, 'name' => 'Cool World', 'slug' => 'cool-world', 'links' => ['websiteUrl' => 'https://www.curseforge.com/minecraft/worlds/cool-world']]]),
        CFW.'/mods/888/files/30' => Http::response(['data' => ['id' => 30, 'modId' => 888, 'fileName' => 'world.zip', 'downloadUrl' => 'https://edge.forgecdn.net/files/1/30/world.zip', 'hashes' => [['value' => S::sha1('world'), 'algo' => 1]]]]),
        'edge.forgecdn.net/*' => S::cdn($zipBytes),
    ]);
}

dataset('endpoints', fn (): array => [
    'search' => ['getJson', '/content/worlds/search'],
    'versions' => ['getJson', '/content/worlds/curseforge/888/versions'],
    'install' => ['postJson', '/content/worlds/install'],
    'import local' => ['postJson', '/content/worlds/import-local'],
]);

test('every world endpoint requires authentication and permission', function (string $method, string $path): void {
    [, $server] = S::server($this, WORLD_PERMS);
    $this->{$method}($this->link($server, $path))->assertUnauthorized();

    [$user, $server] = S::server($this, [Permissions::ControlConsole->value]);
    $this->actingAs($user)->{$method}($this->link($server, $path))->assertForbidden();
})->with('endpoints');

test('world search needs a CurseForge key and searches class 17', function (): void {
    [$user, $server] = S::server($this, WORLD_PERMS);
    config()->set('curseforge.api_key', null);
    $this->actingAs($user)->getJson($this->link($server, '/content/worlds/search'))->assertStatus(409)->assertExactJson(['error' => 'provider_unavailable']);

    config()->set('curseforge.api_key', 'cf-key');
    Http::fake([CFW.'/mods/search*' => Http::response(['data' => [['id' => 888, 'name' => 'Cool World', 'slug' => 'cool-world', 'latestFilesIndexes' => [['gameVersion' => '1.21.1', 'fileId' => 30]]]], 'pagination' => ['totalCount' => 1]])]);

    $this->actingAs($user)->getJson($this->link($server, '/content/worlds/search?query=cool'))->assertOk()
        ->assertJsonPath('data.0.project_id', '888')
        ->assertJsonPath('data.0.minecraft', '1.21.1');
    Http::assertSent(fn ($request): bool => str_contains($request->url(), '/mods/search') && str_contains($request->url(), 'classId=17'));
});

test('world file versions use the CurseForge file id', function (): void {
    [$user, $server] = S::server($this, WORLD_PERMS);
    Http::fake([CFW.'/mods/888/files*' => Http::response(['data' => [['id' => 30, 'fileName' => 'world.zip', 'displayName' => 'World 1', 'gameVersions' => ['1.21.1'], 'fileLength' => 99, 'releaseType' => 1]]])]);

    $this->actingAs($user)->getJson($this->link($server, '/content/worlds/curseforge/888/versions'))->assertOk()->assertJsonPath('data.0.id', '30')->assertJsonPath('data.0.file.size', 99);
});

test('replacing a world backs the old one up and unpacks the folder that holds level.dat', function (): void {
    [$user, $server] = S::server($this, WORLD_PERMS);
    $files = daemon();
    worldFile(S::zip(['MyWorld/level.dat' => 'x', 'MyWorld/region/r.0.0.mca' => 'x', 'MyWorld/DIM-1/a' => 'x']));

    $this->actingAs($user)->postJson($this->link($server, '/content/worlds/install'), ['project_id' => '888', 'file_id' => '30', 'mode' => 'replace', 'backup' => true])
        ->assertStatus(202)->assertJsonPath('kind', 'world');

    $plan = S::plan($files);
    $stamp = mb_substr($plan['moves'][0]['to'], mb_strlen('world-backup-'));
    expect($plan['operation'])->toBe('world')
        ->and($plan['software'])->toBeNull()
        ->and($plan['wipe']['enabled'])->toBeFalse()
        ->and($plan['moves'])->toBe([['from' => 'world', 'to' => "world-backup-$stamp"], ['from' => 'world_nether', 'to' => "world-backup-{$stamp}_nether"]])
        ->and($plan['archives'])->toBe([['url' => 'https://edge.forgecdn.net/files/1/30/world.zip', 'local' => null, 'sha1' => S::sha1('world'), 'strip' => 'MyWorld/', 'into' => 'world', 'only' => 'MyWorld/']]);
    expect($stamp)->toMatch('/^\d{8}-\d{4}$/');
});

test('replacing a world without a backup removes the old folders', function (): void {
    [$user, $server] = S::server($this, WORLD_PERMS);
    $files = daemon();
    worldFile(S::zip(['level.dat' => 'x']));

    $this->actingAs($user)->postJson($this->link($server, '/content/worlds/install'), ['project_id' => '888', 'file_id' => '30', 'backup' => false])->assertStatus(202);

    $plan = S::plan($files);
    expect($plan['moves'])->toBe([])
        ->and($plan['remove'])->toBe(['world', 'world_nether'])
        ->and($plan['archives'][0])->toMatchArray(['strip' => '', 'only' => null, 'into' => 'world']);
});

test('a new world goes into its own folder and sets level-name once installed', function (): void {
    [$user, $server] = S::server($this, WORLD_PERMS);
    $files = daemon();
    worldFile(S::zip(['MyWorld/level.dat' => 'x']));

    $operation = $this->actingAs($user)->postJson($this->link($server, '/content/worlds/install'), ['project_id' => '888', 'file_id' => '30', 'mode' => 'new', 'level_name' => 'skyblock'])->assertStatus(202)->json();

    $plan = S::plan($files);
    expect($plan['moves'])->toBe([])->and($plan['remove'])->toBe([])->and($plan['archives'][0]['into'])->toBe('skyblock');
    $files->assertContentPut('/.astrelyse/plan.json');

    \Pterodactyl\Models\InstallOperation::query()->whereKey($operation['id'])->update(['status' => 'succeeded']);
    \Pterodactyl\Models\Server::query()->whereKey($server->id)->update(['status' => null]);
    $files->texts['/.astrelyse/x'] = '';
    $this->actingAs($user)->postJson($this->link($server, '/content/resolve'), ['url' => 'https://modrinth.com/shader/x'])->assertOk();
    $files->assertContentPut('/server.properties', "level-name=skyblock\n");
});

test('a new world needs a valid level name that does not exist yet', function (): void {
    [$user, $server] = S::server($this, WORLD_PERMS);
    daemon();
    worldFile(S::zip(['level.dat' => 'x']));

    $this->actingAs($user)->postJson($this->link($server, '/content/worlds/install'), ['project_id' => '888', 'file_id' => '30', 'mode' => 'new'])->assertStatus(422)->assertJsonPath('error', 'invalid_level_name');
    $this->actingAs($user)->postJson($this->link($server, '/content/worlds/install'), ['project_id' => '888', 'file_id' => '30', 'mode' => 'new', 'level_name' => '../x'])->assertStatus(422)->assertJsonPath('error', 'invalid_level_name');
    $this->actingAs($user)->postJson($this->link($server, '/content/worlds/install'), ['project_id' => '888', 'file_id' => '30', 'mode' => 'new', 'level_name' => 'world_nether'])->assertStatus(422)->assertJsonPath('error', 'level_exists');
});

test('a download without level.dat is not a world', function (): void {
    [$user, $server] = S::server($this, WORLD_PERMS);
    $files = daemon();
    worldFile(S::zip(['readme.txt' => 'x', 'mods/a.jar' => 'x']));

    $this->actingAs($user)->postJson($this->link($server, '/content/worlds/install'), ['project_id' => '888', 'file_id' => '30'])->assertStatus(422)->assertJsonPath('error', 'not_a_world');
    expect($files->callsFor('putContent'))->toBe([]);
});

test('a world zip the user uploaded is staged, searched for level.dat and unpacked from there', function (): void {
    [$user, $server] = S::server($this, WORLD_PERMS);
    $files = daemon();
    $files->tree['/.astrelyse/uploads'] = [['w.zip', false]];
    $files->tree['/.astrelyse/import/{id}'] = [['pack.zip', false], ['Saves', true]];
    $files->tree['/.astrelyse/import/{id}/Saves'] = [['My World', true]];
    $files->tree['/.astrelyse/import/{id}/Saves/My World'] = [['level.dat', false], ['region', true]];

    $this->actingAs($user)->postJson($this->link($server, '/content/worlds/import-local'), ['path' => '/.astrelyse/uploads/w.zip', 'mode' => 'replace', 'backup' => true])->assertStatus(202);

    $files->assertFileDecompressed();
    $plan = S::plan($files);
    expect($plan['archives'][0]['local'])->toMatch('#^\.astrelyse/import/[0-9a-f\-]{36}/pack\.zip$#')
        ->and($plan['archives'][0]['url'])->toBeNull()
        ->and($plan['archives'][0])->toMatchArray(['strip' => 'Saves/My World/', 'only' => 'Saves/My World/', 'into' => 'world']);
});

test('an uploaded zip without level.dat is a not_a_world error and goes back where it was', function (): void {
    [$user, $server] = S::server($this, WORLD_PERMS);
    $files = daemon();
    $files->tree['/.astrelyse/uploads'] = [['w.zip', false]];
    $files->tree['/.astrelyse/import/{id}'] = [['pack.zip', false], ['stuff', true]];
    $files->tree['/.astrelyse/import/{id}/stuff'] = [['a.txt', false]];

    $this->actingAs($user)->postJson($this->link($server, '/content/worlds/import-local'), ['path' => '/.astrelyse/uploads/w.zip'])->assertStatus(422)->assertJsonPath('error', 'not_a_world');

    $renames = array_map(fn (array $call): mixed => $call['files'], $files->callsFor('renameFiles'));
    expect($renames)->toHaveCount(2)->and($renames[1][0]['to'])->toBe('.astrelyse/uploads/w.zip');
    expect($files->callsFor('putContent'))->toBe([]);
});
