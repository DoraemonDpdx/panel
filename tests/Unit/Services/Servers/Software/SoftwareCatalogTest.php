<?php

declare(strict_types=1);

namespace Pterodactyl\Tests\Pest\Unit\Services\Servers\Software\SoftwareCatalogTest;

use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Services\Servers\Software\SoftwareCatalog;
use Pterodactyl\Tests\TestCase;

uses(TestCase::class);

beforeEach(function (): void {
    Cache::flush();
    Http::preventStrayRequests();
});

function maven(array $versions): string
{
    return '<?xml version="1.0"?><metadata><versioning><versions>'.implode('', array_map(fn (string $v): string => "<version>$v</version>", $versions)).'</versions></versioning></metadata>';
}

function catalog(): SoftwareCatalog
{
    return app(SoftwareCatalog::class);
}

test('vanilla lists releases and snapshots from the mojang manifest', function (): void {
    Http::fake(['piston-meta.mojang.com/*' => Http::response([
        'latest' => ['release' => '1.21.1', 'snapshot' => '24w40a'],
        'versions' => [
            ['id' => '24w40a', 'type' => 'snapshot'],
            ['id' => '1.21.1', 'type' => 'release'],
            ['id' => '1.20.4', 'type' => 'release'],
            ['id' => '1.2.4', 'type' => 'release'],
            ['id' => 'b1.7.3', 'type' => 'old_beta'],
        ],
    ])]);

    $all = catalog()->catalog('vanilla', true)['minecraft'];
    $releases = catalog()->catalog('vanilla')['minecraft'];

    expect($all)->toBe([
        ['id' => '24w40a', 'type' => 'snapshot', 'latest' => true],
        ['id' => '1.21.1', 'type' => 'release', 'latest' => true],
        ['id' => '1.20.4', 'type' => 'release', 'latest' => false],
    ])->and(array_column($releases, 'id'))->toBe(['1.21.1', '1.20.4'])
        ->and(catalog()->catalog('vanilla')['loaders'])->toBe([]);
});

test('paper flattens the grouped version list and marks release candidates as snapshots', function (): void {
    Http::fake([
        'fill.papermc.io/v3/projects/paper' => Http::response(['versions' => ['26.3' => ['26.3', '26.3-rc-3'], '1.21' => ['1.21.1', '1.21']]]),
        'fill.papermc.io/v3/projects/paper/versions/1.21.1/builds' => Http::response([['id' => 133, 'channel' => 'STABLE'], ['id' => 132, 'channel' => 'ALPHA']]),
    ]);

    $catalog = catalog()->catalog('paper', true, '1.21.1');

    expect($catalog['minecraft'])->toBe([
        ['id' => '26.3', 'type' => 'release', 'latest' => true],
        ['id' => '26.3-rc-3', 'type' => 'snapshot', 'latest' => true],
        ['id' => '1.21.1', 'type' => 'release', 'latest' => false],
        ['id' => '1.21', 'type' => 'release', 'latest' => false],
    ])->and($catalog['loaders'])->toBe(['1.21.1' => [['id' => '133', 'stable' => true], ['id' => '132', 'stable' => false]]])
        ->and(catalog()->recommendedLoader('paper', '1.21.1'))->toBe('133');
});

test('folia reads its own project', function (): void {
    Http::fake(['fill.papermc.io/v3/projects/folia' => Http::response(['versions' => ['1.21' => ['1.21.8', '1.21.4']]])]);

    expect(array_column(catalog()->minecraftVersions('folia'), 'id'))->toBe(['1.21.8', '1.21.4']);
});

test('purpur lists newest first with its build numbers', function (): void {
    Http::fake([
        'api.purpurmc.org/v2/purpur' => Http::response(['versions' => ['1.20.4', '1.21', '1.21.1']]),
        'api.purpurmc.org/v2/purpur/1.21.1' => Http::response(['builds' => ['latest' => '2329', 'all' => ['2327', '2328', '2329']]]),
    ]);

    expect(array_column(catalog()->minecraftVersions('purpur'), 'id'))->toBe(['1.21.1', '1.21', '1.20.4'])
        ->and(catalog()->loaders('purpur', '1.21.1'))->toBe(['1.21.1' => [['id' => '2329', 'stable' => true], ['id' => '2328', 'stable' => true], ['id' => '2327', 'stable' => true]]]);
});

test('fabric lists game versions and one shared loader list', function (): void {
    Http::fake([
        'meta.fabricmc.net/v2/versions/game' => Http::response([['version' => '1.21.1', 'stable' => true], ['version' => '24w40a', 'stable' => false]]),
        'meta.fabricmc.net/v2/versions/loader' => Http::response([['version' => '0.20.1', 'stable' => true], ['version' => '0.20.0', 'stable' => false]]),
    ]);

    $all = catalog()->catalog('fabric', true);

    expect($all['minecraft'])->toBe([['id' => '1.21.1', 'type' => 'release', 'latest' => true], ['id' => '24w40a', 'type' => 'snapshot', 'latest' => true]])
        ->and($all['loaders'])->toBe(['*' => [['id' => '0.20.1', 'stable' => true], ['id' => '0.20.0', 'stable' => false]]])
        ->and(catalog()->catalog('fabric', false, '1.21.1')['loaders'])->toHaveKey('1.21.1')
        ->and(catalog()->recommendedLoader('fabric', '1.21.1'))->toBe('0.20.1');
});

test('quilt marks pre-release loaders unstable', function (): void {
    Http::fake([
        'meta.quiltmc.org/v3/versions/game' => Http::response([['version' => '1.21.1', 'stable' => true]]),
        'meta.quiltmc.org/v3/versions/loader' => Http::response([['version' => '0.31.0-beta.6'], ['version' => '0.30.2']]),
    ]);

    expect(catalog()->loaders('quilt')['*'])->toBe([['id' => '0.31.0-beta.6', 'stable' => false], ['id' => '0.30.2', 'stable' => true]])
        ->and(catalog()->recommendedLoader('quilt', '1.21.1'))->toBe('0.30.2');
});

test('forge groups the maven versions by minecraft and marks the recommended build', function (): void {
    Http::fake([
        'maven.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml' => Http::response(maven(['1.20.1-47.3.0', '1.21.1-52.1.20', '1.21.1-52.1.21', '1.7.10_pre4-10.13.2.1291', '26.3-66.1.9'])),
        'files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json' => Http::response(['promos' => ['1.21.1-latest' => '52.1.21', '1.21.1-recommended' => '52.1.20', '1.20.1-latest' => '47.3.0']]),
    ]);

    $catalog = catalog()->catalog('forge');

    expect(array_column($catalog['minecraft'], 'id'))->toBe(['26.3', '1.21.1', '1.20.1'])
        ->and(catalog()->loaders('forge', '1.21.1'))->toBe(['1.21.1' => [['id' => '52.1.21', 'stable' => false], ['id' => '52.1.20', 'stable' => true]]])
        ->and(catalog()->loaders('forge', '1.20.1')['1.20.1'])->toBe([['id' => '47.3.0', 'stable' => true]])
        ->and(catalog()->recommendedLoader('forge', '1.21.1'))->toBe('52.1.20')
        ->and(catalog()->hasLoader('forge', '1.21.1', '52.1.20'))->toBeTrue()
        ->and(catalog()->hasLoader('forge', '1.21.1', '9.9.9'))->toBeFalse();
});

test('neoforge derives the minecraft version from its own version number', function (string $version, ?string $minecraft): void {
    expect(SoftwareCatalog::neoforgeMinecraft($version))->toBe($minecraft);
})->with([
    ['21.1.215', '1.21.1'],
    ['21.0.5-beta', '1.21'],
    ['20.4.237', '1.20.4'],
    ['20.2.86', '1.20.2'],
    ['20.1.1', null],
    ['26.3.0.115', '26.3'],
    ['26.1.2.128', '26.1.2'],
    ['garbage', null],
]);

test('neoforge lists versions newest first and keeps betas unstable', function (): void {
    Http::fake(['maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml' => Http::response(maven(['21.0.1-beta', '21.1.1', '21.1.2', '26.3.0.115']))]);

    $catalog = catalog()->catalog('neoforge');

    expect(array_column($catalog['minecraft'], 'id'))->toBe(['26.3', '1.21.1', '1.21'])
        ->and($catalog['loaders']['1.21.1'])->toBe([['id' => '21.1.2', 'stable' => true], ['id' => '21.1.1', 'stable' => true]])
        ->and($catalog['loaders']['1.21'])->toBe([['id' => '21.0.1-beta', 'stable' => false]]);
});

test('results are cached for an hour', function (): void {
    Http::fake(['fill.papermc.io/v3/projects/paper' => Http::response(['versions' => ['1.21' => ['1.21.1']]])]);

    catalog()->minecraftVersions('paper');
    catalog()->minecraftVersions('paper');

    Http::assertSentCount(1);
});

test('only known hosts are contacted', function (): void {
    Http::fake(['*' => Http::response(['versions' => []])]);

    foreach (array_keys(SoftwareCatalog::TYPES) as $type) {
        try {
            catalog()->catalog($type, true, '1.21.1');
        } catch (DisplayException) {
        }
    }

    Http::assertSent(fn (Request $request): bool => in_array($request->toPsrRequest()->getUri()->getHost(), [...\Pterodactyl\Services\Servers\Software\InstallPlan::ALLOWED_HOSTS, 'files.minecraftforge.net'], true));
});

test('an upstream failure becomes a friendly error', function (): void {
    Http::fake(['*' => Http::response('nope', 503)]);

    expect(fn () => catalog()->minecraftVersions('vanilla'))->toThrow(DisplayException::class, 'could not be loaded');
});

test('an unknown type is rejected', function (): void {
    expect(fn () => catalog()->minecraftVersions('bedrock'))->toThrow(DisplayException::class);
});
