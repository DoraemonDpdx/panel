<?php

declare(strict_types=1);

namespace Pterodactyl\Tests\Pest\Unit\Services\Servers\Mods\MinecraftPlatformDetectorTest;

use Illuminate\Database\Eloquent\Collection;
use Pterodactyl\Models\Egg;
use Pterodactyl\Models\EggVariable;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\ServerVariable;
use Pterodactyl\Models\Tag;
use Pterodactyl\Services\Servers\Mods\DetectedPlatform;
use Pterodactyl\Services\Servers\Mods\MinecraftPlatformDetector;
use Pterodactyl\Tests\TestCase;

uses(TestCase::class);

/**
 * Builds an in-memory server with its egg, tags and variables attached as relations, so the
 * detector reads them without touching the database.
 *
 * @param  string[]  $tags
 * @param  array<string, string>  $variables  egg variable defaults keyed by env name
 * @param  array<string, string>  $overrides  server values keyed by env name
 */
function detectorServer(string $eggName, array $tags, array $variables = [], array $overrides = [], ?string $startup = null): Server
{
    $egg = new Egg(['name' => $eggName, 'startup' => 'java -jar {{SERVER_JARFILE}}']);
    $egg->setRelation('tags', new Collection(array_map(fn (string $slug): Tag => new Tag(['slug' => $slug]), $tags)));

    $eggVariables = [];
    $ids = [];
    foreach ($variables as $env => $default) {
        $variable = new EggVariable(['env_variable' => $env, 'default_value' => $default]);
        $variable->id = count($eggVariables) + 1;
        $eggVariables[] = $variable;
        $ids[$env] = $variable->id;
    }
    $egg->setRelation('variables', new Collection($eggVariables));

    $serverVariables = [];
    foreach ($overrides as $env => $value) {
        $serverVariables[] = new ServerVariable(['variable_id' => $ids[$env], 'variable_value' => $value]);
    }

    $server = new Server(['startup' => $startup ?? 'java -jar {{SERVER_JARFILE}}']);
    $server->setRelation('egg', $egg);
    $server->setRelation('serverVariables', new Collection($serverVariables));

    return $server;
}

test('forge egg reads the game version from MC_VERSION and installs into mods', function (): void {
    $server = detectorServer(
        'Forge Minecraft',
        ['minecraft'],
        ['SERVER_JARFILE' => 'server.jar', 'MC_VERSION' => 'latest', 'FORGE_VERSION' => ''],
        ['MC_VERSION' => '1.20.1'],
    );

    expect((new MinecraftPlatformDetector)->detect($server)->toArray())->toBe([
        'eligible' => true,
        'platform' => 'forge',
        'game_version' => '1.20.1',
        'project_type' => 'mod',
        'install_dir' => 'mods',
        'source' => 'egg_name',
    ]);
});

test('paper egg reads the game version from MINECRAFT_VERSION and installs into plugins', function (): void {
    $server = detectorServer('Paper', ['minecraft'], ['MINECRAFT_VERSION' => '1.21.1', 'SERVER_JARFILE' => 'server.jar']);

    expect((new MinecraftPlatformDetector)->detect($server)->toArray())->toBe([
        'eligible' => true,
        'platform' => 'paper',
        'game_version' => '1.21.1',
        'project_type' => 'plugin',
        'install_dir' => 'plugins',
        'source' => 'egg_name',
    ]);
});

test('vanilla egg is not eligible', function (): void {
    $detected = (new MinecraftPlatformDetector)->detect(
        detectorServer('Vanilla Minecraft', ['minecraft'], ['VANILLA_VERSION' => 'latest', 'SERVER_JARFILE' => 'server.jar']),
    );

    expect($detected->eligible)->toBeFalse()
        ->and($detected->platform)->toBe('vanilla')
        ->and($detected->project_type)->toBeNull()
        ->and($detected->install_dir)->toBeNull()
        ->and($detected->source)->toBe('egg_name');
});

test('bedrock-tagged egg is not eligible even though it is also minecraft-tagged', function (): void {
    $detected = (new MinecraftPlatformDetector)->detect(
        detectorServer('Paper', ['minecraft', 'bedrock'], ['MINECRAFT_VERSION' => '1.21.1']),
    );

    expect($detected->toArray())->toBe(DetectedPlatform::ineligible()->toArray());
});

test('egg without the minecraft tag is not eligible', function (): void {
    $detected = (new MinecraftPlatformDetector)->detect(
        detectorServer('Paper', ['srcds'], ['MINECRAFT_VERSION' => '1.21.1']),
    );

    expect($detected->toArray())->toBe(DetectedPlatform::ineligible()->toArray());
});

test('a custom NeoForge egg is detected as neoforge, not forge', function (): void {
    $server = detectorServer(
        'NeoForge',
        ['minecraft'],
        ['MC_VERSION' => '1.21.1', 'FORGE_VERSION' => ''],
    );

    expect((new MinecraftPlatformDetector)->detect($server)->toArray())->toBe([
        'eligible' => true,
        'platform' => 'neoforge',
        'game_version' => '1.21.1',
        'project_type' => 'mod',
        'install_dir' => 'mods',
        'source' => 'egg_name',
    ]);
});

test('a fabric server is detected from fabric-server-launch.jar in the startup command', function (): void {
    $server = detectorServer(
        'Minecraft Java',
        ['minecraft'],
        ['MC_VERSION' => '1.21', 'SERVER_JARFILE' => 'server.jar'],
        startup: 'java -Xms128M -jar fabric-server-launch.jar nogui',
    );

    expect((new MinecraftPlatformDetector)->detect($server)->toArray())->toBe([
        'eligible' => true,
        'platform' => 'fabric',
        'game_version' => '1.21',
        'project_type' => 'mod',
        'install_dir' => 'mods',
        'source' => 'startup',
    ]);
});

test('sponge takes the game version before the dash in SPONGE_VERSION', function (): void {
    $server = detectorServer(
        'Sponge (SpongeVanilla)',
        ['minecraft'],
        ['SPONGE_VERSION' => '1.12.2-7.3.0', 'SERVER_JARFILE' => 'server.jar'],
    );

    expect((new MinecraftPlatformDetector)->detect($server)->toArray())->toBe([
        'eligible' => true,
        'platform' => 'sponge',
        'game_version' => '1.12.2',
        'project_type' => 'plugin',
        'install_dir' => 'plugins',
        'source' => 'egg_name',
    ]);
});

test('bungeecord has no game version and installs into plugins', function (): void {
    $server = detectorServer(
        'Bungeecord',
        ['minecraft'],
        ['BUNGEE_VERSION' => 'latest', 'SERVER_JARFILE' => 'bungeecord.jar'],
    );

    expect((new MinecraftPlatformDetector)->detect($server)->toArray())->toBe([
        'eligible' => true,
        'platform' => 'bungeecord',
        'game_version' => null,
        'project_type' => 'plugin',
        'install_dir' => 'plugins',
        'source' => 'egg_name',
    ]);
});

test('a latest game version is passed through unchanged', function (): void {
    $server = detectorServer('Paper', ['minecraft'], ['MINECRAFT_VERSION' => 'latest']);

    expect((new MinecraftPlatformDetector)->detect($server)->game_version)->toBe('latest');
});

test('platform falls back to variable names when the name and startup do not match', function (): void {
    $server = detectorServer(
        'Minecraft Java',
        ['minecraft'],
        ['FABRIC_VERSION' => '0.16.0', 'MC_VERSION' => '1.21.4'],
    );

    expect((new MinecraftPlatformDetector)->detect($server)->toArray())->toBe([
        'eligible' => true,
        'platform' => 'fabric',
        'game_version' => '1.21.4',
        'project_type' => 'mod',
        'install_dir' => 'mods',
        'source' => 'variable',
    ]);
});

test('a minecraft egg with no recognisable platform is not eligible', function (): void {
    $detected = (new MinecraftPlatformDetector)->detect(
        detectorServer('Minecraft Java', ['minecraft'], ['MC_VERSION' => '1.21.4', 'SERVER_JARFILE' => 'server.jar']),
    );

    expect($detected->toArray())->toBe(DetectedPlatform::ineligible()->toArray());
});

test('a vanilla-named egg whose startup runs a loader is detected as that loader', function (): void {
    $server = detectorServer(
        'Vanilla Minecraft',
        ['minecraft'],
        ['VANILLA_VERSION' => '1.21.1', 'SERVER_JARFILE' => 'server.jar'],
        startup: 'java -jar fabric-server-launch.jar nogui',
    );

    $detected = (new MinecraftPlatformDetector)->detect($server);

    expect($detected->eligible)->toBeTrue()
        ->and($detected->platform)->toBe('fabric')
        ->and($detected->game_version)->toBe('1.21.1')
        ->and($detected->source)->toBe('startup');
});

test('a game version that is not version-shaped is dropped', function (string $value): void {
    $server = detectorServer('Paper', ['minecraft'], ['MINECRAFT_VERSION' => $value]);

    expect((new MinecraftPlatformDetector)->detect($server)->game_version)->toBeNull();
})->with([
    'facet injection' => ['1.21"],["categories:forge'],
    'spaces' => ['1.21 1'],
    'empty' => [''],
]);

test('a version-shaped snapshot or pre-release is kept', function (string $value): void {
    $server = detectorServer('Fabric', ['minecraft'], ['MC_VERSION' => $value]);

    expect((new MinecraftPlatformDetector)->detect($server)->game_version)->toBe($value);
})->with(['24w14a', '1.20.5-pre1', '1.21.1']);

test('a minecraft egg with only a generic java startup and image is not eligible', function (): void {
    $server = detectorServer('Custom Jar', ['minecraft'], ['SERVER_JARFILE' => 'server.jar'], startup: 'java -Xmx4G -jar server.jar');

    expect((new MinecraftPlatformDetector)->detect($server)->eligible)->toBeFalse();
});
