<?php

declare(strict_types=1);

namespace Pterodactyl\Tests\Pest\Integration\Api\Client\Server\Mods\ServerSideRulesTest;

use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Pterodactyl\Enum\Permissions;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\Tag;
use Pterodactyl\Tests\Integration\Api\Client\ClientApiIntegrationTestCase;
use Pterodactyl\Tests\Support\Fakes\FakeDaemonFile;

uses(ClientApiIntegrationTestCase::class);

const PERMS = [Permissions::ModsRead->value, Permissions::ModsInstall->value];
const CFKEY = 'cf-key';
const CFAPI = 'api.curseforge.com/v1';

beforeEach(function (): void {
    Cache::flush();
});

/** @return array{\Pterodactyl\Models\User, Server} */
function platformServer(string $eggName): array
{
    config()->set('curseforge.api_key', CFKEY);
    [$user, $server] = test()->generateTestAccount(PERMS);
    $egg = $server->egg;
    $egg->forceFill(['name' => $eggName])->save();
    $egg->tags()->syncWithoutDetaching([Tag::query()->where('slug', 'minecraft')->value('id') ?? Tag::factory()->predefined('minecraft')->create()->id]);
    $egg->variables()->updateOrCreate(['env_variable' => 'MC_VERSION'], ['name' => 'MC version', 'default_value' => '1.21.4', 'user_viewable' => true, 'user_editable' => true, 'rules' => 'required']);
    $server->unsetRelation('egg');

    return [$user, $server];
}

function mrVersion(string $id, array $loaders = ['fabric']): array
{
    return ['id' => $id, 'project_id' => 'AANobbMI', 'name' => "V $id", 'version_number' => $id, 'version_type' => 'release', 'date_published' => '2025-01-01T00:00:00Z', 'game_versions' => ['1.21.4'], 'loaders' => $loaders, 'dependencies' => [], 'files' => [['primary' => true, 'filename' => "mod-$id.jar", 'url' => "https://cdn.modrinth.com/data/AANobbMI/versions/$id/mod-$id.jar", 'size' => 1, 'hashes' => ['sha512' => "h$id", 'sha1' => "s$id"]]]];
}

function cfModFile(int $id, string $sha1): array
{
    return ['id' => $id, 'modId' => 123, 'displayName' => "F$id", 'fileName' => "f$id.jar", 'releaseType' => 1, 'fileDate' => "2025-0$id-01T00:00:00Z", 'fileLength' => 5, 'isAvailable' => true, 'downloadUrl' => "https://edge.forgecdn.net/files/1/$id/f$id.jar", 'gameVersions' => ['1.21.4', 'Fabric'], 'hashes' => [['value' => $sha1, 'algo' => 1]], 'dependencies' => []];
}

function modrinthSides(array $versions = [], array $projects = []): void
{
    Http::fake([
        'api.modrinth.com/v2/version_files' => Http::response($versions),
        'api.modrinth.com/v2/projects*' => Http::response($projects),
    ]);
}

test('Modrinth refuses to install a client-only project', function (): void {
    [$user, $server] = platformServer('Fabric Minecraft');
    $fake = new FakeDaemonFile;
    Http::fake([
        'api.modrinth.com/v2/project/AANobbMI' => Http::response(['id' => 'AANobbMI', 'slug' => 'sodium', 'title' => 'Sodium', 'client_side' => 'required', 'server_side' => 'unsupported']),
        'api.modrinth.com/v2/version/tFw0iWAk' => Http::response(mrVersion('tFw0iWAk')),
    ]);

    $this->actingAs($user)->postJson($this->link($server, '/mods/install'), ['project_id' => 'AANobbMI', 'version_id' => 'tFw0iWAk'])
        ->assertStatus(422)
        ->assertJsonPath('error', 'client_only');
    expect($fake->callsFor('pull'))->toBe([]);
});

test('Modrinth rows carry the side and versions say server, both or unknown', function (string $client, string $server, string $expected): void {
    [$user, $mc] = platformServer('Fabric Minecraft');
    Http::fake([
        'api.modrinth.com/v2/project/AANobbMI' => Http::response(['id' => 'AANobbMI', 'slug' => 'sodium', 'title' => 'Sodium', 'client_side' => $client, 'server_side' => $server]),
        'api.modrinth.com/v2/project/AANobbMI/version*' => Http::response([mrVersion('tFw0iWAk')]),
        'api.modrinth.com/v2/search*' => Http::response(['total_hits' => 1, 'hits' => [['project_id' => 'AANobbMI', 'slug' => 'sodium', 'title' => 'Sodium', 'client_side' => $client, 'server_side' => $server, 'versions' => ['1.21.4'], 'categories' => ['fabric', 'optimization']]]]),
    ]);

    $this->actingAs($user)->getJson($this->link($mc, '/mods/projects/AANobbMI/versions'))->assertOk()->assertJsonPath('data.0.side', $expected);
    $this->actingAs($user)->getJson($this->link($mc, '/mods/search'))->assertOk()->assertJsonPath('data.0.side', $expected);
})->with([
    'server only' => ['unsupported', 'required', 'server'],
    'both' => ['required', 'optional', 'both'],
    'unknown' => ['unknown', 'unknown', 'unknown'],
]);

test('the CurseForge side check hides client-only files and marks unknown ones unverified', function (): void {
    [$user, $server] = platformServer('Fabric Minecraft');
    Http::fake([
        CFAPI.'/mods/123' => Http::response(['data' => ['id' => 123, 'name' => 'Example', 'slug' => 'example', 'links' => ['websiteUrl' => 'https://www.curseforge.com/minecraft/mc-mods/example'], 'allowModDistribution' => true]]),
        CFAPI.'/mods/123/files*' => Http::response(['data' => [cfModFile(1, 'aaa'), cfModFile(2, 'bbb'), cfModFile(3, 'ccc')]]),
        'api.modrinth.com/v2/version_files' => Http::response([
            'aaa' => ['id' => 'v1aaaaaa', 'project_id' => 'PROJCLNT'],
            'bbb' => ['id' => 'v2bbbbbb', 'project_id' => 'PROJBOTH'],
        ]),
        'api.modrinth.com/v2/projects*' => Http::response([
            ['id' => 'PROJCLNT', 'client_side' => 'required', 'server_side' => 'unsupported'],
            ['id' => 'PROJBOTH', 'client_side' => 'required', 'server_side' => 'optional'],
        ]),
    ]);

    $rows = collect($this->actingAs($user)->getJson($this->link($server, '/mods/projects/123/versions?provider=curseforge'))->assertOk()->json('data'))->keyBy('id');

    expect($rows->has('1'))->toBeFalse()
        ->and($rows['2']['side'])->toBe('both')
        ->and($rows['3']['side'])->toBe('unknown');

    Http::assertSent(fn (Request $request): bool => str_ends_with($request->url(), '/version_files') && $request->data()['algorithm'] === 'sha1' && count($request->data()['hashes']) === 3);
});

test('a CurseForge search hides client-only mods and does not preselect unknown ones', function (): void {
    [$user, $server] = platformServer('Fabric Minecraft');
    $hit = fn (int $id, string $sha1): array => ['id' => $id, 'name' => "Mod $id", 'slug' => "mod-$id", 'summary' => 's', 'downloadCount' => 1, 'authors' => [], 'categories' => [], 'allowModDistribution' => true, 'latestFilesIndexes' => [['gameVersion' => '1.21.4', 'modLoader' => 4, 'fileId' => $id]], 'latestFiles' => [['id' => $id, 'hashes' => [['value' => $sha1, 'algo' => 1]]]]];
    Http::fake([
        CFAPI.'/mods/search*' => Http::response(['data' => [$hit(1, 'aaa'), $hit(2, 'zzz')], 'pagination' => ['totalCount' => 2]]),
        'api.modrinth.com/v2/version_files' => Http::response(['aaa' => ['id' => 'v1aaaaaa', 'project_id' => 'PROJCLNT']]),
        'api.modrinth.com/v2/projects*' => Http::response([['id' => 'PROJCLNT', 'client_side' => 'required', 'server_side' => 'unsupported']]),
    ]);

    $data = $this->actingAs($user)->getJson($this->link($server, '/mods/search?provider=curseforge'))->assertOk()->json('data');

    expect($data)->toHaveCount(1)
        ->and($data[0]['project_id'])->toBe('2')
        ->and($data[0]['side'])->toBe('unknown');
});

test('installing a client-only CurseForge file is refused', function (): void {
    [$user, $server] = platformServer('Fabric Minecraft');
    $fake = new FakeDaemonFile;
    Http::fake([
        CFAPI.'/mods/123' => Http::response(['data' => ['id' => 123, 'name' => 'Example', 'slug' => 'example', 'allowModDistribution' => true]]),
        CFAPI.'/mods/123/files/1' => Http::response(['data' => cfModFile(1, 'aaa')]),
        'api.modrinth.com/v2/version_files' => Http::response(['aaa' => ['id' => 'v1aaaaaa', 'project_id' => 'PROJCLNT']]),
        'api.modrinth.com/v2/projects*' => Http::response([['id' => 'PROJCLNT', 'client_side' => 'required', 'server_side' => 'unsupported']]),
    ]);

    $this->actingAs($user)->postJson($this->link($server, '/mods/install'), ['provider' => 'curseforge', 'project_id' => '123', 'version_id' => '1'])->assertStatus(422)->assertJsonPath('error', 'client_only');
    expect($fake->callsFor('pull'))->toBe([]);
});

test('each server sees only the loaders it accepts', function (string $egg, array $expected): void {
    [$user, $server] = platformServer($egg);
    Http::fake([
        'api.modrinth.com/v2/search*' => Http::response(['total_hits' => 0, 'hits' => []]),
        'api.modrinth.com/v2/project/AANobbMI*' => Http::response(['id' => 'AANobbMI', 'server_side' => 'required', 'client_side' => 'required']),
    ]);

    $this->actingAs($user)->getJson($this->link($server, '/mods/search'))->assertOk();
    Http::assertSent(function (Request $request) use ($expected): bool {
        if (! str_contains($request->url(), '/search')) {
            return false;
        }
        parse_str((string) parse_url($request->url(), PHP_URL_QUERY), $query);
        $facets = json_decode($query['facets'], true);

        return in_array(array_map(fn (string $loader): string => "categories:$loader", $expected), $facets, true);
    });

    $this->actingAs($user)->getJson($this->link($server, '/mods/projects/AANobbMI/versions'))->assertOk();
    Http::assertSent(fn (Request $request): bool => str_contains($request->url(), '/project/AANobbMI/version') && str_contains(urldecode($request->url()), 'loaders='.json_encode($expected)));
})->with([
    'quilt sees fabric' => ['Quilt Minecraft', ['quilt', 'fabric']],
    'forge never sees fabric' => ['Forge Minecraft', ['forge']],
    'purpur sees bukkit' => ['Purpur Minecraft', ['purpur', 'paper', 'spigot', 'bukkit']],
    'paper' => ['Paper Minecraft', ['paper', 'spigot', 'bukkit']],
    'fabric' => ['Fabric Minecraft', ['fabric']],
]);

test('a fabric version cannot be installed on a forge server', function (): void {
    [$user, $server] = platformServer('Forge Minecraft');
    $fake = new FakeDaemonFile;
    Http::fake([
        'api.modrinth.com/v2/project/AANobbMI' => Http::response(['id' => 'AANobbMI', 'server_side' => 'required', 'client_side' => 'required']),
        'api.modrinth.com/v2/version/tFw0iWAk' => Http::response(mrVersion('tFw0iWAk', ['fabric'])),
    ]);

    $this->actingAs($user)->postJson($this->link($server, '/mods/install'), ['project_id' => 'AANobbMI', 'version_id' => 'tFw0iWAk'])->assertStatus(400);
    expect($fake->callsFor('pull'))->toBe([]);
});

test('a quilt server accepts a fabric version', function (): void {
    [$user, $server] = platformServer('Quilt Minecraft');
    new FakeDaemonFile;
    Http::fake([
        'api.modrinth.com/v2/project/AANobbMI' => Http::response(['id' => 'AANobbMI', 'slug' => 'sodium', 'title' => 'Sodium', 'server_side' => 'required', 'client_side' => 'required']),
        'api.modrinth.com/v2/version/tFw0iWAk' => Http::response(mrVersion('tFw0iWAk', ['fabric'])),
    ]);

    $this->actingAs($user)->postJson($this->link($server, '/mods/install'), ['project_id' => 'AANobbMI', 'version_id' => 'tFw0iWAk'])->assertStatus(202);
});

test('the category filter becomes a facet, and CurseForge takes a category id', function (): void {
    [$user, $server] = platformServer('Fabric Minecraft');
    Http::fake([
        'api.modrinth.com/v2/search*' => Http::response(['total_hits' => 0, 'hits' => []]),
        CFAPI.'/mods/search*' => Http::response(['data' => [], 'pagination' => ['totalCount' => 0]]),
    ]);

    $this->actingAs($user)->getJson($this->link($server, '/mods/search?category=optimization'))->assertOk();
    Http::assertSent(fn (Request $request): bool => str_contains(urldecode($request->url()), '["categories:optimization"]'));

    $this->actingAs($user)->getJson($this->link($server, '/mods/search?provider=curseforge&category=423'))->assertOk();
    Http::assertSent(fn (Request $request): bool => str_contains($request->url(), CFAPI.'/mods/search') && str_contains($request->url(), 'categoryId=423'));

    $this->actingAs($user)->getJson($this->link($server, '/mods/search?provider=curseforge&category=abc'))->assertUnprocessable();
    $this->actingAs($user)->getJson($this->link($server, '/mods/search?category=Bad%20One'))->assertUnprocessable();
});

test('categories are the project type topics of each provider', function (): void {
    [$user, $server] = platformServer('Fabric Minecraft');
    Http::fake([
        'api.modrinth.com/v2/tag/category' => Http::response([
            ['name' => 'optimization', 'project_type' => 'mod', 'header' => 'categories'],
            ['name' => 'fabric', 'project_type' => 'mod', 'header' => 'loaders'],
            ['name' => 'shaders-thing', 'project_type' => 'shader', 'header' => 'categories'],
        ]),
        CFAPI.'/categories*' => Http::response(['data' => [['id' => 6, 'name' => 'Mods', 'isClass' => true], ['id' => 423, 'name' => 'Map and Information', 'isClass' => false]]]),
    ]);

    $this->actingAs($user)->getJson($this->link($server, '/mods/categories'))->assertOk()->assertExactJson(['data' => [['id' => 'optimization', 'label' => 'Optimization']]]);
    $this->actingAs($user)->getJson($this->link($server, '/mods/categories?provider=curseforge'))->assertOk()->assertExactJson(['data' => [['id' => '423', 'label' => 'Map and Information']]]);
    Http::assertSent(fn (Request $request): bool => str_contains($request->url(), '/categories') && str_contains($request->url(), 'classId=6') && str_contains($request->url(), 'gameId=432'));
});

test('project details are plain text and https only', function (): void {
    [$user, $server] = platformServer('Fabric Minecraft');
    Http::fake([
        'api.modrinth.com/v2/project/AANobbMI' => Http::response(['id' => 'AANobbMI', 'body' => str_repeat('a', 30000), 'gallery' => array_merge(
            array_map(fn (int $i): array => ['url' => "https://cdn.modrinth.com/img$i.png", 'title' => "T$i"], range(1, 10)),
            [['url' => 'http://insecure.example/a.png'], ['url' => 'javascript:alert(1)']],
        ), 'source_url' => 'https://github.com/a/b', 'issues_url' => 'http://insecure.example', 'wiki_url' => null, 'discord_url' => 'javascript:alert(1)']),
        CFAPI.'/mods/123' => Http::response(['data' => ['id' => 123, 'summary' => 'sum', 'links' => ['sourceUrl' => 'https://github.com/c/d', 'issuesUrl' => 'https://x.example/i', 'wikiUrl' => null], 'screenshots' => [['url' => 'https://media.forgecdn.net/s.png', 'title' => 'S']]]]),
        CFAPI.'/mods/123/description' => Http::response(['data' => '<h1>Hello</h1><p>World &amp; more</p><script>alert(1)</script>']),
    ]);

    $modrinth = $this->actingAs($user)->getJson($this->link($server, '/mods/projects/AANobbMI'))->assertOk()->assertJsonPath('object', 'mod_project');
    expect(mb_strlen($modrinth->json('attributes.body')))->toBeLessThanOrEqual(20480)
        ->and($modrinth->json('attributes.gallery'))->toHaveCount(8)
        ->and($modrinth->json('attributes.links'))->toBe(['source' => 'https://github.com/a/b', 'issues' => null, 'wiki' => null, 'discord' => null]);

    $cf = $this->actingAs($user)->getJson($this->link($server, '/mods/projects/123?provider=curseforge'))->assertOk();
    expect($cf->json('attributes.body'))->toContain('Hello')->toContain('World & more')->not->toContain('<')->not->toContain('alert')
        ->and($cf->json('attributes.gallery'))->toBe([['url' => 'https://media.forgecdn.net/s.png', 'title' => 'S']])
        ->and($cf->json('attributes.links.source'))->toBe('https://github.com/c/d');
});

test('installed rows say whether a modpack installed them', function (): void {
    [$user, $server] = platformServer('Fabric Minecraft');
    $fake = new FakeDaemonFile;
    $fake->directory = [['name' => 'a.jar', 'mode' => '-rw-r--r--', 'mode_bits' => '0644', 'size' => 1, 'file' => true, 'symlink' => false, 'mime' => 'x', 'created' => '2024-01-01T00:00:00Z', 'modified' => '2024-01-01T00:00:00Z']];
    \Pterodactyl\Models\ServerModInstall::factory()->create(['server_id' => $server->id, 'filename' => 'a.jar', 'from_modpack' => true]);
    Http::fake(['api.modrinth.com/v2/version_files/update' => Http::response([])]);

    $this->actingAs($user)->getJson($this->link($server, '/mods/installed'))->assertOk()->assertJsonPath('data.0.from_modpack', true);
});

test('the new mods endpoints need mods.read', function (string $path): void {
    [$user, $server] = $this->generateTestAccount([Permissions::ControlConsole->value]);

    $this->getJson($this->link($server, $path))->assertUnauthorized();
    $this->actingAs($user)->getJson($this->link($server, $path))->assertForbidden();
})->with(['/mods/categories', '/mods/projects/AANobbMI']);
