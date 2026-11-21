<?php

declare(strict_types=1);

namespace Pterodactyl\Tests\Pest\Integration\Api\Client\Server\Content\ContentModpackTest;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Pterodactyl\Enum\Permissions;
use Pterodactyl\Models\InstallOperation;
use Pterodactyl\Models\Server;
use Pterodactyl\Tests\Integration\Api\Client\ClientApiIntegrationTestCase;
use Pterodactyl\Tests\Integration\Api\Client\Server\Content\ContentFiles;
use Pterodactyl\Tests\Integration\Api\Client\Server\Content\ContentSupport as S;
use Pterodactyl\Tests\Support\Fakes\FakeDaemonServer;

uses(ClientApiIntegrationTestCase::class);

const MANAGE = [Permissions::SoftwareRead->value, Permissions::SoftwareManage->value, Permissions::ModsRead->value];
const CF = 'api.curseforge.com/v1';
const MR_PACK = 'https://cdn.modrinth.com/data/PACKPRJ1/versions/VERSION1/pack-1.mrpack';

beforeEach(function (): void {
    Cache::flush();
    config()->set('curseforge.api_key', 'cf-key');
});

/** @return array<string, mixed> */
function index(array $overrides = []): array
{
    return [
        'formatVersion' => 1,
        'game' => 'minecraft',
        'versionId' => '1.0.0',
        'name' => 'Pack',
        'files' => [
            ['path' => 'mods/lithium.jar', 'hashes' => ['sha1' => S::sha1('lithium'), 'sha512' => S::sha512('lithium')], 'env' => ['client' => 'required', 'server' => 'required'], 'downloads' => ['https://cdn.modrinth.com/data/LITHPROJ/versions/LITHVERS/lithium.jar'], 'fileSize' => 100],
            ['path' => 'mods/sodium.jar', 'hashes' => ['sha1' => S::sha1('sodium'), 'sha512' => S::sha512('sodium')], 'env' => ['client' => 'required', 'server' => 'unsupported'], 'downloads' => ['https://cdn.modrinth.com/data/SODIPROJ/versions/SODIVERS/sodium.jar'], 'fileSize' => 200],
            ['path' => 'config/extra.toml', 'hashes' => ['sha1' => S::sha1('extra')], 'env' => ['client' => 'optional', 'server' => 'optional'], 'downloads' => ['https://cdn.modrinth.com/data/X/versions/Y/extra.toml'], 'fileSize' => 5],
        ],
        'dependencies' => ['minecraft' => '1.21.1', 'fabric-loader' => '0.16.9'],
        ...$overrides,
    ];
}

function mrpack(array $index): string
{
    return S::zip(['modrinth.index.json' => json_encode($index), 'overrides/config/a.txt' => 'a', 'server-overrides/config/b.txt' => 'b']);
}

function modrinthPack(string $zip, array $sideStubs = []): void
{
    Http::fake([
        'api.modrinth.com/v2/project/PACKPRJ1' => Http::response(['id' => 'PACKPRJ1', 'slug' => 'pack', 'title' => 'Pack', 'icon_url' => 'https://cdn.modrinth.com/icon.png', 'client_side' => 'required', 'server_side' => 'optional']),
        'api.modrinth.com/v2/version/VERSION1' => Http::response(['id' => 'VERSION1', 'project_id' => 'PACKPRJ1', 'name' => 'Pack 1', 'version_number' => '1.0.0', 'version_type' => 'release', 'game_versions' => ['1.21.1'], 'loaders' => ['fabric'], 'dependencies' => [], 'files' => [['primary' => true, 'filename' => 'pack-1.mrpack', 'url' => MR_PACK, 'size' => mb_strlen($zip, '8bit'), 'hashes' => ['sha1' => S::sha1('mrpack'), 'sha512' => S::sha512('mrpack')]]]]),
        'cdn.modrinth.com/data/PACKPRJ1/*' => Http::response($zip, 200, ['Content-Length' => (string) mb_strlen($zip, '8bit')]),
        ...$sideStubs,
    ]);
}

function fixtures(): array
{
    $files = new ContentFiles;
    $files->texts['/server.properties'] = "level-name=world\n";
    $files->tree['/'] = [['world', true], ['server.properties', false]];
    new FakeDaemonServer;

    return [$files];
}

dataset('endpoints', fn (): array => [
    'search' => ['getJson', '/content/modpacks/search'],
    'versions' => ['getJson', '/content/modpacks/modrinth/PACKPRJ1/versions'],
    'preview' => ['postJson', '/content/modpacks/preview'],
    'install' => ['postJson', '/content/modpacks/install'],
    'import local' => ['postJson', '/content/modpacks/import-local'],
]);

test('every modpack endpoint requires authentication and permission', function (string $method, string $path): void {
    [, $server] = S::server($this, MANAGE);
    $this->{$method}($this->link($server, $path))->assertUnauthorized();

    [$user, $server] = S::server($this, [Permissions::ControlConsole->value]);
    $this->actingAs($user)->{$method}($this->link($server, $path))->assertForbidden();
})->with('endpoints');

test('software.read can browse and preview but not install or import', function (): void {
    [$user, $server] = S::server($this, [Permissions::SoftwareRead->value]);

    $this->actingAs($user)->postJson($this->link($server, '/content/modpacks/install'), ['provider' => 'modrinth', 'project_id' => 'PACKPRJ1', 'version_id' => 'VERSION1'])->assertForbidden();
    $this->actingAs($user)->postJson($this->link($server, '/content/modpacks/import-local'), ['path' => '/.astrelyse/uploads/a.mrpack'])->assertForbidden();
    $this->actingAs($user)->postJson($this->link($server, '/content/worlds/install'), ['project_id' => '1', 'file_id' => '2'])->assertForbidden();
    $this->actingAs($user)->postJson($this->link($server, '/content/worlds/import-local'), ['path' => '/.astrelyse/uploads/a.zip'])->assertForbidden();
});

test('modpack search rows carry the loader and Minecraft version and exclude client-only packs', function (): void {
    [$user, $server] = S::server($this, MANAGE);
    Http::fake(['api.modrinth.com/v2/search*' => Http::response(['total_hits' => 1, 'hits' => [['project_id' => 'PACKPRJ1', 'slug' => 'pack', 'title' => 'Pack', 'client_side' => 'required', 'server_side' => 'optional', 'versions' => ['1.20.1', '1.21.1'], 'categories' => ['fabric', 'adventure']]]])]);

    $this->actingAs($user)->getJson($this->link($server, '/content/modpacks/search?query=pack'))->assertOk()
        ->assertJsonPath('data.0.loader', 'fabric')
        ->assertJsonPath('data.0.minecraft', '1.21.1')
        ->assertJsonPath('data.0.provider', 'modrinth');
    Http::assertSent(fn ($request): bool => str_contains(urldecode($request->url()), '["project_type:modpack"],["server_side:required","server_side:optional"]') && ! str_contains($request->url(), 'categories%3A'));
});

test('modpack versions carry the loader, Minecraft version and file size', function (): void {
    [$user, $server] = S::server($this, MANAGE);
    modrinthPack('zip');
    Http::fake(['api.modrinth.com/v2/project/PACKPRJ1/version*' => Http::response([['id' => 'VERSION1', 'project_id' => 'PACKPRJ1', 'name' => 'Pack 1', 'version_number' => '1.0.0', 'version_type' => 'release', 'game_versions' => ['1.21.1'], 'loaders' => ['fabric'], 'dependencies' => [], 'files' => [['primary' => true, 'filename' => 'pack-1.mrpack', 'url' => MR_PACK, 'size' => 4242, 'hashes' => ['sha1' => S::sha1('x')]]]]])]);

    $this->actingAs($user)->getJson($this->link($server, '/content/modpacks/modrinth/PACKPRJ1/versions'))->assertOk()
        ->assertJsonPath('data.0.loader', 'fabric')
        ->assertJsonPath('data.0.minecraft', '1.21.1')
        ->assertJsonPath('data.0.file.size', 4242);
});

test('a modpack preview counts server files and skipped client files without installing anything', function (): void {
    [$user, $server] = S::server($this, MANAGE);
    [$files] = fixtures();
    $zip = mrpack(index());
    modrinthPack($zip);

    $this->actingAs($user)->postJson($this->link($server, '/content/modpacks/preview'), ['provider' => 'modrinth', 'project_id' => 'PACKPRJ1', 'version_id' => 'VERSION1'])->assertOk()
        ->assertJsonPath('object', 'modpack_preview')
        ->assertJsonPath('attributes.software', ['type' => 'fabric', 'minecraft' => '1.21.1', 'loader' => '0.16.9'])
        ->assertJsonPath('attributes.files', ['server' => 2, 'skipped_client' => 1, 'unverified' => 0])
        ->assertJsonPath('attributes.size_bytes', 105 + mb_strlen($zip, '8bit'));
    expect($files->callsFor('putContent'))->toBe([])
        ->and(InstallOperation::query()->count())->toBe(0);
});

test('installing a Modrinth modpack writes a plan with the server files and overrides, then records it on success', function (): void {
    [$user, $server] = S::server($this, MANAGE);
    [$files] = fixtures();
    modrinthPack(mrpack(index()), [
        'api.modrinth.com/v2/version_files' => Http::response([S::sha1('lithium') => ['id' => 'LITHVERS', 'project_id' => 'LITHPROJ', 'version_number' => '0.12.0']]),
        'api.modrinth.com/v2/projects*' => Http::response([['id' => 'LITHPROJ', 'slug' => 'lithium', 'title' => 'Lithium', 'icon_url' => null]]),
    ]);

    $operation = $this->actingAs($user)->postJson($this->link($server, '/content/modpacks/install'), ['provider' => 'modrinth', 'project_id' => 'PACKPRJ1', 'version_id' => 'VERSION1', 'wipe' => ['enabled' => true, 'keep_worlds' => true]])
        ->assertStatus(202)
        ->assertJsonPath('kind', 'modpack')
        ->assertJsonPath('summary.title', 'Pack')
        ->json();

    $plan = S::plan($files);
    expect($plan['operation'])->toBe('modpack')
        ->and($plan['software'])->toBe(['type' => 'fabric', 'minecraft' => '1.21.1', 'loader' => '0.16.9'])
        ->and($plan['wipe']['enabled'])->toBeTrue()
        ->and($plan['wipe']['keep'])->toContain('world')
        ->and(array_column($plan['files'], 'path'))->toBe(['mods/lithium.jar', 'config/extra.toml'])
        ->and($plan['files'][0])->toMatchArray(['url' => 'https://cdn.modrinth.com/data/LITHPROJ/versions/LITHVERS/lithium.jar', 'sha1' => S::sha1('lithium'), 'sha512' => S::sha512('lithium'), 'size' => 100])
        ->and($plan['archives'])->toBe([
            ['url' => MR_PACK, 'local' => null, 'sha1' => S::sha1('mrpack'), 'strip' => 'overrides/', 'into' => '', 'only' => 'overrides/'],
            ['url' => MR_PACK, 'local' => null, 'sha1' => S::sha1('mrpack'), 'strip' => 'server-overrides/', 'into' => '', 'only' => 'server-overrides/'],
        ]);
    expect(S::variable($server, 'SERVER_TYPE'))->toBe('fabric')->and(S::variable($server, 'LOADER_VERSION'))->toBe('0.16.9');

    // Nothing is recorded while the install runs.
    expect($server->modpack()->exists())->toBeFalse();

    InstallOperation::query()->whereKey($operation['id'])->update(['status' => InstallOperation::SUCCEEDED]);
    Server::query()->whereKey($server->id)->update(['status' => null]);
    Server::query()->whereKey($server->id)->update(['status' => null]);
    $this->actingAs($user)->getJson($this->link($server, '/mods/installed'))->assertOk()
        ->assertJsonPath('data.0.title', 'Lithium')
        ->assertJsonPath('data.0.from_modpack', true);

    $this->assertDatabaseHas('server_modpacks', ['server_id' => $server->id, 'provider' => 'modrinth', 'project_id' => 'PACKPRJ1', 'version_id' => 'VERSION1', 'title' => 'Pack', 'version_number' => '1.0.0']);
    $this->assertDatabaseHas('server_mod_installs', ['server_id' => $server->id, 'project_id' => 'LITHPROJ', 'version_id' => 'LITHVERS', 'filename' => 'lithium.jar', 'from_modpack' => true]);
    $this->assertDatabaseMissing('server_content_pending', ['server_id' => $server->id]);
});

test('a failed modpack install records nothing', function (): void {
    [$user, $server] = S::server($this, MANAGE);
    fixtures();
    modrinthPack(mrpack(index()), ['api.modrinth.com/v2/version_files' => Http::response([]), 'api.modrinth.com/v2/projects*' => Http::response([])]);

    $operation = $this->actingAs($user)->postJson($this->link($server, '/content/modpacks/install'), ['provider' => 'modrinth', 'project_id' => 'PACKPRJ1', 'version_id' => 'VERSION1'])->assertStatus(202)->json();
    InstallOperation::query()->whereKey($operation['id'])->update(['status' => InstallOperation::FAILED]);
    Server::query()->whereKey($server->id)->update(['status' => null]);
    Server::query()->whereKey($server->id)->update(['status' => null]);

    $this->actingAs($user)->postJson($this->link($server, '/content/resolve'), ['url' => 'https://modrinth.com/shader/x'])->assertOk();
    $this->assertDatabaseMissing('server_modpacks', ['server_id' => $server->id]);
    $this->assertDatabaseMissing('server_content_pending', ['server_id' => $server->id]);
});

test('an mrpack over the size cap is refused and nothing is left behind', function (): void {
    [$user, $server] = S::server($this, MANAGE);
    fixtures();
    config()->set('content.max_archive_bytes', 100);
    $zip = mrpack(index());
    expect(mb_strlen($zip, '8bit'))->toBeGreaterThan(100);
    modrinthPack($zip);

    $before = glob(sys_get_temp_dir().'/astrelyse-pack-*') ?: [];
    $this->actingAs($user)->postJson($this->link($server, '/content/modpacks/preview'), ['provider' => 'modrinth', 'project_id' => 'PACKPRJ1', 'version_id' => 'VERSION1'])
        ->assertStatus(422)->assertJsonPath('error', 'too_large');
    expect(glob(sys_get_temp_dir().'/astrelyse-pack-*') ?: [])->toBe($before);
});

test('the downloaded mrpack is deleted after its index is read', function (): void {
    [$user, $server] = S::server($this, MANAGE);
    fixtures();
    modrinthPack(mrpack(index()));

    $before = glob(sys_get_temp_dir().'/astrelyse-pack-*') ?: [];
    $this->actingAs($user)->postJson($this->link($server, '/content/modpacks/preview'), ['provider' => 'modrinth', 'project_id' => 'PACKPRJ1', 'version_id' => 'VERSION1'])->assertOk();
    expect(glob(sys_get_temp_dir().'/astrelyse-pack-*') ?: [])->toBe($before);
});

test('an mrpack that downloads from a foreign host is refused', function (): void {
    [$user, $server] = S::server($this, MANAGE);
    fixtures();
    $bad = index();
    $bad['files'][0]['downloads'] = ['https://evil.example.com/lithium.jar'];
    modrinthPack(mrpack($bad));

    $this->actingAs($user)->postJson($this->link($server, '/content/modpacks/preview'), ['provider' => 'modrinth', 'project_id' => 'PACKPRJ1', 'version_id' => 'VERSION1'])
        ->assertStatus(422)->assertJsonPath('error', 'foreign_host')->assertJsonPath('host', 'evil.example.com');
});

test('an mrpack file path that escapes the server is refused', function (): void {
    [$user, $server] = S::server($this, MANAGE);
    fixtures();
    $bad = index();
    $bad['files'][0]['path'] = '../outside.jar';
    modrinthPack(mrpack($bad));

    $this->actingAs($user)->postJson($this->link($server, '/content/modpacks/preview'), ['provider' => 'modrinth', 'project_id' => 'PACKPRJ1', 'version_id' => 'VERSION1'])->assertStatus(422)->assertJsonPath('error', 'invalid_pack');
});

test('a client-only Modrinth modpack is refused', function (): void {
    [$user, $server] = S::server($this, MANAGE);
    fixtures();
    Http::fake(['api.modrinth.com/v2/project/PACKPRJ1' => Http::response(['id' => 'PACKPRJ1', 'title' => 'Pack', 'client_side' => 'required', 'server_side' => 'unsupported'])]);

    $this->actingAs($user)->postJson($this->link($server, '/content/modpacks/preview'), ['provider' => 'modrinth', 'project_id' => 'PACKPRJ1', 'version_id' => 'VERSION1'])->assertStatus(422)->assertJsonPath('error', 'client_only');
});

test('a CurseForge modpack with a server pack installs that one archive with its top folder stripped', function (): void {
    [$user, $server] = S::server($this, MANAGE);
    [$files] = fixtures();
    $zip = S::zip(['Pack-1.0/mods/a.jar' => 'a', 'Pack-1.0/mods/b.jar' => 'b', 'Pack-1.0/config/x.toml' => 'x']);
    Http::fake([
        CF.'/mods/777' => Http::response(['data' => ['id' => 777, 'name' => 'CF Pack', 'slug' => 'cf-pack', 'links' => ['websiteUrl' => 'https://www.curseforge.com/minecraft/modpacks/cf-pack'], 'logo' => ['thumbnailUrl' => 'https://media.forgecdn.net/l.png']]]),
        CF.'/mods/777/files/10' => Http::response(['data' => ['id' => 10, 'modId' => 777, 'displayName' => 'Pack 1.0', 'fileName' => 'pack.zip', 'serverPackFileId' => 11, 'gameVersions' => ['1.20.1', 'Forge']]]),
        CF.'/mods/777/files/11' => Http::response(['data' => ['id' => 11, 'modId' => 777, 'fileName' => 'server.zip', 'downloadUrl' => 'https://edge.forgecdn.net/files/1/11/server.zip', 'fileLength' => mb_strlen($zip, '8bit'), 'gameVersions' => ['1.20.1', 'Forge'], 'hashes' => [['value' => S::sha1('server'), 'algo' => 1]]]]),
        'edge.forgecdn.net/*' => S::cdn($zip),
    ]);

    $this->actingAs($user)->postJson($this->link($server, '/content/modpacks/preview'), ['provider' => 'curseforge', 'project_id' => '777', 'version_id' => '10'])->assertOk()
        ->assertJsonPath('attributes.software', ['type' => 'forge', 'minecraft' => '1.20.1', 'loader' => null])
        ->assertJsonPath('attributes.files.server', 2);

    $this->actingAs($user)->postJson($this->link($server, '/content/modpacks/install'), ['provider' => 'curseforge', 'project_id' => '777', 'version_id' => '10'])->assertStatus(202);

    $plan = S::plan($files);
    expect($plan['files'])->toBe([])
        ->and($plan['archives'])->toBe([['url' => 'https://edge.forgecdn.net/files/1/11/server.zip', 'local' => null, 'sha1' => S::sha1('server'), 'strip' => 'Pack-1.0/', 'into' => '', 'only' => 'Pack-1.0/']])
        ->and($plan['software']['type'])->toBe('forge');
});

test('a CurseForge modpack without a server pack is resolved from its manifest with the Modrinth side check', function (): void {
    [$user, $server] = S::server($this, MANAGE);
    [$files] = fixtures();
    $manifest = ['minecraft' => ['version' => '1.20.1', 'modLoaders' => [['id' => 'forge-47.2.0', 'primary' => true]]], 'overrides' => 'overrides', 'files' => [
        ['projectID' => 1, 'fileID' => 101, 'required' => true],
        ['projectID' => 2, 'fileID' => 102, 'required' => true],
        ['projectID' => 3, 'fileID' => 103, 'required' => true],
        ['projectID' => 4, 'fileID' => 104, 'required' => true],
        ['projectID' => 5, 'fileID' => 105, 'required' => true],
    ]];
    $zip = S::zip(['manifest.json' => json_encode($manifest), 'overrides/config/a.txt' => 'a']);
    $file = fn (int $id, ?string $url = 'default'): array => ['id' => $id, 'modId' => $id - 100, 'fileName' => "m$id.jar", 'displayName' => "M $id", 'fileLength' => 10, 'downloadUrl' => $url === 'default' ? "https://edge.forgecdn.net/files/1/$id/m$id.jar" : $url, 'hashes' => [['value' => S::sha1("m$id"), 'algo' => 1]]];
    Http::fake([
        CF.'/mods/777' => Http::response(['data' => ['id' => 777, 'name' => 'CF Pack', 'slug' => 'cf-pack']]),
        CF.'/mods/777/files/20' => Http::response(['data' => ['id' => 20, 'modId' => 777, 'displayName' => 'Pack 2', 'fileName' => 'pack.zip', 'downloadUrl' => 'https://edge.forgecdn.net/files/1/20/pack.zip', 'fileLength' => mb_strlen($zip, '8bit'), 'hashes' => [['value' => S::sha1('pack'), 'algo' => 1]], 'gameVersions' => ['1.20.1', 'Forge']]]),
        CF.'/mods/files' => Http::response(['data' => [$file(101), $file(102), $file(103), $file(104, null), $file(105)]]),
        CF.'/mods' => Http::response(['data' => [
            ['id' => 1, 'classId' => 6, 'name' => 'Both', 'slug' => 'both'],
            ['id' => 2, 'classId' => 6, 'name' => 'Client', 'slug' => 'client'],
            ['id' => 3, 'classId' => 6, 'name' => 'Unknown', 'slug' => 'unknown'],
            ['id' => 4, 'classId' => 6, 'name' => 'Hidden', 'slug' => 'hidden'],
            ['id' => 5, 'classId' => 12, 'name' => 'Textures', 'slug' => 'textures'],
        ]]),
        'api.modrinth.com/v2/version_files' => Http::response([S::sha1('m101') => ['id' => 'V1000001', 'project_id' => 'P1000001'], S::sha1('m102') => ['id' => 'V2000002', 'project_id' => 'P2000002']]),
        'api.modrinth.com/v2/projects*' => Http::response([['id' => 'P1000001', 'client_side' => 'required', 'server_side' => 'optional'], ['id' => 'P2000002', 'client_side' => 'required', 'server_side' => 'unsupported']]),
        'edge.forgecdn.net/files/1/20/*' => S::cdn($zip),
    ]);

    $preview = $this->actingAs($user)->postJson($this->link($server, '/content/modpacks/preview'), ['provider' => 'curseforge', 'project_id' => '777', 'version_id' => '20'])->assertOk();
    $preview->assertJsonPath('attributes.software', ['type' => 'forge', 'minecraft' => '1.20.1', 'loader' => '47.2.0'])
        ->assertJsonPath('attributes.files', ['server' => 2, 'skipped_client' => 2, 'unverified' => 1]);
    expect(implode(' ', $preview->json('attributes.warnings')))->toContain('m104.jar')->toContain('1 mods could not be checked');

    $this->actingAs($user)->postJson($this->link($server, '/content/modpacks/install'), ['provider' => 'curseforge', 'project_id' => '777', 'version_id' => '20'])->assertStatus(202);

    $plan = S::plan($files);
    expect(array_column($plan['files'], 'path'))->toBe(['mods/m101.jar', 'mods/m103.jar'])
        ->and($plan['files'][0]['sha1'])->toBe(S::sha1('m101'))
        ->and($plan['archives'])->toBe([['url' => 'https://edge.forgecdn.net/files/1/20/pack.zip', 'local' => null, 'sha1' => S::sha1('pack'), 'strip' => 'overrides/', 'into' => '', 'only' => 'overrides/']]);
});

test('importing an uploaded mrpack stages it, reads the index and builds a plan with a local archive', function (): void {
    [$user, $server] = S::server($this, MANAGE);
    [$files] = fixtures();
    $files->tree['/.astrelyse/uploads'] = [['pack.mrpack', false]];
    $files->tree['/.astrelyse/import/{id}'] = [['pack.zip', false], ['modrinth.index.json', false], ['overrides', true]];
    $files->texts['/.astrelyse/import/{id}/modrinth.index.json'] = json_encode(index());
    Http::fake(['api.modrinth.com/v2/version_files' => Http::response([]), 'api.modrinth.com/v2/projects*' => Http::response([])]);

    $this->actingAs($user)->postJson($this->link($server, '/content/modpacks/import-local'), ['path' => '/.astrelyse/uploads/pack.mrpack'])->assertStatus(202);

    $files->assertFileDecompressed();
    $files->assertFilesRenamed('/');
    $plan = S::plan($files);
    expect($plan['archives'])->toHaveCount(1)
        ->and($plan['archives'][0]['url'])->toBeNull()
        ->and($plan['archives'][0]['local'])->toMatch('#^\.astrelyse/import/[0-9a-f\-]{36}/pack\.zip$#')
        ->and($plan['archives'][0]['only'])->toBe('overrides/')
        ->and(array_column($plan['files'], 'path'))->toBe(['mods/lithium.jar', 'config/extra.toml']);
    $files->assertFilesDeleted();
});

test('import-local refuses paths outside the upload folder and files that are not modpacks', function (string $path): void {
    [$user, $server] = S::server($this, MANAGE);
    [$files] = fixtures();

    $this->actingAs($user)->postJson($this->link($server, '/content/modpacks/import-local'), ['path' => $path])->assertStatus(422);
    expect($files->callsFor('renameFiles'))->toBe([]);
})->with([
    'outside uploads' => '/world/pack.mrpack',
    'traversal' => '/.astrelyse/uploads/../../pack.mrpack',
    'nested' => '/.astrelyse/uploads/sub/pack.mrpack',
    'wrong extension' => '/.astrelyse/uploads/pack.jar',
]);

test('a zip that is not a modpack is put back where it was', function (): void {
    [$user, $server] = S::server($this, MANAGE);
    [$files] = fixtures();
    $files->tree['/.astrelyse/uploads'] = [['x.zip', false]];
    $files->tree['/.astrelyse/import/{id}'] = [['pack.zip', false], ['readme.txt', false]];

    $this->actingAs($user)->postJson($this->link($server, '/content/modpacks/import-local'), ['path' => '/.astrelyse/uploads/x.zip'])->assertStatus(422)->assertJsonPath('error', 'not_a_modpack');

    $renames = array_map(fn (array $call): mixed => $call['files'], $files->callsFor('renameFiles'));
    expect($renames)->toHaveCount(2)
        ->and($renames[1][0]['to'])->toBe('.astrelyse/uploads/x.zip');
    expect($files->callsFor('putContent'))->toBe([]);
});

test('a server not on the Astrelyse egg gets a 409', function (): void {
    [$user, $server] = $this->generateTestAccount(MANAGE);
    $server->egg->tags()->syncWithoutDetaching([\Pterodactyl\Models\Tag::query()->where('slug', 'minecraft')->value('id') ?? \Pterodactyl\Models\Tag::factory()->predefined('minecraft')->create()->id]);
    $server->unsetRelation('egg');

    $this->actingAs($user)->postJson($this->link($server, '/content/modpacks/install'), ['provider' => 'modrinth', 'project_id' => 'PACKPRJ1', 'version_id' => 'VERSION1'])->assertStatus(409)->assertJsonPath('error', 'egg_not_managed');

    [$other, $plain] = $this->generateTestAccount(MANAGE);
    $plain->egg->tags()->detach();
    $plain->unsetRelation('egg');
    $this->actingAs($other)->getJson($this->link($plain, '/content/modpacks/search'))->assertStatus(409)->assertJsonPath('error', 'content_unsupported');
});
