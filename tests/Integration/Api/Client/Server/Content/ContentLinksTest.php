<?php

declare(strict_types=1);

namespace Pterodactyl\Tests\Pest\Integration\Api\Client\Server\Content\ContentLinksTest;

use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Pterodactyl\Enum\Permissions;
use Pterodactyl\Tests\Integration\Api\Client\ClientApiIntegrationTestCase;
use Pterodactyl\Tests\Integration\Api\Client\Server\Content\ContentFiles;
use Pterodactyl\Tests\Integration\Api\Client\Server\Content\ContentSupport as S;
use Pterodactyl\Tests\Support\Fakes\FakeDaemonServer;

uses(ClientApiIntegrationTestCase::class);

const MODS = [Permissions::ModsRead->value, Permissions::ModsInstall->value];
const CFL = 'api.curseforge.com/v1';

beforeEach(function (): void {
    Cache::flush();
    config()->set('curseforge.api_key', 'cf-key');
});

function project(string $id, string $slug, array $overrides = []): array
{
    return ['id' => $id, 'slug' => $slug, 'title' => ucfirst($slug), 'icon_url' => null, 'project_type' => 'mod', 'client_side' => 'required', 'server_side' => 'required', ...$overrides];
}

function version(string $id, string $project, array $overrides = []): array
{
    return ['id' => $id, 'project_id' => $project, 'name' => "V $id", 'version_number' => "1.$id", 'version_type' => 'release', 'date_published' => '2025-01-01T00:00:00Z', 'game_versions' => ['1.21.1'], 'loaders' => ['fabric'], 'dependencies' => [], 'files' => [['primary' => true, 'filename' => "$project-$id.jar", 'url' => "https://cdn.modrinth.com/data/$project/versions/$id/$project-$id.jar", 'size' => 10, 'hashes' => ['sha512' => S::sha512($id), 'sha1' => S::sha1($id)]]], ...$overrides];
}

/** Answers every Modrinth project and project version call from a table. */
function modrinth(array $projects, array $versions = [], array $extra = []): void
{
    Http::fake([
        'api.modrinth.com/v2/project/*' => function (Request $request) use ($projects, $versions) {
            $path = mb_substr((string) parse_url($request->url(), PHP_URL_PATH), mb_strlen('/v2/project/'));
            $parts = explode('/', $path);
            $key = $parts[0];
            if (($parts[1] ?? null) === 'version' && isset($parts[2])) {
                $found = array_find($versions[$key] ?? [], fn (array $v): bool => $v['id'] === $parts[2] || $v['version_number'] === $parts[2]);

                return $found === null ? Http::response([], 404) : Http::response($found);
            }
            if (($parts[1] ?? null) === 'version') {
                return Http::response($versions[$key] ?? []);
            }

            return isset($projects[$key]) ? Http::response($projects[$key]) : Http::response([], 404);
        },
        ...$extra,
    ]);
}

dataset('endpoints', fn (): array => [
    'resolve' => ['postJson', '/content/resolve'],
    'prism preview' => ['postJson', '/content/import/prism/preview'],
    'prism install' => ['postJson', '/content/import/prism/install'],
]);

test('every link and import endpoint requires authentication and permission', function (string $method, string $path): void {
    [, $server] = S::server($this, MODS);
    $this->{$method}($this->link($server, $path))->assertUnauthorized();

    [$user, $server] = S::server($this, [Permissions::ControlConsole->value]);
    $this->actingAs($user)->{$method}($this->link($server, $path))->assertForbidden();
})->with('endpoints');

test('mods.read can resolve and preview but not install a Prism import', function (): void {
    [$user, $server] = S::server($this, [Permissions::ModsRead->value]);

    $this->actingAs($user)->postJson($this->link($server, '/content/import/prism/install'), ['items' => [['provider' => 'modrinth', 'project_id' => 'AANobbMI', 'version_id' => 'VERSION1']]])->assertForbidden();
});

test('resolve reads every kind of link and says whether it fits the server', function (): void {
    [$user, $server] = S::server($this, MODS);
    new ContentFiles;
    new FakeDaemonServer;
    modrinth(
        [
            'sodium' => project('AANobbMI', 'sodium'),
            'AANobbMI' => project('AANobbMI', 'sodium'),
            'clientmod' => project('CLIENTMD', 'clientmod', ['server_side' => 'unsupported']),
            'forgemod' => project('FORGEMOD', 'forgemod'), 'FORGEMOD' => project('FORGEMOD', 'forgemod'),
            'AKPLUGIN' => project('AKPLUGIN', 'someplugin', ['project_type' => 'plugin']),
            'PACKPRJ1' => project('PACKPRJ1', 'pack', ['project_type' => 'modpack']),
            'pack' => project('PACKPRJ1', 'pack', ['project_type' => 'modpack']),
        ],
        [
            'AANobbMI' => [version('VERSION1', 'AANobbMI'), version('OLDVERS1', 'AANobbMI', ['version_number' => 'mc1.21.1-0.5.8'])],
            'FORGEMOD' => [],
            'PACKPRJ1' => [version('PACKVER1', 'PACKPRJ1')],
        ],
    );
    Http::fake([
        CFL.'/mods/search*' => Http::response(['data' => [['id' => 888]]]),
        CFL.'/mods/888' => Http::response(['data' => ['id' => 888, 'name' => 'Cool World', 'slug' => 'cool-world', 'links' => ['websiteUrl' => 'https://www.curseforge.com/minecraft/worlds/cool-world']]]),
        CFL.'/mods/888/files*' => Http::response(['data' => [['id' => 30, 'fileName' => 'w.zip', 'gameVersions' => ['1.21.1'], 'fileDate' => '2025-01-01T00:00:00Z']]]),
    ]);
    $resolve = fn (string $url) => $this->actingAs($user)->postJson($this->link($server, '/content/resolve'), ['url' => $url]);

    // A mod, with the newest compatible version picked.
    $resolve('https://modrinth.com/mod/sodium')->assertOk()->assertJsonPath('object', 'content_link')
        ->assertJsonPath('attributes.kind', 'mod')->assertJsonPath('attributes.provider', 'modrinth')->assertJsonPath('attributes.project_id', 'AANobbMI')
        ->assertJsonPath('attributes.version_id', 'VERSION1')->assertJsonPath('attributes.compatible', true);

    // A link to a version by its number, as shared links use.
    $resolve('https://modrinth.com/mod/sodium/version/mc1.21.1-0.5.8')->assertOk()->assertJsonPath('attributes.version_id', 'OLDVERS1')->assertJsonPath('attributes.compatible', true);

    // A CDN link comes back as kind mod, so the real project type is looked up: this one is a plugin.
    $resolve('https://cdn.modrinth.com/data/AKPLUGIN/versions/VERSION1/p.jar')->assertOk()->assertJsonPath('attributes.kind', 'plugin')->assertJsonPath('attributes.compatible', false);

    // Client-only.
    $resolve('https://modrinth.com/mod/clientmod')->assertOk()->assertJsonPath('attributes.compatible', false)->assertJsonPath('attributes.side', 'client');

    // No version for this loader.
    $resolve('https://modrinth.com/mod/forgemod')->assertOk()->assertJsonPath('attributes.compatible', false)->assertJsonPath('attributes.reason', 'This project has no version for Fabric.');

    // A modpack.
    $resolve('https://modrinth.com/modpack/pack')->assertOk()->assertJsonPath('attributes.kind', 'modpack')->assertJsonPath('attributes.version_id', 'PACKVER1')->assertJsonPath('attributes.compatible', true);

    // A CurseForge world.
    $resolve('https://www.curseforge.com/minecraft/worlds/cool-world')->assertOk()->assertJsonPath('attributes.kind', 'world')->assertJsonPath('attributes.provider', 'curseforge')->assertJsonPath('attributes.project_id', '888')->assertJsonPath('attributes.version_id', '30')->assertJsonPath('attributes.compatible', true);

    // Not a link we read.
    $resolve('https://evil.example.com/mod/sodium')->assertStatus(422)->assertJsonPath('error', 'unsupported_link');
    $resolve('javascript:alert(1)')->assertStatus(422)->assertJsonPath('error', 'unsupported_link');
});

test('a shader or resource pack link is refused without asking anyone', function (string $url): void {
    [$user, $server] = S::server($this, MODS);
    Http::fake();

    $this->actingAs($user)->postJson($this->link($server, '/content/resolve'), ['url' => $url])->assertOk()
        ->assertJsonPath('attributes.compatible', false)
        ->assertJsonPath('attributes.reason', "Client-only content can't be installed on a server.");
    Http::assertNothingSent();
})->with(['shader' => 'https://modrinth.com/shader/complementary', 'resource pack' => 'https://modrinth.com/resourcepack/faithful', 'curseforge shader' => 'https://www.curseforge.com/minecraft/shaders/bsl']);

test('a link whose version is for another game version is incompatible with a reason', function (): void {
    [$user, $server] = S::server($this, MODS);
    modrinth(['sodium' => project('AANobbMI', 'sodium'), 'AANobbMI' => project('AANobbMI', 'sodium')], ['AANobbMI' => [version('VERSION1', 'AANobbMI', ['game_versions' => ['1.20.1']])]]);

    $this->actingAs($user)->postJson($this->link($server, '/content/resolve'), ['url' => 'https://modrinth.com/mod/sodium/version/VERSION1'])->assertOk()
        ->assertJsonPath('attributes.compatible', false)
        ->assertJsonPath('attributes.reason', 'This version is for Minecraft 1.20.1, but this server runs 1.21.1.');
});

/** @return list<array<string, mixed>> */
function prismText(): string
{
    return json_encode([
        ['name' => 'Sodium', 'url' => 'https://modrinth.com/mod/sodium'],
        ['name' => 'Lithium'],
        ['name' => 'Fuzzy Mod'],
        ['name' => 'Shady', 'url' => 'https://modrinth.com/shader/shady'],
        ['name' => 'Clienty', 'url' => 'https://modrinth.com/mod/clientmod'],
        ['name' => 'Whatever', 'filename' => 'ferritecore-fabric-1.2.3.jar'],
        ['name' => 'Unverified', 'url' => 'https://www.curseforge.com/minecraft/mc-mods/unverified'],
        ['name' => 'Nothing Here'],
    ]);
}

function searchHit(string $id, string $slug, string $title): array
{
    return ['project_id' => $id, 'slug' => $slug, 'title' => $title, 'client_side' => 'required', 'server_side' => 'required', 'versions' => ['1.21.1'], 'categories' => ['fabric']];
}

test('the Prism preview matches by link, file name and name, and only selects certain server-side matches', function (): void {
    [$user, $server] = S::server($this, MODS);
    new ContentFiles;
    new FakeDaemonServer;
    modrinth(
        [
            'sodium' => project('AANobbMI', 'sodium'), 'AANobbMI' => project('AANobbMI', 'sodium'),
            'LITHIUM1' => project('LITHIUM1', 'lithium'), 'FUZZY001' => project('FUZZY001', 'fuzzy'),
            'FERRITE1' => project('FERRITE1', 'ferritecore'),
            'clientmod' => project('CLIENTMD', 'clientmod', ['server_side' => 'unsupported']),
            'CLIENTMD' => project('CLIENTMD', 'clientmod', ['server_side' => 'unsupported']),
        ],
        ['AANobbMI' => [version('VERSION1', 'AANobbMI')], 'LITHIUM1' => [version('LITHVER1', 'LITHIUM1')], 'FUZZY001' => [version('FUZZVER1', 'FUZZY001')], 'FERRITE1' => [version('FERRVER1', 'FERRITE1')]],
        ['api.modrinth.com/v2/search*' => function (Request $request) {
            parse_str((string) parse_url($request->url(), PHP_URL_QUERY), $q);

            return Http::response(['total_hits' => 1, 'hits' => match ($q['query']) {
                'Lithium' => [searchHit('LITHIUM1', 'lithium', 'Lithium')],
                'Fuzzy Mod' => [searchHit('FUZZY001', 'fuzzy', 'Totally Different')],
                'ferritecore' => [searchHit('FERRITE1', 'ferritecore', 'FerriteCore')],
                default => [],
            }]);
        }],
    );
    Http::fake([
        CFL.'/mods/search*' => Http::response(['data' => [['id' => 555]]]),
        CFL.'/mods/555' => Http::response(['data' => ['id' => 555, 'name' => 'Unverified', 'slug' => 'unverified', 'allowModDistribution' => true]]),
        CFL.'/mods/555/files*' => Http::response(['data' => [['id' => 9, 'modId' => 555, 'fileName' => 'u.jar', 'displayName' => 'U', 'releaseType' => 1, 'fileDate' => '2025-01-01T00:00:00Z', 'downloadUrl' => 'https://edge.forgecdn.net/files/1/9/u.jar', 'gameVersions' => ['1.21.1', 'Fabric'], 'hashes' => [['value' => S::sha1('u'), 'algo' => 1]]]]]),
        'api.modrinth.com/v2/version_files' => Http::response([]),
        'api.modrinth.com/v2/projects*' => Http::response([]),
    ]);

    $items = collect($this->actingAs($user)->postJson($this->link($server, '/content/import/prism/preview'), ['text' => prismText()])->assertOk()->assertJsonPath('object', 'list')->json('data'))->keyBy('name');

    expect($items['Sodium'])->toMatchArray(['match' => 'url', 'side' => 'both', 'compatible' => true, 'selected' => true])
        ->and($items['Sodium']['matched'])->toMatchArray(['provider' => 'modrinth', 'project_id' => 'AANobbMI', 'version_id' => 'VERSION1', 'title' => 'Sodium'])
        ->and($items['Lithium'])->toMatchArray(['match' => 'name', 'compatible' => true, 'selected' => true])
        ->and($items['Fuzzy Mod'])->toMatchArray(['match' => 'name', 'compatible' => true, 'selected' => false])
        ->and($items['Fuzzy Mod']['reason'])->toContain('Closest match')
        ->and($items['Shady'])->toMatchArray(['compatible' => false, 'selected' => false, 'side' => 'client'])
        ->and($items['Clienty'])->toMatchArray(['compatible' => false, 'selected' => false, 'side' => 'client'])
        ->and($items['Whatever'])->toMatchArray(['match' => 'filename', 'selected' => true])
        ->and($items['Unverified'])->toMatchArray(['match' => 'url', 'side' => 'unknown', 'compatible' => true, 'selected' => false])
        ->and($items['Nothing Here'])->toMatchArray(['match' => 'none', 'matched' => null, 'compatible' => false, 'selected' => false]);
});

test('the Prism preview refuses text over 256 KB', function (): void {
    [$user, $server] = S::server($this, MODS);

    $this->actingAs($user)->postJson($this->link($server, '/content/import/prism/preview'), ['text' => str_repeat('a', 262145)])->assertUnprocessable();
});

test('the Prism install re-validates every item and installs them as one plan', function (): void {
    [$user, $server] = S::server($this, MODS);
    $files = new ContentFiles;
    new FakeDaemonServer;
    modrinth(
        ['AANobbMI' => project('AANobbMI', 'sodium'), 'LITHIUM1' => project('LITHIUM1', 'lithium')],
        [],
        [
            'api.modrinth.com/v2/version/VERSION1' => Http::response(version('VERSION1', 'AANobbMI')),
            'api.modrinth.com/v2/version/LITHVER1' => Http::response(version('LITHVER1', 'LITHIUM1')),
        ],
    );

    $this->actingAs($user)->postJson($this->link($server, '/content/import/prism/install'), ['items' => [
        ['provider' => 'modrinth', 'project_id' => 'AANobbMI', 'version_id' => 'VERSION1'],
        ['provider' => 'modrinth', 'project_id' => 'LITHIUM1', 'version_id' => 'LITHVER1'],
    ]])->assertStatus(202)->assertJsonPath('kind', 'mods')->assertJsonPath('summary.count', 2);

    $plan = S::plan($files);
    expect($plan['operation'])->toBe('mods')
        ->and(array_column($plan['files'], 'path'))->toBe(['mods/AANobbMI-VERSION1.jar', 'mods/LITHIUM1-LITHVER1.jar'])
        ->and($plan['files'][0])->toMatchArray(['url' => 'https://cdn.modrinth.com/data/AANobbMI/versions/VERSION1/AANobbMI-VERSION1.jar', 'sha512' => S::sha512('VERSION1')])
        ->and($plan['wipe']['enabled'])->toBeFalse()
        ->and($plan['archives'])->toBe([]);
    expect(Http::recorded(fn (Request $request): bool => str_ends_with($request->url(), '/files/pull')))->toHaveCount(0);
});

test('a forged client-only item is refused and nothing is installed', function (): void {
    [$user, $server] = S::server($this, MODS);
    $files = new ContentFiles;
    new FakeDaemonServer;
    modrinth(
        ['AANobbMI' => project('AANobbMI', 'sodium'), 'CLIENTMD' => project('CLIENTMD', 'clientmod', ['server_side' => 'unsupported'])],
        [],
        [
            'api.modrinth.com/v2/version/VERSION1' => Http::response(version('VERSION1', 'AANobbMI')),
            'api.modrinth.com/v2/version/CLNTVER1' => Http::response(version('CLNTVER1', 'CLIENTMD')),
        ],
    );

    $this->actingAs($user)->postJson($this->link($server, '/content/import/prism/install'), ['items' => [
        ['provider' => 'modrinth', 'project_id' => 'AANobbMI', 'version_id' => 'VERSION1'],
        ['provider' => 'modrinth', 'project_id' => 'CLIENTMD', 'version_id' => 'CLNTVER1'],
    ]])->assertStatus(422)
        ->assertJsonPath('error', 'client_only')
        ->assertJsonPath('items.0.project_id', 'CLIENTMD')
        ->assertJsonPath('items.0.error', 'client_only');
    expect($files->callsFor('putContent'))->toBe([]);
});

test('the Prism install refuses an item for another loader and one whose version belongs to another project', function (): void {
    [$user, $server] = S::server($this, MODS);
    $files = new ContentFiles;
    new FakeDaemonServer;
    modrinth(
        ['AANobbMI' => project('AANobbMI', 'sodium')],
        [],
        [
            'api.modrinth.com/v2/version/FORGVER1' => Http::response(version('FORGVER1', 'AANobbMI', ['loaders' => ['forge']])),
            'api.modrinth.com/v2/version/OTHRVER1' => Http::response(version('OTHRVER1', 'OTHERPRJ')),
        ],
    );

    $this->actingAs($user)->postJson($this->link($server, '/content/import/prism/install'), ['items' => [['provider' => 'modrinth', 'project_id' => 'AANobbMI', 'version_id' => 'FORGVER1']]])->assertStatus(422)->assertJsonPath('error', 'incompatible');
    $this->actingAs($user)->postJson($this->link($server, '/content/import/prism/install'), ['items' => [['provider' => 'modrinth', 'project_id' => 'AANobbMI', 'version_id' => 'OTHRVER1']]])->assertStatus(422)->assertJsonPath('error', 'wrong_project');
    $this->actingAs($user)->postJson($this->link($server, '/content/import/prism/install'), ['items' => []])->assertUnprocessable();
    expect($files->callsFor('putContent'))->toBe([]);
});
