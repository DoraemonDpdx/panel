<?php

declare(strict_types=1);

namespace Pterodactyl\Tests\Pest\Unit\Services\Servers\Mods\Import\ModLinkParserTest;

use Pterodactyl\Services\Servers\Mods\Import\ModLinkParser;
use Pterodactyl\Services\Servers\Mods\Import\ParsedLink;
use Pterodactyl\Tests\TestCase;

uses(TestCase::class);

dataset('valid links', [
    'modrinth mod' => ['https://modrinth.com/mod/sodium', new ParsedLink('modrinth', 'mod', 'sodium')],
    'modrinth plugin' => ['https://modrinth.com/plugin/luckperms', new ParsedLink('modrinth', 'plugin', 'luckperms')],
    'modrinth datapack' => ['https://modrinth.com/datapack/terralith', new ParsedLink('modrinth', 'datapack', 'terralith')],
    'modrinth modpack' => ['https://modrinth.com/modpack/fabulously-optimized', new ParsedLink('modrinth', 'modpack', 'fabulously-optimized')],
    'modrinth shader' => ['https://modrinth.com/shader/complementary-reimagined', new ParsedLink('modrinth', 'shader', 'complementary-reimagined')],
    'modrinth resourcepack' => ['https://modrinth.com/resourcepack/faithful-32x', new ParsedLink('modrinth', 'resourcepack', 'faithful-32x')],
    'modrinth www host with trailing slash' => ['https://www.modrinth.com/mod/lithium/', new ParsedLink('modrinth', 'mod', 'lithium')],
    'modrinth uppercase scheme and host' => ['HTTPS://MODRINTH.COM/mod/sodium', new ParsedLink('modrinth', 'mod', 'sodium')],
    'modrinth http scheme' => ['http://modrinth.com/mod/sodium', new ParsedLink('modrinth', 'mod', 'sodium')],
    'modrinth surrounding whitespace' => ['  https://modrinth.com/mod/sodium  ', new ParsedLink('modrinth', 'mod', 'sodium')],
    'modrinth version page' => ['https://modrinth.com/mod/sodium/version/AbCd1234', new ParsedLink('modrinth', 'mod', 'sodium', versionId: 'AbCd1234')],
    'modrinth project id' => ['https://modrinth.com/project/AANobbMI', new ParsedLink('modrinth', 'mod', 'AANobbMI')],
    'modrinth cdn file' => [
        'https://cdn.modrinth.com/data/AANobbMI/versions/P7dR8mSH/sodium-fabric-0.5.8.jar',
        new ParsedLink('modrinth', 'mod', 'AANobbMI', versionId: 'P7dR8mSH'),
    ],
    'modrinth query and fragment ignored' => ['https://modrinth.com/mod/sodium?v=1.20.1&loader=fabric#downloads', new ParsedLink('modrinth', 'mod', 'sodium')],
    'modrinth slug case kept' => ['https://modrinth.com/mod/Sodium-Extra', new ParsedLink('modrinth', 'mod', 'Sodium-Extra')],
    'curseforge mod' => ['https://curseforge.com/minecraft/mc-mods/jei', new ParsedLink('curseforge', 'mod', 'jei')],
    'curseforge bukkit plugin' => ['https://www.curseforge.com/minecraft/bukkit-plugins/essentialsx', new ParsedLink('curseforge', 'plugin', 'essentialsx')],
    'curseforge modpack' => ['https://www.curseforge.com/minecraft/modpacks/all-the-mods-9/', new ParsedLink('curseforge', 'modpack', 'all-the-mods-9')],
    'curseforge world' => ['https://www.curseforge.com/minecraft/worlds/some-world', new ParsedLink('curseforge', 'world', 'some-world')],
    'curseforge texture pack' => ['https://www.curseforge.com/minecraft/texture-packs/faithful', new ParsedLink('curseforge', 'resourcepack', 'faithful')],
    'curseforge shader' => ['https://www.curseforge.com/minecraft/shaders/complementary', new ParsedLink('curseforge', 'shader', 'complementary')],
    'curseforge files id' => ['https://www.curseforge.com/minecraft/mc-mods/jei/files/4567890', new ParsedLink('curseforge', 'mod', 'jei', fileId: '4567890')],
    'curseforge download id' => ['https://www.curseforge.com/minecraft/mc-mods/jei/download/4567890', new ParsedLink('curseforge', 'mod', 'jei', fileId: '4567890')],
]);

dataset('invalid links', [
    'javascript scheme' => ['javascript:alert(1)'],
    'ftp scheme' => ['ftp://modrinth.com/mod/sodium'],
    'data uri' => ['data:text/html,<script>alert(1)</script>'],
    'lookalike suffix domain' => ['https://modrinth.com.evil.io/mod/sodium'],
    'lookalike prefix domain' => ['https://notmodrinth.com/mod/sodium'],
    'lookalike curseforge domain' => ['https://curseforge.com.evil.io/minecraft/mc-mods/jei'],
    'allowed host only in query' => ['https://evil.io/?https://modrinth.com/mod/sodium'],
    'allowed host only in path' => ['https://evil.io/modrinth.com/mod/sodium'],
    'userinfo with allowed host first' => ['https://modrinth.com@evil.io/mod/sodium'],
    'userinfo with password' => ['https://modrinth.com:pass@evil.io/mod/sodium'],
    'credentials on allowed host' => ['https://user:pass@modrinth.com/mod/sodium'],
    'non default port' => ['https://modrinth.com:8443/mod/sodium'],
    'unknown host' => ['https://example.com/mod/sodium'],
    'empty string' => [''],
    'plain text' => ['sodium'],
    'missing host' => ['https:///mod/sodium'],
    'unknown modrinth kind' => ['https://modrinth.com/user/someone'],
    'modrinth version without project kind' => ['https://modrinth.com/version/AbCd1234'],
    'modrinth empty slug' => ['https://modrinth.com/mod/'],
    'modrinth slug with symbols' => ['https://modrinth.com/mod/so$dium'],
    'modrinth percent encoded slug' => ['https://modrinth.com/mod/so%64ium'],
    'modrinth slug too long' => ['https://modrinth.com/mod/'.str_repeat('a', 65)],
    'modrinth version with a slash payload' => ['https://modrinth.com/mod/sodium/version/a%2F..'],
    'modrinth version with spaces' => ['https://modrinth.com/mod/sodium/version/a%20b'],
    'modrinth short project id' => ['https://modrinth.com/project/abc'],
    'modrinth project id with extra segment' => ['https://modrinth.com/project/AbCd1234/extra'],
    'modrinth versions tab' => ['https://modrinth.com/mod/sodium/versions'],
    'double slash in path' => ['https://modrinth.com//mod/sodium'],
    'cdn missing file name' => ['https://cdn.modrinth.com/data/AANobbMI/versions/P7dR8mSH'],
    'cdn bad project id' => ['https://cdn.modrinth.com/data/bad!id!/versions/P7dR8mSH/x.jar'],
    'cdn wrong first segment' => ['https://cdn.modrinth.com/assets/AANobbMI/versions/P7dR8mSH/x.jar'],
    'curseforge non digit file id' => ['https://www.curseforge.com/minecraft/mc-mods/jei/files/abc'],
    'curseforge unknown section' => ['https://www.curseforge.com/minecraft/unknown/jei'],
    'curseforge not minecraft' => ['https://www.curseforge.com/wow/mc-mods/jei'],
    'curseforge extra segment after file id' => ['https://www.curseforge.com/minecraft/mc-mods/jei/download/4567890/file'],
    'curseforge unknown file marker' => ['https://www.curseforge.com/minecraft/mc-mods/jei/guide/4567890'],
    'whitespace inside url' => ['https://modrinth.com/mod/sodium with space'],
]);

test('parses a valid Modrinth or CurseForge link', function (string $url, ParsedLink $expected): void {
    expect((new ModLinkParser)->parse($url))->toEqual($expected);
})->with('valid links');

test('rejects an invalid or unsafe link', function (string $url): void {
    expect((new ModLinkParser)->parse($url))->toBeNull();
})->with('invalid links');

test('ignores query strings and fragments on a CurseForge file link', function (): void {
    $link = (new ModLinkParser)->parse('https://www.curseforge.com/minecraft/mc-mods/jei/files/4567890?page=2#top');

    expect($link)->toEqual(new ParsedLink('curseforge', 'mod', 'jei', fileId: '4567890'));
});

test('keeps the version id and reports no file id for a Modrinth version link', function (): void {
    $link = (new ModLinkParser)->parse('https://www.modrinth.com/plugin/luckperms/version/AbCd1234/');

    expect($link)->toEqual(new ParsedLink('modrinth', 'plugin', 'luckperms', versionId: 'AbCd1234'));
    expect($link?->fileId)->toBeNull();
});

test('CDN links default to kind mod and carry the project id as slugOrId', function (): void {
    $link = (new ModLinkParser)->parse('https://cdn.modrinth.com/data/AANobbMI/versions/P7dR8mSH/lithium-fabric.jar');

    expect($link)->toEqual(new ParsedLink('modrinth', 'mod', 'AANobbMI', versionId: 'P7dR8mSH'));
});

test('a link with no path is rejected', function (): void {
    expect((new ModLinkParser)->parse('https://modrinth.com'))->toBeNull();
    expect((new ModLinkParser)->parse('https://modrinth.com/'))->toBeNull();
});

test('a modrinth version link by version number is accepted', function (): void {
    $link = (new ModLinkParser)->parse('https://modrinth.com/mod/lithium/version/mc1.21.1-0.13.1');

    expect($link)->not->toBeNull()
        ->and($link?->slugOrId)->toBe('lithium')
        ->and($link?->versionId)->toBe('mc1.21.1-0.13.1');
});

test('a modrinth version number cannot smuggle path segments', function (string $url): void {
    expect((new ModLinkParser)->parse($url))->toBeNull();
})->with([
    'https://modrinth.com/mod/lithium/version/..',
    'https://modrinth.com/mod/lithium/version/a..b',
    'https://modrinth.com/mod/lithium/version/-leading',
]);
