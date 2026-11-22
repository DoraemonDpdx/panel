<?php

declare(strict_types=1);

namespace Pterodactyl\Tests\Pest\Integration\Eggs\WorkloadProfileTest;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;
use Pterodactyl\Contracts\Eggs\CreatesEggs;
use Pterodactyl\Contracts\Eggs\ExportsEggs;
use Pterodactyl\Contracts\Eggs\ImportsEggs;
use Pterodactyl\Contracts\Eggs\UpdatesEggs;
use Pterodactyl\Contracts\Eggs\UpdatesEggsFromImports;
use Pterodactyl\Data\EggImportData;
use Pterodactyl\Enum\WorkloadProfile;
use Pterodactyl\Exceptions\Service\InvalidFileUploadException;
use Pterodactyl\Http\Resources\Api\Admin\EggResource as AdminEggResource;
use Pterodactyl\Models\Egg;
use Pterodactyl\Models\Tag;
use Pterodactyl\Tests\Integration\IntegrationTestCase;

uses(IntegrationTestCase::class, DatabaseTransactions::class);

/** The Paper egg file, with the given keys replaced; a `null` removes one. */
function eggFile(array $overrides = []): UploadedFile
{
    $egg = json_decode((string) file_get_contents(base_path('database/seeders/eggs/minecraft/egg-paper.json')), true);
    unset($egg['workload_profile']);

    foreach ($overrides as $key => $value) {
        $value === null ? $egg[$key] = null : $egg[$key] = $value;
    }

    return UploadedFile::fake()->createWithContent('egg.json', (string) json_encode($egg));
}

test('the eggs table has a workload profile column that defaults to generic', function (): void {
    expect(Schema::hasColumn('eggs', 'workload_profile'))->toBeTrue();

    $egg = Egg::factory()->create();

    expect($egg->refresh()->workload_profile)->toBe(WorkloadProfile::Generic);
});

test('the migration marks eggs carrying a built-in game tag as game and leaves the rest generic', function (): void {
    $minecraft = Egg::factory()->create();
    $minecraft->tags()->attach(Tag::findOrCreateFromSlugs(['minecraft']));
    $voice = Egg::factory()->create();
    $voice->tags()->attach(Tag::findOrCreateFromSlugs(['voice']));
    $untagged = Egg::factory()->create();

    $migration = require base_path('database/migrations/2026_11_19_000003_add_workload_profile_to_eggs_table.php');
    $migration->markGameEggs();

    expect($minecraft->refresh()->workload_profile)->toBe(WorkloadProfile::Game);
    expect($voice->refresh()->workload_profile)->toBe(WorkloadProfile::Generic);
    expect($untagged->refresh()->workload_profile)->toBe(WorkloadProfile::Generic);
});

test('an egg is created and updated with a workload profile and rejects an unknown one', function (): void {
    $input = [
        'name' => 'Lavalink',
        'docker_images' => 'ghcr.io/example/lavalink:4',
        'startup' => 'java -jar Lavalink.jar',
        'config_stop' => '^C',
        'config_startup' => '{"done": ["ready"]}',
        'config_logs' => '{}',
        'config_files' => '{}',
    ];

    $egg = app(CreatesEggs::class)->create([...$input, 'workload_profile' => 'lavalink']);
    expect($egg->workload_profile)->toBe(WorkloadProfile::Lavalink);

    app(UpdatesEggs::class)->update($egg, [...$input, 'workload_profile' => 'bot']);
    expect($egg->refresh()->workload_profile)->toBe(WorkloadProfile::Bot);

    expect(app(CreatesEggs::class)->create($input)->workload_profile)->toBe(WorkloadProfile::Generic);

    expect(fn () => app(CreatesEggs::class)->create([...$input, 'workload_profile' => 'spaceship']))->toThrow(ValidationException::class);
});

test('an export carries the profile and an import restores it', function (): void {
    $egg = app(ImportsEggs::class)->import(eggFile(['workload_profile' => 'game']));
    expect($egg->workload_profile)->toBe(WorkloadProfile::Game);

    $exported = json_decode(app(ExportsEggs::class)->export($egg), true);
    expect($exported['workload_profile'])->toBe('game');

    $copy = app(ImportsEggs::class)->import(UploadedFile::fake()->createWithContent('egg.json', (string) json_encode($exported)));
    expect($copy->workload_profile)->toBe(WorkloadProfile::Game);
});

test('a file without a profile makes a generic egg and leaves an updated egg alone', function (): void {
    $egg = app(ImportsEggs::class)->import(eggFile());
    expect($egg->workload_profile)->toBe(WorkloadProfile::Generic);

    $egg->forceFill(['workload_profile' => WorkloadProfile::Web])->save();
    app(UpdatesEggsFromImports::class)->update($egg, eggFile());
    expect($egg->refresh()->workload_profile)->toBe(WorkloadProfile::Web);

    app(UpdatesEggsFromImports::class)->update($egg, eggFile(['workload_profile' => 'bot']));
    expect($egg->refresh()->workload_profile)->toBe(WorkloadProfile::Bot);
});

test('an import with an unknown profile is refused', function (): void {
    $file = eggFile(['workload_profile' => 'spaceship']);

    expect(fn () => EggImportData::fromFile($file))->toThrow(InvalidFileUploadException::class, 'workload_profile');
});

test('the shipped game eggs declare the game profile', function (): void {
    foreach (['minecraft', 'source-engine', 'rust'] as $directory) {
        foreach (glob(base_path("database/seeders/eggs/{$directory}/*.json")) as $path) {
            $parsed = json_decode((string) file_get_contents($path), true);

            expect($parsed['workload_profile'] ?? null)->toBe('game', basename($path));
        }
    }
});

test('the admin egg resource exposes the profile', function (): void {
    $egg = Egg::factory()->create(['workload_profile' => WorkloadProfile::Database]);

    expect((new AdminEggResource($egg))->toArray(request())['workload_profile'])->toBe(WorkloadProfile::Database);
});
