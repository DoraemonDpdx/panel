<?php

declare(strict_types=1);

namespace Pterodactyl\Tests\Pest\Integration\Api\Client\Server\Mods\ModsControllerTest;

use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Pterodactyl\Enum\Permissions;
use Pterodactyl\Events\ActivityLogged;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\ServerModInstall;
use Pterodactyl\Models\Tag;
use Pterodactyl\Tests\Integration\Api\Client\ClientApiIntegrationTestCase;
use Pterodactyl\Tests\Support\Fakes\FakeDaemonFile;

uses(ClientApiIntegrationTestCase::class);

const MODS = [Permissions::ModsRead->value, Permissions::ModsInstall->value];

/** Turns the server's egg into a Minecraft egg of the given name, with an MC_VERSION default. */
function minecraft(Server $server, string $eggName = 'Fabric Minecraft', string $version = '1.21.4', string $tag = 'minecraft'): void
{
    $egg = $server->egg;
    $egg->forceFill(['name' => $eggName])->save();
    $egg->tags()->syncWithoutDetaching([Tag::query()->where('slug', $tag)->value('id') ?? Tag::factory()->predefined($tag)->create()->id]);
    $egg->variables()->updateOrCreate(['env_variable' => 'MC_VERSION'], ['name' => 'MC version', 'default_value' => $version, 'user_viewable' => true, 'user_editable' => true, 'rules' => 'required']);
    $server->unsetRelation('egg');
}

/** @return array<string, mixed> */
function version(string $id, string $project = 'AANobbMI', array $overrides = []): array
{
    return [
        'id' => $id,
        'project_id' => $project,
        'name' => "Version $id",
        'version_number' => "v$id",
        'version_type' => 'release',
        'date_published' => '2025-01-01T00:00:00Z',
        'game_versions' => ['1.21.4'],
        'loaders' => ['fabric'],
        'dependencies' => [],
        'files' => [['primary' => true, 'filename' => "sodium-$id.jar", 'url' => "https://cdn.modrinth.com/data/$project/versions/$id/sodium-$id.jar", 'size' => 100, 'hashes' => ['sha512' => "hash$id"]]],
        ...$overrides,
    ];
}

function modrinth(array $stubs = []): void
{
    Http::fake([
        'api.modrinth.com/v2/project/AANobbMI' => Http::response(['slug' => 'sodium', 'title' => 'Sodium', 'icon_url' => 'https://cdn.modrinth.com/icon.png']),
        ...$stubs,
    ]);
}

/** @param list<string> $names */
function listing(FakeDaemonFile $fake, array $names): void
{
    $fake->directory = array_map(fn (string $name): array => ['name' => $name, 'mode' => '-rw-r--r--', 'mode_bits' => '0644', 'size' => 1, 'file' => true, 'symlink' => false, 'mime' => 'application/java-archive', 'created' => '2024-01-01T00:00:00Z', 'modified' => '2024-01-01T00:00:00Z'], $names);
}

function pulls(): array
{
    return Http::recorded(fn (Request $request): bool => str_ends_with($request->url(), '/files/pull'))->map(fn (array $pair): array => $pair[0]->data())->values()->all();
}

function fabricServer(array $permissions = MODS): array
{
    [$user, $server] = test()->generateTestAccount($permissions);
    minecraft($server);

    return [$user, $server];
}

dataset('endpoints', fn (): array => [
    'platform' => ['getJson', '/mods/platform'],
    'search' => ['getJson', '/mods/search'],
    'versions' => ['getJson', '/mods/projects/AANobbMI/versions'],
    'installed' => ['getJson', '/mods/installed'],
    'install' => ['postJson', '/mods/install'],
    'toggle' => ['postJson', '/mods/installed/toggle'],
    'delete' => ['postJson', '/mods/installed/delete'],
    'change version' => ['postJson', '/mods/installed/1/version'],
    'remove' => ['deleteJson', '/mods/installed/1'],
]);

test('every endpoint requires authentication and permission', function (string $method, string $path): void {
    [, $server] = $this->generateTestAccount();
    $this->{$method}($this->link($server, $path))->assertUnauthorized();

    [$user, $server] = $this->generateTestAccount([Permissions::ControlConsole->value]);
    $this->actingAs($user)->{$method}($this->link($server, $path))->assertForbidden();
})->with('endpoints');

test('mods.read cannot install or remove', function (): void {
    [$user, $server] = fabricServer([Permissions::ModsRead->value]);
    modrinth();

    $this->actingAs($user)->postJson($this->link($server, '/mods/install'), ['project_id' => 'AANobbMI', 'version_id' => 'tFw0iWAk'])->assertForbidden();
    $this->actingAs($user)->postJson($this->link($server, '/mods/installed/toggle'), ['filename' => 'a.jar', 'enabled' => false])->assertForbidden();
    $this->actingAs($user)->deleteJson($this->link($server, '/mods/installed/1'))->assertForbidden();
});

test('the platform endpoint reports the detected loader and version', function (): void {
    [$user, $server] = fabricServer();

    $this->actingAs($user)->getJson($this->link($server, '/mods/platform'))->assertOk()
        ->assertJsonPath('object', 'mod_platform')
        ->assertJsonPath('attributes.eligible', true)
        ->assertJsonPath('attributes.platform', 'fabric')
        ->assertJsonPath('attributes.install_dir', 'mods')
        ->assertJsonPath('attributes.resolved_game_version', '1.21.4');
});

test('an ineligible server gets 409 everywhere but the platform endpoint', function (): void {
    [$user, $server] = $this->generateTestAccount(MODS);
    $server->egg->tags()->detach();
    $server->unsetRelation('egg');
    modrinth();

    $this->actingAs($user)->getJson($this->link($server, '/mods/platform'))->assertOk()->assertJsonPath('attributes.eligible', false);
    $this->actingAs($user)->getJson($this->link($server, '/mods/search'))->assertStatus(409)->assertExactJson(['error' => 'mods_unsupported']);
    $this->actingAs($user)->getJson($this->link($server, '/mods/installed'))->assertStatus(409);
    $this->actingAs($user)->postJson($this->link($server, '/mods/install'), ['project_id' => 'AANobbMI', 'version_id' => 'tFw0iWAk'])->assertStatus(409);
    $this->actingAs($user)->getJson($this->link($server, '/mods/projects/AANobbMI/versions'))->assertStatus(409);
});

test('search sends the detected loader and game version as facets', function (): void {
    [$user, $server] = fabricServer();
    modrinth(['api.modrinth.com/v2/search*' => Http::response(['total_hits' => 1, 'hits' => [['project_id' => 'AANobbMI', 'slug' => 'sodium', 'title' => 'Sodium', 'description' => 'd', 'icon_url' => null, 'downloads' => 5, 'author' => 'a', 'categories' => ['fabric'], 'display_categories' => ['optimization']]]])]);
    ServerModInstall::factory()->create(['server_id' => $server->id, 'project_id' => 'AANobbMI']);

    $this->actingAs($user)->getJson($this->link($server, '/mods/search?query=sodium&sort=downloads&limit=10'))->assertOk()
        ->assertJsonPath('data.0.project_id', 'AANobbMI')
        ->assertJsonPath('data.0.installed', true)
        ->assertJsonPath('data.0.categories', ['optimization'])
        ->assertJsonPath('meta.total', 1)
        ->assertJsonPath('meta.loader', 'fabric')
        ->assertJsonPath('meta.game_version', '1.21.4');

    Http::assertSent(function (Request $request): bool {
        if (! str_contains($request->url(), 'api.modrinth.com/v2/search')) {
            return false;
        }
        parse_str((string) parse_url($request->url(), PHP_URL_QUERY), $query);

        return $query['query'] === 'sodium' && $query['index'] === 'downloads' && (int) $query['limit'] === 10
            && json_decode($query['facets'], true) === [['project_type:mod'], ['server_side:required', 'server_side:optional'], ['categories:fabric'], ['versions:1.21.4']]
            && str_starts_with($request->header('User-Agent')[0], 'astrelyse-panel/');
    });
});

test('search validates its inputs', function (): void {
    [$user, $server] = fabricServer();

    $this->actingAs($user)->getJson($this->link($server, '/mods/search?limit=51'))->assertUnprocessable();
    $this->actingAs($user)->getJson($this->link($server, '/mods/search?sort=bogus'))->assertUnprocessable();
    $this->actingAs($user)->getJson($this->link($server, '/mods/search?category=A%22b'))->assertUnprocessable();
});

test('the loader cannot be overridden but the game version can, and latest is resolved', function (): void {
    [$user, $server] = fabricServer();
    modrinth([
        'api.modrinth.com/v2/tag/game_version' => Http::response([
            ['version' => '1.22-snapshot', 'version_type' => 'snapshot', 'date' => '2026-03-01T00:00:00Z'],
            ['version' => '1.21.5', 'version_type' => 'release', 'date' => '2025-03-01T00:00:00Z'],
            ['version' => '1.21.4', 'version_type' => 'release', 'date' => '2024-12-01T00:00:00Z'],
        ]),
        'api.modrinth.com/v2/search*' => Http::response(['total_hits' => 0, 'hits' => []]),
    ]);

    // A loader parameter is ignored: the server runs Fabric, so it sees Fabric content.
    $this->actingAs($user)->getJson($this->link($server, '/mods/search?loader=forge&game_version=1.20.1'))->assertOk()->assertJsonPath('meta.loader', 'fabric')->assertJsonPath('meta.game_version', '1.20.1');
    Http::assertSent(fn (Request $request): bool => str_contains($request->url(), '/search') && str_contains(urldecode($request->url()), '[["project_type:mod"],["server_side:required","server_side:optional"],["categories:fabric"],["versions:1.20.1"]]'));

    $this->actingAs($user)->getJson($this->link($server, '/mods/search?game_version=latest'))->assertOk()->assertJsonPath('meta.game_version', '1.21.5');
});

test('a server whose game version is latest resolves it to the newest release', function (): void {
    [$user, $server] = $this->generateTestAccount(MODS);
    minecraft($server, 'Paper Minecraft', 'latest');
    modrinth(['api.modrinth.com/v2/tag/game_version' => Http::response([['version' => '1.21.5', 'version_type' => 'release', 'date' => '2025-03-01T00:00:00Z']])]);

    $this->actingAs($user)->getJson($this->link($server, '/mods/platform'))->assertOk()->assertJsonPath('attributes.game_version', 'latest')->assertJsonPath('attributes.resolved_game_version', '1.21.5')->assertJsonPath('attributes.install_dir', 'plugins');
});

test('project versions are filtered by the detected loader', function (): void {
    [$user, $server] = fabricServer();
    modrinth(['api.modrinth.com/v2/project/AANobbMI/version*' => Http::response([version('tFw0iWAk', overrides: ['dependencies' => [['project_id' => 'P7dR8mSH', 'version_id' => null, 'dependency_type' => 'required']]])])]);

    $this->actingAs($user)->getJson($this->link($server, '/mods/projects/AANobbMI/versions'))->assertOk()
        ->assertJsonPath('data.0.id', 'tFw0iWAk')
        ->assertJsonPath('data.0.file.filename', 'sodium-tFw0iWAk.jar')
        ->assertJsonPath('data.0.file.sha512', 'hashtFw0iWAk')
        ->assertJsonPath('data.0.dependencies.0.project_id', 'P7dR8mSH');
    Http::assertSent(fn (Request $request): bool => str_contains($request->url(), '/project/AANobbMI/version') && str_contains(urldecode($request->url()), 'loaders=["fabric"]') && str_contains(urldecode($request->url()), 'game_versions=["1.21.4"]'));

    $this->actingAs($user)->getJson($this->link($server, '/mods/projects/not-an-id/versions'))->assertUnprocessable();
});

test('install pulls the CDN file into the mods directory', function (): void {
    [$user, $server] = fabricServer();
    $fake = new FakeDaemonFile;
    modrinth(['api.modrinth.com/v2/version/tFw0iWAk' => Http::response(version('tFw0iWAk'))]);

    $this->actingAs($user)->postJson($this->link($server, '/mods/install'), ['project_id' => 'AANobbMI', 'version_id' => 'tFw0iWAk'])->assertStatus(202)
        ->assertJsonPath('object', 'mod_install')
        ->assertJsonPath('attributes.filename', 'sodium-tFw0iWAk.jar')
        ->assertJsonPath('attributes.title', 'Sodium')
        ->assertJsonPath('attributes.page_url', 'https://modrinth.com/mod/sodium')
        ->assertJsonPath('attributes.enabled', true)
        ->assertJsonPath('attributes.tracked', true);

    $fake->assertPulled('https://cdn.modrinth.com/data/AANobbMI/versions/tFw0iWAk/sodium-tFw0iWAk.jar');
    expect(pulls()[0])->toMatchArray(['root' => '/mods', 'file_name' => 'sodium-tFw0iWAk.jar']);
    $this->assertDatabaseHas('server_mod_installs', ['server_id' => $server->id, 'project_id' => 'AANobbMI', 'version_id' => 'tFw0iWAk', 'install_dir' => 'mods', 'slug' => 'sodium', 'project_type' => 'mod', 'enabled' => true]);
    Event::assertDispatched(ActivityLogged::class, fn (ActivityLogged $event): bool => $event->is('server:mods.install'));
});

test('install rejects a download host that is not the Modrinth CDN', function (string $url): void {
    [$user, $server] = fabricServer();
    $fake = new FakeDaemonFile;
    $bad = version('tFw0iWAk');
    $bad['files'][0]['url'] = $url;
    modrinth(['api.modrinth.com/v2/version/tFw0iWAk' => Http::response($bad)]);

    $this->actingAs($user)->postJson($this->link($server, '/mods/install'), ['project_id' => 'AANobbMI', 'version_id' => 'tFw0iWAk'])->assertStatus(400);
    expect($fake->callsFor('pull'))->toBe([]);
    $this->assertDatabaseMissing('server_mod_installs', ['server_id' => $server->id]);
})->with([
    'foreign host' => 'https://evil.example.com/sodium-tFw0iWAk.jar',
    'lookalike subdomain' => 'https://cdn.modrinth.com.evil.example.com/a.jar',
    'userinfo trick' => 'https://cdn.modrinth.com@evil.example.com/a.jar',
    'plain http' => 'http://cdn.modrinth.com/a.jar',
]);

test('install rejects a version of another project, an unsupported loader and unsafe file names', function (): void {
    [$user, $server] = fabricServer();
    $fake = new FakeDaemonFile;
    $traversal = version('trav0001');
    $traversal['files'][0]['filename'] = '../evil.jar';
    $notJar = version('notjar01');
    $notJar['files'][0]['filename'] = 'readme.txt';
    modrinth([
        'api.modrinth.com/v2/version/wrongprj' => Http::response(version('wrongprj', 'OTHERPRJ')),
        'api.modrinth.com/v2/version/forge001' => Http::response(version('forge001', overrides: ['loaders' => ['forge']])),
        'api.modrinth.com/v2/version/trav0001' => Http::response($traversal),
        'api.modrinth.com/v2/version/notjar01' => Http::response($notJar),
    ]);

    foreach (['wrongprj', 'forge001', 'trav0001', 'notjar01'] as $versionId) {
        $this->actingAs($user)->postJson($this->link($server, '/mods/install'), ['project_id' => 'AANobbMI', 'version_id' => $versionId])->assertStatus(400);
    }
    expect($fake->callsFor('pull'))->toBe([]);
});

test('install validates the Modrinth IDs', function (): void {
    [$user, $server] = fabricServer();

    $this->actingAs($user)->postJson($this->link($server, '/mods/install'), ['project_id' => '../x', 'version_id' => 'tFw0iWAk'])->assertUnprocessable();
    $this->actingAs($user)->postJson($this->link($server, '/mods/install'), ['project_id' => 'AANobbMI', 'version_id' => 'short'])->assertUnprocessable();
});

test('installing another version replaces the old file', function (): void {
    [$user, $server] = fabricServer();
    $fake = new FakeDaemonFile;
    ServerModInstall::factory()->create(['server_id' => $server->id, 'project_id' => 'AANobbMI', 'version_id' => 'oldver01', 'filename' => 'sodium-oldver01.jar']);
    modrinth(['api.modrinth.com/v2/version/newver01' => Http::response(version('newver01'))]);

    $this->actingAs($user)->postJson($this->link($server, '/mods/install'), ['project_id' => 'AANobbMI', 'version_id' => 'newver01'])->assertStatus(202);

    $fake->assertFilesDeleted('/mods', ['sodium-oldver01.jar']);
    expect(ServerModInstall::query()->where('server_id', $server->id)->count())->toBe(1)
        ->and(ServerModInstall::query()->where('server_id', $server->id)->first()->version_id)->toBe('newver01');
});

test('changing the version can downgrade', function (): void {
    [$user, $server] = fabricServer();
    $fake = new FakeDaemonFile;
    $install = ServerModInstall::factory()->create(['server_id' => $server->id, 'project_id' => 'AANobbMI', 'version_id' => 'newver01', 'version_number' => 'vnewver01', 'filename' => 'sodium-newver01.jar']);
    modrinth(['api.modrinth.com/v2/version/oldver01' => Http::response(version('oldver01', overrides: ['date_published' => '2020-01-01T00:00:00Z']))]);

    $this->actingAs($user)->postJson($this->link($server, "/mods/installed/$install->id/version"), ['version_id' => 'oldver01'])->assertStatus(202)
        ->assertJsonPath('attributes.version_id', 'oldver01')
        ->assertJsonPath('attributes.filename', 'sodium-oldver01.jar');

    $fake->assertPulled('https://cdn.modrinth.com/data/AANobbMI/versions/oldver01/sodium-oldver01.jar');
    $fake->assertFilesDeleted('/mods', ['sodium-newver01.jar']);
});

test('changing the version keeps a disabled mod disabled', function (): void {
    [$user, $server] = fabricServer();
    $fake = new FakeDaemonFile;
    $install = ServerModInstall::factory()->create(['server_id' => $server->id, 'project_id' => 'AANobbMI', 'version_id' => 'oldver01', 'filename' => 'sodium-oldver01.jar', 'enabled' => false]);
    modrinth(['api.modrinth.com/v2/version/newver01' => Http::response(version('newver01'))]);

    $this->actingAs($user)->postJson($this->link($server, "/mods/installed/$install->id/version"), ['version_id' => 'newver01'])->assertStatus(202)
        ->assertJsonPath('attributes.enabled', false)
        ->assertJsonPath('attributes.filename', 'sodium-newver01.jar.disabled');

    expect(pulls()[0])->toMatchArray(['file_name' => 'sodium-newver01.jar.disabled']);
    $fake->assertFilesDeleted('/mods', ['sodium-oldver01.jar.disabled']);
    expect($install->refresh()->enabled)->toBeFalse();
});

test('changing the version rejects a version of another project and other servers installs', function (): void {
    [$user, $server] = fabricServer();
    new FakeDaemonFile;
    $install = ServerModInstall::factory()->create(['server_id' => $server->id, 'project_id' => 'AANobbMI']);
    $foreign = ServerModInstall::factory()->create();
    modrinth(['api.modrinth.com/v2/version/wrongprj' => Http::response(version('wrongprj', 'OTHERPRJ'))]);

    $this->actingAs($user)->postJson($this->link($server, "/mods/installed/$install->id/version"), ['version_id' => 'wrongprj'])->assertStatus(400);
    $this->actingAs($user)->postJson($this->link($server, "/mods/installed/$foreign->id/version"), ['version_id' => 'newver01'])->assertNotFound();
});

test('remove deletes the file and the row', function (): void {
    [$user, $server] = fabricServer();
    $fake = new FakeDaemonFile;
    listing($fake, ['sodium-1.jar']);
    $install = ServerModInstall::factory()->create(['server_id' => $server->id, 'filename' => 'sodium-1.jar']);

    $this->actingAs($user)->deleteJson($this->link($server, "/mods/installed/$install->id"))->assertNoContent();

    $fake->assertFilesDeleted('/mods', ['sodium-1.jar']);
    $this->assertDatabaseMissing('server_mod_installs', ['id' => $install->id]);
    Event::assertDispatched(ActivityLogged::class, fn (ActivityLogged $event): bool => $event->is('server:mods.remove'));

    $other = ServerModInstall::factory()->create();
    $this->actingAs($user)->deleteJson($this->link($server, "/mods/installed/$other->id"))->assertNotFound();
});

test('the installed list shows presence, untracked jars, disabled state and updates', function (): void {
    [$user, $server] = fabricServer();
    $fake = new FakeDaemonFile;
    listing($fake, ['sodium-old.jar', 'lithium-1.jar.disabled', 'handmade.jar', 'notes.txt']);
    ServerModInstall::factory()->create(['server_id' => $server->id, 'title' => 'Sodium', 'slug' => 'sodium', 'project_id' => 'AANobbMI', 'version_id' => 'oldver01', 'filename' => 'sodium-old.jar', 'sha512' => 'oldhash']);
    ServerModInstall::factory()->create(['server_id' => $server->id, 'title' => 'Lithium', 'slug' => 'lithium', 'project_id' => 'gvQqBUqZ', 'version_id' => 'lith0001', 'filename' => 'lithium-1.jar', 'sha512' => 'lithhash']);
    ServerModInstall::factory()->create(['server_id' => $server->id, 'title' => 'Gone', 'project_id' => 'GONEGONE', 'filename' => 'gone.jar', 'sha512' => 'gonehash']);
    modrinth(['api.modrinth.com/v2/version_files/update' => Http::response([
        'oldhash' => version('newver01'),
        'lithhash' => version('lith0001', 'gvQqBUqZ'),
    ])]);

    $response = $this->actingAs($user)->getJson($this->link($server, '/mods/installed'))->assertOk();
    $rows = collect($response->json('data'))->keyBy('title');

    expect($rows['Sodium'])->toMatchArray(['present' => true, 'enabled' => true, 'tracked' => true, 'filename' => 'sodium-old.jar', 'update' => ['version_id' => 'newver01', 'version_number' => 'vnewver01'], 'page_url' => 'https://modrinth.com/mod/sodium'])
        ->and($rows['Lithium'])->toMatchArray(['present' => true, 'enabled' => false, 'filename' => 'lithium-1.jar.disabled', 'update' => null])
        ->and($rows['Gone'])->toMatchArray(['present' => false, 'update' => null])
        ->and($rows['handmade'])->toMatchArray(['id' => null, 'tracked' => false, 'enabled' => true, 'filename' => 'handmade.jar'])
        ->and($rows->has('notes'))->toBeFalse();

    Http::assertSent(function (Request $request): bool {
        if (! str_ends_with($request->url(), '/version_files/update')) {
            return false;
        }
        $data = $request->data();

        return $data['algorithm'] === 'sha512' && $data['loaders'] === ['fabric'] && $data['game_versions'] === ['1.21.4'] && in_array('oldhash', $data['hashes'], true) && ! in_array('gonehash', $data['hashes'], true);
    });
});

test('the installed list is empty when the mods directory does not exist', function (): void {
    [$user, $server] = fabricServer();
    $fake = new FakeDaemonFile;
    $fake->directoryMissing = true;

    $this->actingAs($user)->getJson($this->link($server, '/mods/installed'))->assertOk()->assertJsonPath('data', []);
});

test('a tracked jar can be disabled and enabled again', function (): void {
    [$user, $server] = fabricServer();
    $fake = new FakeDaemonFile;
    $install = ServerModInstall::factory()->create(['server_id' => $server->id, 'filename' => 'sodium-1.jar']);

    listing($fake, ['sodium-1.jar']);
    $this->actingAs($user)->postJson($this->link($server, '/mods/installed/toggle'), ['filename' => 'sodium-1.jar', 'enabled' => false])->assertOk()
        ->assertJsonPath('attributes.enabled', false)
        ->assertJsonPath('attributes.filename', 'sodium-1.jar.disabled')
        ->assertJsonPath('attributes.tracked', true);
    $fake->assertFilesRenamed('/mods', [['from' => 'sodium-1.jar', 'to' => 'sodium-1.jar.disabled']]);
    expect($install->refresh()->enabled)->toBeFalse();
    Event::assertDispatched(ActivityLogged::class, fn (ActivityLogged $event): bool => $event->is('server:mods.disable'));

    listing($fake, ['sodium-1.jar.disabled']);
    $this->actingAs($user)->postJson($this->link($server, '/mods/installed/toggle'), ['filename' => 'sodium-1.jar.disabled', 'enabled' => true])->assertOk()
        ->assertJsonPath('attributes.enabled', true)
        ->assertJsonPath('attributes.filename', 'sodium-1.jar');
    $fake->assertFilesRenamed('/mods', [['from' => 'sodium-1.jar.disabled', 'to' => 'sodium-1.jar']]);
    expect($install->refresh()->enabled)->toBeTrue();
});

test('an untracked jar can be toggled by file name', function (): void {
    [$user, $server] = fabricServer();
    $fake = new FakeDaemonFile;
    listing($fake, ['handmade.jar']);

    $this->actingAs($user)->postJson($this->link($server, '/mods/installed/toggle'), ['filename' => 'handmade.jar', 'enabled' => false])->assertOk()
        ->assertJsonPath('attributes.id', null)
        ->assertJsonPath('attributes.tracked', false)
        ->assertJsonPath('attributes.enabled', false)
        ->assertJsonPath('attributes.filename', 'handmade.jar.disabled');
    $fake->assertFilesRenamed('/mods', [['from' => 'handmade.jar', 'to' => 'handmade.jar.disabled']]);
});

test('toggling to the state a jar is already in renames nothing', function (): void {
    [$user, $server] = fabricServer();
    $fake = new FakeDaemonFile;
    listing($fake, ['handmade.jar']);

    $this->actingAs($user)->postJson($this->link($server, '/mods/installed/toggle'), ['filename' => 'handmade.jar', 'enabled' => true])->assertOk();
    expect($fake->callsFor('renameFiles'))->toBe([]);
});

test('a disabled jar can be deleted by file name, tracked or not', function (): void {
    [$user, $server] = fabricServer();
    $fake = new FakeDaemonFile;
    listing($fake, ['sodium-1.jar.disabled', 'handmade.jar']);
    $install = ServerModInstall::factory()->create(['server_id' => $server->id, 'filename' => 'sodium-1.jar', 'enabled' => false]);

    $this->actingAs($user)->postJson($this->link($server, '/mods/installed/delete'), ['filename' => 'sodium-1.jar.disabled'])->assertNoContent();
    $fake->assertFilesDeleted('/mods', ['sodium-1.jar.disabled']);
    $this->assertDatabaseMissing('server_mod_installs', ['id' => $install->id]);

    $this->actingAs($user)->postJson($this->link($server, '/mods/installed/delete'), ['filename' => 'handmade.jar'])->assertNoContent();
    $fake->assertFilesDeleted('/mods', ['handmade.jar']);
});

test('file names are validated and must exist in the mods directory', function (string $filename): void {
    [$user, $server] = fabricServer();
    $fake = new FakeDaemonFile;
    listing($fake, ['present.jar']);

    $this->actingAs($user)->postJson($this->link($server, '/mods/installed/toggle'), ['filename' => $filename, 'enabled' => false])->assertUnprocessable();
    $this->actingAs($user)->postJson($this->link($server, '/mods/installed/delete'), ['filename' => $filename])->assertUnprocessable();
    expect($fake->callsFor('renameFiles'))->toBe([])->and($fake->callsFor('deleteFiles'))->toBe([]);
})->with(['traversal' => '../x.jar', 'nested traversal' => 'a/../../x.jar', 'subdirectory' => 'sub/x.jar', 'not a jar' => 'config.yml', 'double disabled' => 'x.jar.disabled.disabled', 'empty' => '']);

test('a well formed file name that is not in the directory is a 404', function (): void {
    [$user, $server] = fabricServer();
    $fake = new FakeDaemonFile;
    listing($fake, ['present.jar']);

    $this->actingAs($user)->postJson($this->link($server, '/mods/installed/toggle'), ['filename' => 'missing.jar', 'enabled' => false])->assertNotFound();
    $this->actingAs($user)->postJson($this->link($server, '/mods/installed/delete'), ['filename' => 'missing.jar'])->assertNotFound();
    expect($fake->callsFor('renameFiles'))->toBe([])->and($fake->callsFor('deleteFiles'))->toBe([]);
});

test('the installed list degrades instead of failing when Wings is unreachable', function (string $failure): void {
    [$user, $server] = fabricServer();
    $fake = new FakeDaemonFile;
    if ($failure === 'connection') {
        $fake->throwable = new \Illuminate\Http\Client\ConnectionException('Connection refused');
    } else {
        $fake->response = new \GuzzleHttp\Psr7\Response(500, ['Content-Type' => 'application/json'], '{"error":"boom"}');
    }
    ServerModInstall::factory()->create(['server_id' => $server->id, 'title' => 'Sodium', 'filename' => 'sodium-1.jar', 'enabled' => false]);

    $this->actingAs($user)->getJson($this->link($server, '/mods/installed'))->assertOk()
        ->assertJsonPath('meta.disk_unavailable', true)
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.title', 'Sodium')
        ->assertJsonPath('data.0.present', null)
        ->assertJsonPath('data.0.enabled', false)
        ->assertJsonPath('data.0.tracked', true)
        ->assertJsonPath('data.0.update', null);
})->with(['unreachable' => 'connection', 'server error' => 'error']);

test('the installed list reports the disk as available when Wings answers,', function (): void {
    [$user, $server] = fabricServer();
    $fake = new FakeDaemonFile;
    listing($fake, []);

    $this->actingAs($user)->getJson($this->link($server, '/mods/installed'))->assertOk()->assertJsonPath('meta.disk_unavailable', false);
    Http::assertSent(fn (Request $request): bool => str_contains($request->url(), '/files/list-directory'));
});
