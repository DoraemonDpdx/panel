<?php

declare(strict_types=1);

namespace Pterodactyl\Services\Auth;

use Illuminate\Http\Client\Factory as Http;
use Throwable;

/**
 * Discord OAuth2 authorization-code flow: builds the authorize URL and trades a
 * code for the verified Discord identity (id and verified email).
 */
class DiscordOAuthClient
{
    private const string AUTHORIZE_URL = 'https://discord.com/oauth2/authorize';

    private const string API_URL = 'https://discord.com/api/v10';

    public function __construct(private readonly Http $http) {}

    public function enabled(): bool
    {
        return (string) config('services.discord.client_id') !== ''
            && (string) config('services.discord.client_secret') !== '';
    }

    /** Whether the bot can add people to the configured Discord server. */
    public function canJoinGuild(): bool
    {
        return $this->enabled()
            && (string) config('services.discord.bot_token') !== ''
            && (string) config('services.discord.guild_id') !== '';
    }

    /**
     * Add the person to the configured server with the bot, using the `guilds.join` token they granted.
     */
    public function joinGuild(string $discordId, string $accessToken): bool
    {
        if (! $this->canJoinGuild()) {
            return false;
        }

        try {
            $this->http->withHeaders(['Authorization' => 'Bot ' . config('services.discord.bot_token')])
                ->asJson()->timeout(10)
                ->put(self::API_URL . '/guilds/' . config('services.discord.guild_id') . '/members/' . $discordId, ['access_token' => $accessToken])
                ->throw();

            return true;
        } catch (Throwable) {
            return false;
        }
    }

    public function authorizeUrl(string $redirectUri, string $state, bool $join = false): string
    {
        return self::AUTHORIZE_URL . '?' . http_build_query([
            'client_id' => config('services.discord.client_id'),
            'redirect_uri' => $redirectUri,
            'response_type' => 'code',
            'scope' => $join ? 'identify email guilds.join' : 'identify email',
            'state' => $state,
            'prompt' => 'none',
        ]);
    }

    /**
     * @return array{id: string, email: string, name: string|null, access_token: string}|null
     */
    public function identify(string $code, string $redirectUri): ?array
    {
        if (! $this->enabled() || $code === '') {
            return null;
        }

        try {
            $token = $this->http->asForm()->timeout(10)->post(self::API_URL . '/oauth2/token', [
                'client_id' => config('services.discord.client_id'),
                'client_secret' => config('services.discord.client_secret'),
                'grant_type' => 'authorization_code',
                'code' => $code,
                'redirect_uri' => $redirectUri,
            ])->throw()->json('access_token');

            if (! is_string($token) || $token === '') {
                return null;
            }

            $me = $this->http->withToken($token)->timeout(10)->get(self::API_URL . '/users/@me')->throw()->json();
        } catch (Throwable) {
            return null;
        }

        if (! is_array($me) || ! is_string($me['id'] ?? null) || ! is_string($me['email'] ?? null) || ($me['verified'] ?? false) !== true) {
            return null;
        }

        $name = $me['global_name'] ?? $me['username'] ?? null;

        return ['id' => $me['id'], 'email' => $me['email'], 'name' => is_string($name) ? $name : null, 'access_token' => $token];
    }
}
