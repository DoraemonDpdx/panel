<?php

declare(strict_types=1);

namespace Pterodactyl\Tests\Pest\Integration\Api\Client\WorkloadProfileTest;

use Pterodactyl\Enum\WorkloadProfile;
use Pterodactyl\Tests\Integration\Api\Client\ClientApiIntegrationTestCase;

uses(ClientApiIntegrationTestCase::class);

test('the client server list and view expose the egg workload profile', function (): void {
    [$user, $server] = $this->generateTestAccount();
    $server->egg->forceFill(['workload_profile' => WorkloadProfile::Bot])->save();

    $this->actingAs($user)->getJson('/api/client')
        ->assertOk()
        ->assertJsonPath('data.0.attributes.workload_profile', 'bot');

    $this->actingAs($user)->getJson("/api/client/servers/{$server->uuid}")
        ->assertOk()
        ->assertJsonPath('attributes.workload_profile', 'bot');
});

test('a server on an unclassified egg is generic', function (): void {
    [$user, $server] = $this->generateTestAccount();
    $server->egg->forceFill(['workload_profile' => WorkloadProfile::Generic])->save();

    $this->actingAs($user)->getJson("/api/client/servers/{$server->uuid}")
        ->assertOk()
        ->assertJsonPath('attributes.workload_profile', 'generic');
});
