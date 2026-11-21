<?php

declare(strict_types=1);

namespace Pterodactyl\Tests\Pest\Unit\Services\Servers\Software\InstallPlanTest;

use Pterodactyl\Exceptions\Software\InvalidInstallPlanException;
use Pterodactyl\Services\Servers\Software\InstallPlan;
use Pterodactyl\Tests\TestCase;

uses(TestCase::class);

const SHA1 = '0123456789abcdef0123456789abcdef01234567';

/** @return array<string, mixed> */
function file(array $overrides = []): array
{
    return ['path' => 'mods/lithium.jar', 'url' => 'https://cdn.modrinth.com/data/x/versions/y/lithium.jar', 'sha1' => SHA1, 'size' => 12, ...$overrides];
}

function plan(array $files = [], array $archives = [], array $remove = [], array $moves = [], array $keep = InstallPlan::DEFAULT_KEEP): InstallPlan
{
    return new InstallPlan('modpack', false, $keep, null, $moves, $remove, $files, $archives);
}

test('the same plan always serialises to the same bytes and hash', function (): void {
    $make = fn (): InstallPlan => InstallPlan::forSoftware(['type' => 'fabric', 'minecraft' => '1.21.1', 'loader' => '0.16.9']);

    expect($make()->toJson())->toBe($make()->toJson())
        ->and($make()->sha256())->toBe(hash('sha256', $make()->toJson()))
        ->and($make()->toJson())->toBe('{"version":1,"operation":"software","wipe":{"enabled":false,"keep":["world","world_nether","world_the_end","server.properties","ops.json","whitelist.json","banned-players.json","banned-ips.json","eula.txt"]},"software":{"type":"fabric","minecraft":"1.21.1","loader":"0.16.9"},"moves":[],"remove":[],"files":[],"archives":[],"eula":true}');
});

test('key order in the input does not change the output', function (): void {
    $a = plan([file()]);
    $b = plan([['size' => 12, 'sha1' => SHA1, 'url' => 'https://cdn.modrinth.com/data/x/versions/y/lithium.jar', 'path' => 'mods/lithium.jar']]);

    expect($a->toJson())->toBe($b->toJson())->and($a->sha256())->toBe($b->sha256());
});

test('a different plan has a different hash', function (): void {
    expect(plan([file()])->sha256())->not->toBe(plan([file(['path' => 'mods/other.jar'])])->sha256());
});

test('urls on the allowlist pass and everything else is rejected', function (string $url, bool $allowed): void {
    expect(InstallPlan::isAllowedUrl($url))->toBe($allowed);

    $build = fn (): InstallPlan => plan([file(['url' => $url])]);
    $allowed ? expect($build())->toBeInstanceOf(InstallPlan::class) : expect($build)->toThrow(InvalidInstallPlanException::class);
})->with([
    'modrinth cdn' => ['https://cdn.modrinth.com/data/a/versions/b/c.jar', true],
    'forge cdn' => ['https://mediafilez.forgecdn.net/files/1/2/a.jar', true],
    'fill data' => ['https://fill-data.papermc.io/v1/objects/abc/paper.jar', true],
    'purpur' => ['https://api.purpurmc.org/v2/purpur/1.21.1/1/download', true],
    'uppercase host' => ['https://CDN.Modrinth.com/a.jar', true],
    'plain http' => ['http://cdn.modrinth.com/a.jar', false],
    'other host' => ['https://example.com/a.jar', false],
    'lookalike suffix' => ['https://cdn.modrinth.com.evil.com/a.jar', false],
    'lookalike prefix' => ['https://evilcdn.modrinth.com/a.jar', false],
    'userinfo' => ['https://cdn.modrinth.com@evil.com/a.jar', false],
    'userinfo to allowed' => ['https://user:pw@cdn.modrinth.com/a.jar', false],
    'port' => ['https://cdn.modrinth.com:8443/a.jar', false],
    'fragment' => ['https://cdn.modrinth.com/a.jar#x', false],
    'backslash' => ['https://cdn.modrinth.com\\@evil.com/a.jar', false],
    'whitespace' => ['https://cdn.modrinth.com/a b.jar', false],
    'ftp' => ['ftp://cdn.modrinth.com/a.jar', false],
    'file' => ['file:///etc/passwd', false],
    'empty' => ['', false],
]);

test('plan paths that could leave the server are rejected everywhere', function (string $path): void {
    expect(fn () => plan([file(['path' => $path])]))->toThrow(InvalidInstallPlanException::class)
        ->and(fn () => plan(remove: [$path]))->toThrow(InvalidInstallPlanException::class)
        ->and(fn () => plan(moves: [['from' => $path, 'to' => 'x']]))->toThrow(InvalidInstallPlanException::class)
        ->and(fn () => plan(moves: [['from' => 'x', 'to' => $path]]))->toThrow(InvalidInstallPlanException::class)
        ->and(fn () => plan(keep: [$path]))->toThrow(InvalidInstallPlanException::class)
        ->and(fn () => plan(archives: [['local' => $path]]))->toThrow(InvalidInstallPlanException::class)
        ->and(fn () => plan(archives: [['local' => 'a.zip', 'into' => $path]]))->toThrow(InvalidInstallPlanException::class)
        ->and(fn () => plan(archives: [['local' => 'a.zip', 'strip' => $path]]))->toThrow(InvalidInstallPlanException::class)
        ->and(fn () => plan(archives: [['local' => 'a.zip', 'only' => $path]]))->toThrow(InvalidInstallPlanException::class);
})->with([
    'parent' => ['../etc/passwd'],
    'nested parent' => ['mods/../../x'],
    'only parent' => ['..'],
    'absolute' => ['/etc/passwd'],
    'dot segment' => ['mods/./x.jar'],
    'empty segment' => ['mods//x.jar'],
    'backslash' => ['mods\\x.jar'],
    'windows drive' => ['C:/x.jar'],
    'nul byte' => ["mods/x\0.jar"],
    'newline' => ["mods/x\n.jar"],
]);

test('ordinary relative paths are accepted', function (): void {
    expect(plan([file(['path' => 'config/sub dir/a.toml'])], remove: ['mods/old.jar'], moves: [['from' => 'mods', 'to' => 'mods.disabled-20261121']])->files)->toHaveCount(1);
});

test('files need a hash of the right shape', function (): void {
    expect(fn () => plan([file(['sha1' => null])]))->toThrow(InvalidInstallPlanException::class)
        ->and(fn () => plan([file(['sha1' => 'zz'])]))->toThrow(InvalidInstallPlanException::class)
        ->and(plan([file(['sha1' => null, 'sha512' => str_repeat('a', 128)])])->files[0]['sha512'])->toBe(str_repeat('a', 128));
});

test('archives take exactly one source and a downloaded one needs a sha1', function (): void {
    $url = 'https://cdn.modrinth.com/data/x/versions/y/pack.mrpack';

    expect(fn () => plan(archives: [['url' => $url, 'local' => 'a.zip', 'sha1' => SHA1]]))->toThrow(InvalidInstallPlanException::class)
        ->and(fn () => plan(archives: [['sha1' => SHA1]]))->toThrow(InvalidInstallPlanException::class)
        ->and(fn () => plan(archives: [['url' => $url]]))->toThrow(InvalidInstallPlanException::class)
        ->and(fn () => plan(archives: [['url' => 'https://evil.example/p.zip', 'sha1' => SHA1]]))->toThrow(InvalidInstallPlanException::class)
        ->and(plan(archives: [['url' => $url, 'sha1' => SHA1, 'strip' => 'overrides/']])->archives[0]['strip'])->toBe('overrides/')
        ->and(plan(archives: [['local' => '.astrelyse/uploads/pack.mrpack']])->archives[0]['local'])->toBe('.astrelyse/uploads/pack.mrpack');
});

test('software needs a known type and well formed versions', function (): void {
    expect(fn () => InstallPlan::forSoftware(['type' => 'bedrock', 'minecraft' => '1.21.1']))->toThrow(InvalidInstallPlanException::class)
        ->and(fn () => InstallPlan::forSoftware(['type' => 'fabric', 'minecraft' => '1.21; rm -rf /']))->toThrow(InvalidInstallPlanException::class)
        ->and(fn () => InstallPlan::forSoftware(['type' => 'fabric', 'minecraft' => '1.21.1', 'loader' => '$(id)']))->toThrow(InvalidInstallPlanException::class)
        ->and(fn () => new InstallPlan('format-disk'))->toThrow(InvalidInstallPlanException::class);
});

test('a clear plan wipes, keeps only worlds when asked, and has no software', function (): void {
    $keeping = InstallPlan::forClear(true);
    $all = InstallPlan::forClear(false);

    expect($keeping->wipe)->toBeTrue()
        ->and($keeping->keep)->toBe(['world', 'world_nether', 'world_the_end'])
        ->and($keeping->software)->toBeNull()
        ->and($all->keep)->toBe([])
        ->and(InstallPlan::forClear(true, ['survival', 'survival_nether'])->keep)->toBe(['survival', 'survival_nether']);
});
