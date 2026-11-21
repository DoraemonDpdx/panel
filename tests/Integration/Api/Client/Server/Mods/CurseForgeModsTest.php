<?php

declare(strict_types=1);

namespace Pterodactyl\Tests\Pest\Integration\Api\Client\Server\Mods\CurseForgeModsTest;

use GuzzleHttp\Psr7\Response as PsrResponse;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Pterodactyl\Enum\Permissions;
use Pterodactyl\Models\ServerModInstall;
use Pterodactyl\Models\Tag;
use Pterodactyl\Tests\Integration\Api\Client\ClientApiIntegrationTestCase;
use Pterodactyl\Tests\Support\Fakes\FakeDaemonFile;

uses(ClientApiIntegrationTestCase::class);

const CF_MODS = [Permissions::ModsRead->value, Permissions::ModsInstall->value];
const CF_KEY = 'cf-secret-key-123';
const CF = 'api.curseforge.com/v1';

function cfServer(string $eggName = 'Fabric Minecraft', bool $key = true): array
{
    config()->set('curseforge.api_key', $key ? CF_KEY : null);
    [$user, $server] = test()->generateTestAccount(CF_MODS);
    $egg = $server->egg;
    $egg->forceFill(['name' => $eggName])->save();
    $egg->tags()->syncWithoutDetaching([Tag::query()->where('slug', 'minecraft')->value('id') ?? Tag::factory()->predefined('minecraft')->create()->id]);
    $egg->variables()->updateOrCreate(['env_variable' => 'MC_VERSION'], ['name' => 'MC version', 'default_value' => '1.21.4', 'user_viewable' => true, 'user_editable' => true, 'rules' => 'required']);
    $server->unsetRelation('egg');

    return [$user, $server];
}

/** @return array<string, mixed> */
function cfFile(int $id, array $overrides = []): array
{
    return [
        'id' => $id,
        'modId' => 123,
        'displayName' => "Example $id",
        'fileName' => "example-$id.jar",
        'releaseType' => 1,
        'fileDate' => "2025-0$id-01T00:00:00Z",
        'fileLength' => 2048,
        'isAvailable' => true,
        'downloadUrl' => "https://edge.forgecdn.net/files/1/$id/example-$id.jar",
        'gameVersions' => ['1.21.4', 'Fabric'],
        'hashes' => [['value' => "sha1-$id", 'algo' => 1], ['value' => 'md5', 'algo' => 2]],
        'dependencies' => [['modId' => 306612, 'relationType' => 3]],
        ...$overrides,
    ];
}

function cfFake(array $project = [], array $stubs = []): void
{
    Http::fake([
        // The side check asks Modrinth about every CurseForge file; by default it knows none of them.
        'api.modrinth.com/v2/version_files*' => Http::response([]),
        'api.modrinth.com/v2/projects*' => Http::response([]),
        CF.'/mods/123' => Http::response(['data' => ['id' => 123, 'name' => 'Example', 'slug' => 'example', 'links' => ['websiteUrl' => 'https://www.curseforge.com/minecraft/mc-mods/example'], 'logo' => ['thumbnailUrl' => 'https://media.forgecdn.net/logo.png'], 'allowModDistribution' => true, ...$project]]),
        ...$stubs,
    ]);
}

function cfListing(FakeDaemonFile $fake, array $names): void
{
    $fake->directory = array_map(fn (string $name): array => ['name' => $name, 'mode' => '-rw-r--r--', 'mode_bits' => '0644', 'size' => 1, 'file' => true, 'symlink' => false, 'mime' => 'application/java-archive', 'created' => '2024-01-01T00:00:00Z', 'modified' => '2024-01-01T00:00:00Z'], $names);
}

function cfPulls(): array
{
    return Http::recorded(fn (Request $request): bool => str_ends_with($request->url(), '/files/pull'))->map(fn (array $pair): array => $pair[0]->data())->values()->all();
}

test('platform lists the providers that can be used', function (): void {
    [$user, $server] = cfServer(key: false);
    $this->actingAs($user)->getJson($this->link($server, '/mods/platform'))->assertOk()->assertJsonPath('attributes.providers', ['modrinth']);

    config()->set('curseforge.api_key', CF_KEY);
    $this->actingAs($user)->getJson($this->link($server, '/mods/platform'))->assertOk()->assertJsonPath('attributes.providers', ['modrinth', 'curseforge']);
});

test('curseforge without an api key is a 409 provider_unavailable', function (): void {
    [$user, $server] = cfServer(key: false);
    new FakeDaemonFile;
    cfFake();

    $this->actingAs($user)->getJson($this->link($server, '/mods/search?provider=curseforge'))->assertStatus(409)->assertExactJson(['error' => 'provider_unavailable']);
    $this->actingAs($user)->getJson($this->link($server, '/mods/projects/123/versions?provider=curseforge'))->assertStatus(409)->assertExactJson(['error' => 'provider_unavailable']);
    $this->actingAs($user)->postJson($this->link($server, '/mods/install'), ['provider' => 'curseforge', 'project_id' => '123', 'version_id' => '456'])->assertStatus(409)->assertExactJson(['error' => 'provider_unavailable']);
    $this->actingAs($user)->getJson($this->link($server, '/mods/search?provider=nope'))->assertUnprocessable();
});

test('curseforge search sends the loader type, game version and class id', function (): void {
    [$user, $server] = cfServer();
    cfFake(stubs: [CF.'/mods/search*' => Http::response([
        'data' => [['id' => 123, 'name' => 'Example', 'slug' => 'example', 'summary' => 'A mod', 'downloadCount' => 99, 'authors' => [['name' => 'someone']], 'categories' => [['name' => 'Optimization']], 'logo' => ['thumbnailUrl' => 'https://media.forgecdn.net/l.png'], 'links' => ['websiteUrl' => 'https://www.curseforge.com/minecraft/mc-mods/example'], 'allowModDistribution' => false]],
        'pagination' => ['index' => 0, 'pageSize' => 20, 'resultCount' => 1, 'totalCount' => 1],
    ])]);
    ServerModInstall::factory()->create(['server_id' => $server->id, 'provider' => 'curseforge', 'project_id' => '123']);

    $this->actingAs($user)->getJson($this->link($server, '/mods/search?provider=curseforge&query=example&sort=downloads&limit=10'))->assertOk()
        ->assertJsonPath('data.0.provider', 'curseforge')
        ->assertJsonPath('data.0.project_id', '123')
        ->assertJsonPath('data.0.title', 'Example')
        ->assertJsonPath('data.0.downloads', 99)
        ->assertJsonPath('data.0.author', 'someone')
        ->assertJsonPath('data.0.categories', ['Optimization'])
        ->assertJsonPath('data.0.distributable', false)
        ->assertJsonPath('data.0.page_url', 'https://www.curseforge.com/minecraft/mc-mods/example')
        ->assertJsonPath('data.0.installed', true)
        ->assertJsonPath('meta.total', 1);

    Http::assertSent(function (Request $request): bool {
        if (! str_contains($request->url(), CF.'/mods/search')) {
            return false;
        }
        parse_str((string) parse_url($request->url(), PHP_URL_QUERY), $q);

        return $request->header('x-api-key') === [CF_KEY]
            && (int) $q['gameId'] === 432 && (int) $q['classId'] === 6 && (int) $q['modLoaderType'] === 4
            && $q['gameVersion'] === '1.21.4' && $q['searchFilter'] === 'example' && (int) $q['sortField'] === 6
            && $q['sortOrder'] === 'desc' && (int) $q['pageSize'] === 10 && (int) $q['index'] === 0;
    });
});

test('on a plugin platform curseforge searches bukkit plugins by game version only', function (): void {
    [$user, $server] = cfServer('Paper Minecraft');
    cfFake(stubs: [CF.'/mods/search*' => Http::response(['data' => [], 'pagination' => ['totalCount' => 0]])]);

    $this->actingAs($user)->getJson($this->link($server, '/mods/search?provider=curseforge'))->assertOk()->assertJsonPath('data', []);

    Http::assertSent(function (Request $request): bool {
        if (! str_contains($request->url(), CF.'/mods/search')) {
            return false;
        }
        parse_str((string) parse_url($request->url(), PHP_URL_QUERY), $q);

        return (int) $q['classId'] === 5 && $q['gameVersion'] === '1.21.4' && ! array_key_exists('modLoaderType', $q);
    });
});

test('curseforge versions carry distribution state, loaders and the sha1', function (): void {
    [$user, $server] = cfServer();
    cfFake(stubs: [CF.'/mods/123/files*' => Http::response(['data' => [cfFile(1), cfFile(2, ['downloadUrl' => null])]])]);

    $response = $this->actingAs($user)->getJson($this->link($server, '/mods/projects/123/versions?provider=curseforge'))->assertOk();
    $rows = collect($response->json('data'))->keyBy('id');

    expect($rows['1'])->toMatchArray(['provider' => 'curseforge', 'distributable' => true, 'version_type' => 'release', 'loaders' => ['fabric'], 'game_versions' => ['1.21.4']])
        ->and($rows['1']['file'])->toMatchArray(['filename' => 'example-1.jar', 'sha1' => 'sha1-1', 'sha512' => null])
        ->and($rows['1']['dependencies'][0])->toMatchArray(['project_id' => '306612', 'dependency_type' => 'required'])
        ->and($rows['2']['distributable'])->toBeFalse()
        ->and($rows['2']['page_url'])->toBe('https://www.curseforge.com/minecraft/mc-mods/example');

    Http::assertSent(function (Request $request): bool {
        parse_str((string) parse_url($request->url(), PHP_URL_QUERY), $q);

        return str_contains($request->url(), '/mods/123/files') && ($q['gameVersion'] ?? null) === '1.21.4' && (int) ($q['modLoaderType'] ?? 0) === 4;
    });
});

test('a numeric id belongs to curseforge and an 8 character id to modrinth', function (): void {
    [$user, $server] = cfServer();
    cfFake();

    $this->actingAs($user)->getJson($this->link($server, '/mods/projects/AANobbMI/versions?provider=curseforge'))->assertUnprocessable();
    $this->actingAs($user)->getJson($this->link($server, '/mods/projects/12345/versions?provider=modrinth'))->assertUnprocessable();
    $this->actingAs($user)->getJson($this->link($server, '/mods/projects/12345/versions'))->assertUnprocessable();
    $this->actingAs($user)->postJson($this->link($server, '/mods/install'), ['provider' => 'curseforge', 'project_id' => 'AANobbMI', 'version_id' => '456'])->assertUnprocessable();
    $this->actingAs($user)->postJson($this->link($server, '/mods/install'), ['provider' => 'modrinth', 'project_id' => '123', 'version_id' => '456'])->assertUnprocessable();
    $this->actingAs($user)->postJson($this->link($server, '/mods/install'), ['provider' => 'curseforge', 'project_id' => '12345678901', 'version_id' => '456'])->assertUnprocessable();
});

test('installing from curseforge pulls from the forgecdn host and stores the sha1', function (): void {
    [$user, $server] = cfServer();
    $fake = new FakeDaemonFile;
    cfFake(stubs: [CF.'/mods/123/files/456' => Http::response(['data' => cfFile(456)])]);

    $this->actingAs($user)->postJson($this->link($server, '/mods/install'), ['provider' => 'curseforge', 'project_id' => '123', 'version_id' => '456'])->assertStatus(202)
        ->assertJsonPath('attributes.provider', 'curseforge')
        ->assertJsonPath('attributes.title', 'Example')
        ->assertJsonPath('attributes.page_url', 'https://www.curseforge.com/minecraft/mc-mods/example')
        ->assertJsonPath('attributes.filename', 'example-456.jar');

    $fake->assertPulled('https://edge.forgecdn.net/files/1/456/example-456.jar');
    expect(cfPulls()[0])->toMatchArray(['root' => '/mods', 'file_name' => 'example-456.jar']);
    $this->assertDatabaseHas('server_mod_installs', ['server_id' => $server->id, 'provider' => 'curseforge', 'project_id' => '123', 'version_id' => '456', 'sha1' => 'sha1-456', 'sha512' => null]);
});

test('a file the author does not allow others to distribute is a 422 with the page to get it from', function (array $project, array $file): void {
    [$user, $server] = cfServer();
    $fake = new FakeDaemonFile;
    cfFake($project, [CF.'/mods/123/files/456' => Http::response(['data' => cfFile(456, $file)])]);

    $this->actingAs($user)->postJson($this->link($server, '/mods/install'), ['provider' => 'curseforge', 'project_id' => '123', 'version_id' => '456'])->assertStatus(422)
        ->assertExactJson(['error' => 'not_distributable', 'page_url' => 'https://www.curseforge.com/minecraft/mc-mods/example']);
    expect($fake->callsFor('pull'))->toBe([]);
    $this->assertDatabaseMissing('server_mod_installs', ['server_id' => $server->id]);
})->with([
    'distribution disallowed' => [['allowModDistribution' => false], []],
    'no download url' => [[], ['downloadUrl' => null]],
]);

test('a curseforge file on a foreign host is rejected', function (string $url): void {
    [$user, $server] = cfServer();
    $fake = new FakeDaemonFile;
    cfFake(stubs: [CF.'/mods/123/files/456' => Http::response(['data' => cfFile(456, ['downloadUrl' => $url])])]);

    $this->actingAs($user)->postJson($this->link($server, '/mods/install'), ['provider' => 'curseforge', 'project_id' => '123', 'version_id' => '456'])->assertStatus(400);
    expect($fake->callsFor('pull'))->toBe([]);
})->with([
    'foreign host' => 'https://evil.example.com/example-456.jar',
    'modrinth cdn is not a curseforge host' => 'https://cdn.modrinth.com/example-456.jar',
    'lookalike' => 'https://edge.forgecdn.net.evil.example.com/a.jar',
    'userinfo' => 'https://edge.forgecdn.net@evil.example.com/a.jar',
    'port' => 'https://edge.forgecdn.net:8443/a.jar',
]);

test('curseforge updates come from the batch lookup and match the loader and game version', function (): void {
    [$user, $server] = cfServer();
    $fake = new FakeDaemonFile;
    cfListing($fake, ['example-400.jar']);
    ServerModInstall::factory()->create(['server_id' => $server->id, 'provider' => 'curseforge', 'project_id' => '123', 'version_id' => '400', 'filename' => 'example-400.jar', 'sha512' => null, 'sha1' => 'old']);
    cfFake(stubs: [CF.'/mods' => Http::response(['data' => [[
        'id' => 123,
        'latestFilesIndexes' => [
            ['gameVersion' => '1.21.4', 'fileId' => 456, 'filename' => 'example-456.jar', 'releaseType' => 1, 'modLoader' => 4],
            ['gameVersion' => '1.21.4', 'fileId' => 999, 'filename' => 'example-forge.jar', 'releaseType' => 1, 'modLoader' => 1],
            ['gameVersion' => '1.20.1', 'fileId' => 1000, 'filename' => 'example-old-mc.jar', 'releaseType' => 1, 'modLoader' => 4],
            ['gameVersion' => '1.21.4', 'fileId' => 500, 'filename' => 'example-beta.jar', 'releaseType' => 2, 'modLoader' => 4],
        ],
    ]]])]);

    $this->actingAs($user)->getJson($this->link($server, '/mods/installed'))->assertOk()
        ->assertJsonPath('data.0.provider', 'curseforge')
        ->assertJsonPath('data.0.update.version_id', '456')
        ->assertJsonPath('data.0.page_url', 'https://www.curseforge.com/minecraft/mc-mods/'.ServerModInstall::query()->where('server_id', $server->id)->value('slug'));

    Http::assertSent(fn (Request $request): bool => $request->method() === 'POST' && str_ends_with($request->url(), CF.'/mods') && $request->data()['modIds'] === [123] && $request->header('x-api-key') === [CF_KEY]);
});

test('curseforge installs are listed without an update when the key is gone', function (): void {
    [$user, $server] = cfServer(key: false);
    $fake = new FakeDaemonFile;
    cfListing($fake, ['example-400.jar']);
    ServerModInstall::factory()->create(['server_id' => $server->id, 'provider' => 'curseforge', 'project_id' => '123', 'filename' => 'example-400.jar']);
    cfFake();

    $this->actingAs($user)->getJson($this->link($server, '/mods/installed'))->assertOk()->assertJsonPath('data.0.update', null)->assertJsonPath('data.0.present', true);
});

test('the api key never appears in a response', function (): void {
    [$user, $server] = cfServer();
    $fake = new FakeDaemonFile;
    cfListing($fake, ['example-400.jar']);
    ServerModInstall::factory()->create(['server_id' => $server->id, 'provider' => 'curseforge', 'project_id' => '123', 'filename' => 'example-400.jar']);
    cfFake(stubs: [
        CF.'/mods/search*' => Http::response(['data' => [], 'pagination' => ['totalCount' => 0]]),
        CF.'/mods/123/files*' => Http::response(['data' => [cfFile(1)]]),
        CF.'/mods/123/files/456' => Http::response(['data' => cfFile(456)]),
        CF.'/mods' => Http::response(['data' => []]),
    ]);

    $bodies = [
        $this->actingAs($user)->getJson($this->link($server, '/mods/platform')),
        $this->actingAs($user)->getJson($this->link($server, '/mods/search?provider=curseforge')),
        $this->actingAs($user)->getJson($this->link($server, '/mods/projects/123/versions?provider=curseforge')),
        $this->actingAs($user)->getJson($this->link($server, '/mods/installed')),
        $this->actingAs($user)->postJson($this->link($server, '/mods/install'), ['provider' => 'curseforge', 'project_id' => '123', 'version_id' => '456']),
    ];

    foreach ($bodies as $response) {
        $this->assertStringNotContainsString(CF_KEY, $response->getContent());
    }
});

test('replacing a file pulls in the foreground and deletes the old jar only afterwards', function (): void {
    [$user, $server] = cfServer();
    $fake = new FakeDaemonFile;
    ServerModInstall::factory()->create(['server_id' => $server->id, 'provider' => 'curseforge', 'project_id' => '123', 'version_id' => '400', 'filename' => 'example-400.jar']);
    cfFake(stubs: [CF.'/mods/123/files/456' => Http::response(['data' => cfFile(456)])]);

    $this->actingAs($user)->postJson($this->link($server, '/mods/install'), ['provider' => 'curseforge', 'project_id' => '123', 'version_id' => '456'])->assertStatus(202);

    expect(cfPulls()[0]['foreground'])->toBeTrue();
    $fake->assertFilesDeleted('/mods', ['example-400.jar']);
    $order = collect($fake->calls)->pluck('method')->filter(fn (string $m): bool => in_array($m, ['pull', 'deleteFiles'], true))->values()->all();
    expect($order)->toBe(['pull', 'deleteFiles']);
});

test('a first install pulls in the background', function (): void {
    [$user, $server] = cfServer();
    new FakeDaemonFile;
    cfFake(stubs: [CF.'/mods/123/files/456' => Http::response(['data' => cfFile(456)])]);

    $this->actingAs($user)->postJson($this->link($server, '/mods/install'), ['provider' => 'curseforge', 'project_id' => '123', 'version_id' => '456'])->assertStatus(202);

    expect(cfPulls()[0]['foreground'] ?? false)->toBeFalse();
});

test('a failed replacement pull keeps the old file and row', function (): void {
    [$user, $server] = cfServer();
    $fake = new FakeDaemonFile;
    $fake->response = new PsrResponse(500, ['Content-Type' => 'application/json'], '{"error":"download failed"}');
    $old = ServerModInstall::factory()->create(['server_id' => $server->id, 'provider' => 'curseforge', 'project_id' => '123', 'version_id' => '400', 'filename' => 'example-400.jar', 'version_number' => 'Example 400']);
    cfFake(stubs: [CF.'/mods/123/files/456' => Http::response(['data' => cfFile(456)])]);

    $this->actingAs($user)->postJson($this->link($server, '/mods/install'), ['provider' => 'curseforge', 'project_id' => '123', 'version_id' => '456'])->assertStatus(500);

    expect($fake->callsFor('deleteFiles'))->toBe([]);
    $old->refresh();
    expect($old->version_id)->toBe('400')->and($old->filename)->toBe('example-400.jar')->and($old->version_number)->toBe('Example 400');
    expect(ServerModInstall::query()->where('server_id', $server->id)->count())->toBe(1);
});
