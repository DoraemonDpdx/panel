<?php

declare(strict_types=1);

namespace Pterodactyl\Tests\Pest\Integration\Api\Client\DashboardPreferencesTest;

use Illuminate\Support\Str;
use Pterodactyl\Models\User;
use Pterodactyl\Models\UserDashboardPreference;
use Pterodactyl\Tests\Integration\Api\Client\ClientApiIntegrationTestCase;

uses(ClientApiIntegrationTestCase::class);

const ENDPOINT = '/api/client/account/dashboard-preferences';

test('a user with nothing saved gets the defaults', function (): void {
    $this->actingAs(User::factory()->create())
        ->getJson(ENDPOINT)
        ->assertOk()
        ->assertJsonPath('object', 'dashboard_preferences')
        ->assertJsonPath('attributes', ['pinned' => [], 'group' => 'none', 'status' => 'all']);
});

test('preferences are merged and persisted per user', function (): void {
    $user = User::factory()->create();
    $other = User::factory()->create();
    $uuid = Str::uuid()->toString();

    $this->actingAs($user)->putJson(ENDPOINT, ['pinned' => [$uuid]])
        ->assertOk()
        ->assertJsonPath('attributes.pinned', [$uuid]);

    // A later partial update keeps the earlier fields.
    $this->actingAs($user)->putJson(ENDPOINT, ['group' => 'node', 'status' => 'running'])->assertOk();
    $this->actingAs($user)->getJson(ENDPOINT)
        ->assertJsonPath('attributes', ['pinned' => [$uuid], 'group' => 'node', 'status' => 'running']);

    $this->actingAs($other)->getJson(ENDPOINT)->assertJsonPath('attributes.pinned', []);
});

test('invalid values are rejected', function (): void {
    $this->actingAs(User::factory()->create());

    $this->putJson(ENDPOINT, ['group' => 'project'])->assertUnprocessable();
    $this->putJson(ENDPOINT, ['status' => 'deleted'])->assertUnprocessable();
    $this->putJson(ENDPOINT, ['pinned' => ['not-a-uuid']])->assertUnprocessable();
});

test('a view stored before the grid layout was removed is ignored', function (): void {
    $user = User::factory()->create();
    $uuid = Str::uuid()->toString();

    UserDashboardPreference::query()->create([
        'user_id' => $user->id,
        'preferences' => ['pinned' => [$uuid], 'view' => 'grid', 'group' => 'node', 'status' => 'running'],
    ]);

    $this->actingAs($user)->getJson(ENDPOINT)
        ->assertOk()
        ->assertJsonPath('attributes', ['pinned' => [$uuid], 'group' => 'node', 'status' => 'running']);

    // Sending a view is harmless: it is neither validated nor saved.
    $this->actingAs($user)->putJson(ENDPOINT, ['view' => 'table', 'status' => 'all'])
        ->assertOk()
        ->assertJsonPath('attributes', ['pinned' => [$uuid], 'group' => 'node', 'status' => 'all']);
});
