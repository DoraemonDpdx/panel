<?php

declare(strict_types=1);

namespace Pterodactyl\Tests\Pest\Integration\Api\Client\PasskeyAndStaffTwoFactorTest;

use Database\Factories\RoleFactory;
use Illuminate\Http\Response;
use Pterodactyl\Models\User;
use Pterodactyl\Models\UserPasskey;

uses(\Pterodactyl\Tests\Integration\Api\Client\ClientApiIntegrationTestCase::class);

test('staff without two factor are blocked from the client api until they enable it', function (User $user) {
    config()->set('pterodactyl.auth.2fa_required', 0);

    $this->actingAs($user)->getJson('/api/client/permissions')
        ->assertStatus(Response::HTTP_BAD_REQUEST)
        ->assertJsonPath('errors.0.code', 'TwoFactorAuthRequiredException');

    // ...but can still reach the account endpoints needed to enable it.
    $this->actingAs($user)->getJson('/api/client/account/two-factor')->assertOk();
    $this->actingAs($user)->getJson('/api/client/account/passkeys')->assertOk();
})->with([
    'root admin' => fn () => User::factory()->create(['root_admin' => true, 'use_totp' => false]),
    'owner' => fn () => User::factory()->create(['is_owner' => true, 'root_admin' => true, 'use_totp' => false]),
    'role holder' => fn () => User::factory()->create(['role_id' => (new RoleFactory())->create()->id, 'use_totp' => false]),
]);

test('regular users are not forced to use two factor when the panel setting is off', function () {
    config()->set('pterodactyl.auth.2fa_required', 0);
    $user = User::factory()->create(['root_admin' => false, 'use_totp' => false]);

    $this->actingAs($user)->getJson('/api/client/permissions')->assertOk();
});

test('staff with two factor pass through', function () {
    $user = User::factory()->create(['root_admin' => true, 'use_totp' => true]);

    $this->actingAs($user)->getJson('/api/client/permissions')->assertOk();
});

test('staff cannot disable their own two factor', function () {
    $user = User::factory()->create(['root_admin' => true, 'use_totp' => true]);

    $this->actingAs($user)->postJson('/api/client/account/two-factor/disable', ['password' => 'password'])
        ->assertStatus(Response::HTTP_BAD_REQUEST);

    expect($user->refresh()->use_totp)->toBeTrue();
});

test('passkey registration options are bound to the account', function () {
    $user = User::factory()->create(['use_totp' => true]);

    $response = $this->actingAs($user)->postJson('/api/client/account/passkeys/options')->assertOk();

    expect($response->json('data.options.challenge'))->toBeString()->not->toBeEmpty()
        ->and($response->json('data.options.user.name'))->toBe($user->email)
        ->and($response->json('data.options.authenticatorSelection.userVerification'))->toBe('required');
});

test('a forged passkey registration is rejected and stores nothing', function () {
    $user = User::factory()->create(['use_totp' => true]);

    $this->actingAs($user)->postJson('/api/client/account/passkeys/options')->assertOk();
    $this->actingAs($user)->postJson('/api/client/account/passkeys', [
        'name' => 'Laptop',
        'response' => ['id' => 'AAAA', 'rawId' => 'AAAA', 'type' => 'public-key', 'response' => ['clientDataJSON' => 'AAAA', 'attestationObject' => 'AAAA']],
    ])->assertStatus(Response::HTTP_BAD_REQUEST);

    expect(UserPasskey::query()->count())->toBe(0);
});

test('registration without a prior options call is rejected', function () {
    $user = User::factory()->create(['use_totp' => true]);

    $this->actingAs($user)->postJson('/api/client/account/passkeys', [
        'name' => 'Laptop',
        'response' => ['id' => 'AAAA'],
    ])->assertStatus(Response::HTTP_BAD_REQUEST);
});

test('passkeys are listed and removed only with the password and only for the owner', function () {
    $user = User::factory()->create(['use_totp' => true]);
    $other = User::factory()->create();
    $mine = $user->passkeys()->create(['name' => 'Mac', 'credential_id' => 'cred-a', 'credential' => '{}']);
    $theirs = $other->passkeys()->create(['name' => 'Phone', 'credential_id' => 'cred-b', 'credential' => '{}']);

    $this->actingAs($user)->getJson('/api/client/account/passkeys')
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.name', 'Mac')
        ->assertJsonMissingPath('data.0.credential');

    $this->actingAs($user)->postJson("/api/client/account/passkeys/{$mine->id}/remove", ['password' => 'wrong'])
        ->assertStatus(Response::HTTP_BAD_REQUEST);
    $this->actingAs($user)->postJson("/api/client/account/passkeys/{$theirs->id}/remove", ['password' => 'password'])
        ->assertNotFound();
    $this->actingAs($user)->postJson("/api/client/account/passkeys/{$mine->id}/remove", ['password' => 'password'])
        ->assertNoContent();

    expect(UserPasskey::query()->whereKey($mine->id)->exists())->toBeFalse()
        ->and(UserPasskey::query()->whereKey($theirs->id)->exists())->toBeTrue();
});
