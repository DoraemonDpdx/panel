<?php

declare(strict_types=1);

namespace Pterodactyl\Tests\Pest\Integration\Http\Controllers\Auth\PasskeyAndGoogleLoginTest;

use Illuminate\Support\Facades\Hash;
use Pterodactyl\Models\User;
use Pterodactyl\Services\Auth\GoogleIdTokenVerifier;
use Pterodactyl\Tests\Integration\Http\HttpTestCase;

uses(HttpTestCase::class);

/** A structurally valid stored credential, so options can be built for it. */
function storedCredential(string $rawId = 'cred-a'): string
{
    $serializer = (new \Webauthn\Denormalizer\WebauthnSerializerFactory(\Webauthn\AttestationStatement\AttestationStatementSupportManager::create()))->create();

    return $serializer->serialize(\Webauthn\CredentialRecord::create(
        $rawId,
        'public-key',
        ['internal'],
        'none',
        new \Webauthn\TrustPath\EmptyTrustPath(),
        \Symfony\Component\Uid\Uuid::fromString('00000000-0000-0000-0000-000000000000'),
        'public-key-bytes',
        'user-handle',
        0,
    ), 'json');
}

function login(User $user): \Illuminate\Testing\TestResponse
{
    return test()->postJson('/auth/login', ['user' => $user->username, 'password' => 'password']);
}

test('an account with a passkey and no authenticator goes straight to the passkey step', function () {
    $user = User::factory()->create(['use_totp' => false, 'password' => Hash::make('password')]);
    $user->passkeys()->create(['name' => 'Mac', 'credential_id' => 'Y3JlZC1h', 'credential' => storedCredential('cred-a')]);

    login($user)->assertOk()
        ->assertJsonPath('data.complete', false)
        ->assertJsonPath('data.step', 'passkey');
    $this->assertGuest();
});

test('the passkey step cannot be started or finished with a wrong token', function () {
    $user = User::factory()->create(['use_totp' => false, 'password' => Hash::make('password')]);
    $user->passkeys()->create(['name' => 'Mac', 'credential_id' => 'Y3JlZC1h', 'credential' => storedCredential('cred-a')]);
    login($user)->assertOk();

    $this->postJson('/auth/login/passkey/options', ['confirmation_token' => 'nope'])->assertStatus(400);
    $this->postJson('/auth/login/passkey', ['confirmation_token' => 'nope', 'response' => ['id' => 'x']])->assertStatus(400);
    $this->assertGuest();
});

test('a failed passkey assertion does not sign the user in', function () {
    $user = User::factory()->create(['use_totp' => false, 'password' => Hash::make('password')]);
    $user->passkeys()->create(['name' => 'Mac', 'credential_id' => 'Y3JlZC1h', 'credential' => storedCredential('cred-a')]);
    $token = login($user)->json('data.confirmation_token');

    $this->postJson('/auth/login/passkey/options', ['confirmation_token' => $token])
        ->assertOk()
        ->assertJsonStructure(['data' => ['options' => ['challenge']]]);
    $this->postJson('/auth/login/passkey', ['confirmation_token' => $token, 'response' => ['id' => 'cred-a']])->assertStatus(400);
    $this->assertGuest();
});

test('a totp step does not accept the passkey endpoint and vice versa', function () {
    $user = User::factory()->create(['use_totp' => true, 'password' => Hash::make('password')]);
    $user->passkeys()->create(['name' => 'Mac', 'credential_id' => 'Y3JlZC1h', 'credential' => storedCredential('cred-a')]);
    $response = login($user)->assertJsonPath('data.step', 'totp');
    $token = $response->json('data.confirmation_token');

    $this->postJson('/auth/login/passkey/options', ['confirmation_token' => $token])->assertStatus(400);
});

function fakeGoogle(?array $identity): void
{
    config()->set('services.google.client_id', 'test-client.apps.googleusercontent.com');
    app()->instance(GoogleIdTokenVerifier::class, new class($identity) extends GoogleIdTokenVerifier
    {
        public function __construct(private readonly ?array $identity) {}

        public function enabled(): bool
        {
            return true;
        }

        public function verify(string $idToken): ?array
        {
            return $this->identity;
        }
    });
}

test('google sign in links an existing account by verified email and signs in', function () {
    $user = User::factory()->create(['email' => 'staff@example.com', 'use_totp' => false]);
    fakeGoogle(['sub' => '1234567890', 'email' => 'staff@example.com', 'name' => 'Staff']);

    $this->postJson('/auth/login/google', ['credential' => str_repeat('a', 40)])
        ->assertOk()
        ->assertJsonPath('data.complete', true);

    expect($user->refresh()->google_id)->toBe('1234567890');
    $this->assertAuthenticatedAs($user);
});

test('google sign in still requires the authenticator step', function () {
    User::factory()->create(['email' => 'staff@example.com', 'use_totp' => true]);
    fakeGoogle(['sub' => '1234567890', 'email' => 'staff@example.com', 'name' => null]);

    $this->postJson('/auth/login/google', ['credential' => str_repeat('a', 40)])
        ->assertOk()
        ->assertJsonPath('data.complete', false)
        ->assertJsonPath('data.step', 'totp');
    $this->assertGuest();
});

test('google sign in never creates accounts or hijacks another google identity', function () {
    fakeGoogle(['sub' => '999', 'email' => 'nobody@example.com', 'name' => null]);
    $this->postJson('/auth/login/google', ['credential' => str_repeat('a', 40)])->assertStatus(400);
    expect(User::query()->where('email', 'nobody@example.com')->exists())->toBeFalse();

    $user = User::factory()->create(['email' => 'taken@example.com']);
    $user->forceFill(['google_id' => 'original'])->save();
    fakeGoogle(['sub' => 'attacker', 'email' => 'taken@example.com', 'name' => null]);
    $this->postJson('/auth/login/google', ['credential' => str_repeat('a', 40)])->assertStatus(400);
    $this->assertGuest();
    expect($user->refresh()->google_id)->toBe('original');
});

test('google sign in fails when the token does not verify', function () {
    User::factory()->create(['email' => 'staff@example.com']);
    fakeGoogle(null);

    $this->postJson('/auth/login/google', ['credential' => str_repeat('a', 40)])->assertStatus(400);
    $this->assertGuest();
});

function fakeDiscord(?array $identity): void
{
    config()->set('services.discord.client_id', 'discord-client');
    config()->set('services.discord.client_secret', 'discord-secret');
    app()->instance(\Pterodactyl\Services\Auth\DiscordOAuthClient::class, new class($identity) extends \Pterodactyl\Services\Auth\DiscordOAuthClient
    {
        public function __construct(private readonly ?array $identity) {}

        public function enabled(): bool
        {
            return true;
        }

        public function identify(string $code, string $redirectUri): ?array
        {
            return $this->identity === null ? null : $this->identity + ['access_token' => 'discord-token'];
        }

        public function canJoinGuild(): bool
        {
            return (string) config('services.discord.guild_id') !== '';
        }

        public function joinGuild(string $discordId, string $accessToken): bool
        {
            $GLOBALS['discord_joined'][] = [$discordId, $accessToken];

            return true;
        }
    });
}

test('discord sign in redirects to discord and rejects a callback with a bad state', function () {
    fakeDiscord(['id' => '1', 'email' => 'staff@example.com', 'name' => null]);

    $this->get('/auth/login/discord')->assertRedirectContains('https://discord.com/oauth2/authorize');
    $this->get('/auth/login/discord/callback?code=abc&state=wrong')->assertRedirectContains('/auth/login#error=');
    $this->assertGuest();
});

test('discord sign in links an existing account by verified email and signs in', function () {
    $user = User::factory()->create(['email' => 'staff@example.com', 'use_totp' => false]);
    fakeDiscord(['id' => '4242', 'email' => 'staff@example.com', 'name' => 'Staff']);

    $this->get('/auth/login/discord');
    $state = session('discord_oauth_state');
    $this->get('/auth/login/discord/callback?code=abc&state=' . $state)->assertRedirect();

    expect($user->refresh()->discord_id)->toBe('4242');
    $this->assertAuthenticatedAs($user);
});

test('discord sign in never hijacks another discord identity or signs up when registration is off', function () {
    config()->set('services.discord.registration', false);
    fakeDiscord(['id' => '999', 'email' => 'nobody@example.com', 'name' => null]);
    $this->get('/auth/login/discord');
    $this->get('/auth/login/discord/callback?code=abc&state=' . session('discord_oauth_state'))->assertRedirectContains('#error=');
    expect(User::query()->where('email', 'nobody@example.com')->exists())->toBeFalse();

    $user = User::factory()->create(['email' => 'taken@example.com']);
    $user->forceFill(['discord_id' => 'original'])->save();
    fakeDiscord(['id' => 'attacker', 'email' => 'taken@example.com', 'name' => null]);
    $this->get('/auth/login/discord');
    $this->get('/auth/login/discord/callback?code=abc&state=' . session('discord_oauth_state'))->assertRedirectContains('#error=');
    expect($user->refresh()->discord_id)->toBe('original');
    $this->assertGuest();
});

test('discord sign in with no matching account asks to confirm, then creates one', function () {
    fakeDiscord(['id' => '777', 'email' => 'new@example.com', 'name' => 'Newbie']);

    $this->get('/auth/login/discord');
    $this->get('/auth/login/discord/callback?code=abc&state=' . session('discord_oauth_state'))
        ->assertRedirectContains('#discord_new=');
    $this->assertGuest();
    expect(User::query()->where('email', 'new@example.com')->exists())->toBeFalse();

    $this->postJson('/auth/login/discord/register')->assertOk()->assertJsonPath('data.complete', true);

    $user = User::query()->where('email', 'new@example.com')->firstOrFail();
    expect($user->discord_id)->toBe('777')->and($user->username)->toBe('newbie');
    $this->assertAuthenticatedAs($user);
});

test('discord registration needs a confirmed identity and can be disabled', function () {
    $this->postJson('/auth/login/discord/register')->assertStatus(400);

    config()->set('services.discord.registration', false);
    fakeDiscord(['id' => '778', 'email' => 'new2@example.com', 'name' => null]);
    $this->get('/auth/login/discord');
    $this->get('/auth/login/discord/callback?code=abc&state=' . session('discord_oauth_state'))->assertRedirectContains('#error=');
    expect(User::query()->where('email', 'new2@example.com')->exists())->toBeFalse();
});

test('a first discord sign in offers the server, and only joins after the extra consent', function () {
    config()->set('services.discord.guild_id', '555');
    $GLOBALS['discord_joined'] = [];
    $user = User::factory()->create(['email' => 'staff@example.com', 'use_totp' => false]);
    fakeDiscord(['id' => '4242', 'email' => 'staff@example.com', 'name' => 'Staff']);

    $this->get('/auth/login/discord');
    $this->get('/auth/login/discord/callback?code=abc&state=' . session('discord_oauth_state'))
        ->assertRedirectContains('#discord_join=1');
    $this->assertGuest();

    // Accepting sends the person back through Discord for the extra permission.
    $this->postJson('/auth/login/discord/register', ['join' => true])->assertOk()
        ->assertJsonPath('data.join_url', '/auth/login/discord?join=1');
    $this->get('/auth/login/discord?join=1')->assertRedirectContains('guilds.join');
    $this->get('/auth/login/discord/callback?code=abc&state=' . session('discord_oauth_state'))->assertRedirect();

    expect($GLOBALS['discord_joined'])->toBe([['4242', 'discord-token']])
        ->and($user->refresh()->discord_join_prompted_at)->not->toBeNull();
    $this->assertAuthenticatedAs($user);
});

test('declining the discord server offer signs in without joining, and the offer is not repeated', function () {
    config()->set('services.discord.guild_id', '555');
    $GLOBALS['discord_joined'] = [];
    $user = User::factory()->create(['email' => 'staff@example.com', 'use_totp' => false]);
    fakeDiscord(['id' => '4242', 'email' => 'staff@example.com', 'name' => 'Staff']);

    $this->get('/auth/login/discord');
    $this->get('/auth/login/discord/callback?code=abc&state=' . session('discord_oauth_state'));
    $this->postJson('/auth/login/discord/register', ['join' => false])->assertOk()->assertJsonPath('data.complete', true);

    expect($GLOBALS['discord_joined'])->toBe([])->and($user->refresh()->discord_join_prompted_at)->not->toBeNull();

    $this->post('/auth/logout');
    $this->get('/auth/login/discord');
    $location = $this->get('/auth/login/discord/callback?code=abc&state=' . session('discord_oauth_state'))->headers->get('Location');
    expect($location)->not->toContain('discord_join');
    $this->assertAuthenticatedAs($user);
});

test('the discord server consent cannot be requested without a pending sign in', function () {
    config()->set('services.discord.guild_id', '555');
    fakeDiscord(['id' => '1', 'email' => 'x@example.com', 'name' => null]);

    expect($this->get('/auth/login/discord?join=1')->headers->get('Location'))->not->toContain('guilds.join');
});
