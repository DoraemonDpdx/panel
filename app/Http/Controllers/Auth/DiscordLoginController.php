<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Controllers\Auth;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Knuckles\Scribe\Attributes\BodyParam;
use Knuckles\Scribe\Attributes\Endpoint;
use Knuckles\Scribe\Attributes\Group;
use Knuckles\Scribe\Attributes\Response as ScribeResponse;
use Knuckles\Scribe\Attributes\Unauthenticated;
use Pterodactyl\Contracts\Users\CompletesLogins;
use Pterodactyl\Contracts\Users\CreatesUsers;
use Pterodactyl\Data\LoginResult;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Models\User;
use Pterodactyl\Services\Auth\DiscordOAuthClient;

/**
 * "Continue with Discord". The verified Discord email is matched to a panel user, which is
 * then linked; with no match the person may confirm creating an account. Two-factor and
 * passkey steps still apply. On a first Discord sign-in the person is also offered to join
 * our Discord server: only if they accept is a second consent (`guilds.join`) requested and
 * the bot adds them. The browser is sent back to the sign-in screen with the outcome in the
 * URL fragment, which is never sent to a server or logged.
 */
#[Group('Authentication', 'Browser session authentication endpoints used by the panel frontend.', authenticated: false)]
class DiscordLoginController extends AbstractLoginController
{
    private const string STATE_KEY = 'discord_oauth_state';

    private const string JOIN_KEY = 'discord_oauth_join';

    private const string PENDING_KEY = 'discord_pending';

    private const array LOGIN_COMPLETE_EXAMPLE = [
        'data' => [
            'complete' => false,
            'confirmation_token' => 'b6e22f85d63c4d9db9739f9ab0a27a48f51f7ad38ef8c12fd157c4c6f4b2e51d',
            'step' => 'totp',
            'join_url' => null,
        ],
    ];

    public function redirect(Request $request, DiscordOAuthClient $discord): RedirectResponse
    {
        if (! $discord->enabled()) {
            return $this->back('error='.rawurlencode('Discord sign-in is not configured.'));
        }

        // The server-join consent is only requested for someone who already accepted the offer.
        $join = $request->boolean('join') && $discord->canJoinGuild() && is_array($request->session()->get(self::PENDING_KEY));

        $state = Str::random(40);
        $request->session()->put(self::STATE_KEY, $state);
        $request->session()->put(self::JOIN_KEY, $join);

        return redirect()->away($discord->authorizeUrl(route('auth.login-discord-callback'), $state, $join));
    }

    public function callback(Request $request, CompletesLogins $logins, DiscordOAuthClient $discord): RedirectResponse
    {
        $expected = $request->session()->pull(self::STATE_KEY);
        $join = (bool) $request->session()->pull(self::JOIN_KEY, false);
        $state = $request->query('state');

        if (! is_string($expected) || ! is_string($state) || ! hash_equals($expected, $state) || ! $request->query('code')) {
            return $this->back('error='.rawurlencode('Discord sign-in was cancelled or expired. Please try again.'));
        }

        if ($this->hasTooManyLoginAttempts($request)) {
            return $this->back('error='.rawurlencode('Too many sign-in attempts. Please try again later.'));
        }

        $identity = $discord->identify((string) $request->query('code'), route('auth.login-discord-callback'));

        if ($join) {
            return $this->finishJoin($request, $logins, $discord, $identity);
        }

        $user = $identity === null ? null : $this->resolveUser($identity);
        $canRegister = $identity !== null && ! $user instanceof User && config('services.discord.registration', true)
            && ! User::query()->where('email', mb_strtolower($identity['email']))->exists();

        if (! $user instanceof User && ! $canRegister) {
            $this->incrementLoginAttempts($request);
            $this->fireFailedLoginEvent(null, ['email' => $identity['email'] ?? 'discord']);

            return $this->back('error='.rawurlencode('Discord sign-in could not be verified for any panel account.'));
        }

        $this->clearLoginAttempts($request);
        $offerJoin = $discord->canJoinGuild() && (! $user instanceof User || $user->discord_join_prompted_at === null);

        if ($user instanceof User && ! $offerJoin) {
            return $this->respond($logins->complete($user));
        }

        // Hold the verified identity until the person answers the on-page question(s).
        $request->session()->put(self::PENDING_KEY, [
            'id' => $identity['id'],
            'email' => $identity['email'],
            'name' => $identity['name'],
            'user_id' => $user?->getKey(),
        ]);

        return $this->back(http_build_query(array_filter([
            'discord_new' => $user instanceof User ? null : $identity['email'],
            'discord_join' => $offerJoin ? '1' : null,
        ])));
    }

    /**
     * The person's answer to "create an account?" and/or "join our server?". Joining continues through
     * a second Discord consent screen; anything else completes the sign-in right away.
     */
    #[Unauthenticated]
    #[Endpoint('Continue a Discord sign-in', 'Creates the panel account for a confirmed Discord identity when none exists, and either completes the login or returns the Discord URL that asks for server-join consent.')]
    #[BodyParam('join', 'boolean', 'Whether the person accepted the one-time offer to join the Discord server.', required: false, example: false)]
    #[ScribeResponse(self::LOGIN_COMPLETE_EXAMPLE, description: 'The account was created and the session established, or a checkpoint is required, or `join_url` points at the Discord consent screen.')]
    public function register(Request $request, CreatesUsers $users, CompletesLogins $logins, DiscordOAuthClient $discord): JsonResponse
    {
        $pending = $request->session()->get(self::PENDING_KEY);
        if (! is_array($pending)) {
            throw new DisplayException('Discord sign-up expired. Please start again.');
        }

        $user = $pending['user_id'] !== null ? User::query()->find($pending['user_id']) : null;
        if (! $user instanceof User) {
            if (! config('services.discord.registration', true)) {
                throw new DisplayException('Discord sign-up expired. Please start again.');
            }

            $user = $users->create([
                'email' => mb_strtolower($pending['email']),
                'username' => $this->freshUsername($pending['name'] ?? null),
                'name_first' => mb_substr($pending['name'] ?? 'Discord', 0, 191) ?: 'Discord',
                'name_last' => 'User',
            ]);
            $user->forceFill(['discord_id' => $pending['id']])->save();
            $request->session()->put(self::PENDING_KEY, [...$pending, 'user_id' => $user->getKey()]);
        }

        if ($request->boolean('join') && $discord->canJoinGuild()) {
            return new JsonResponse(['data' => ['complete' => false, 'join_url' => '/auth/login/discord?join=1']]);
        }

        $request->session()->forget(self::PENDING_KEY);
        $user->forceFill(['discord_join_prompted_at' => now()])->save();

        return $this->sendLoginResponse($logins->complete($user), $request);
    }

    /**
     * @param  array{id: string, email: string, name: string|null, access_token: string}|null  $identity
     */
    private function finishJoin(Request $request, CompletesLogins $logins, DiscordOAuthClient $discord, ?array $identity): RedirectResponse
    {
        $pending = $request->session()->pull(self::PENDING_KEY);
        $user = is_array($pending) && $identity !== null && $pending['id'] === $identity['id']
            ? User::query()->find($pending['user_id'])
            : null;

        if (! $user instanceof User) {
            return $this->back('error='.rawurlencode('Discord sign-in was cancelled or expired. Please try again.'));
        }

        $user->forceFill(['discord_join_prompted_at' => now()])->save();
        $joined = $discord->joinGuild($identity['id'], $identity['access_token']);
        $result = $logins->complete($user);

        if ($result->complete) {
            return redirect()->to($result->intended !== '' ? $result->intended : '/');
        }

        return $this->back(http_build_query(array_filter([
            'discord_token' => $result->confirmationToken,
            'step' => $result->step,
            'discord_join_failed' => $joined ? null : '1',
        ])));
    }

    private function respond(LoginResult $result): RedirectResponse
    {
        if ($result->complete) {
            return redirect()->to($result->intended !== '' ? $result->intended : '/');
        }

        return $this->back(http_build_query(array_filter([
            'discord_token' => $result->confirmationToken,
            'step' => $result->step,
        ])));
    }

    private function freshUsername(?string $name): string
    {
        $base = Str::of($name ?? '')->lower()->replaceMatches('/[^a-z0-9]+/', '')->limit(20, '')->toString() ?: 'user';
        $username = $base;
        while (User::query()->where('username', $username)->exists()) {
            $username = $base.random_int(100, 99999);
        }

        return $username;
    }

    /**
     * @param  array{id: string, email: string, name: string|null}  $identity
     */
    private function resolveUser(array $identity): ?User
    {
        $user = User::query()->where('discord_id', $identity['id'])->first();
        if ($user instanceof User) {
            return $user;
        }

        $user = User::query()->where('email', mb_strtolower($identity['email']))->first();
        // Never relink an account that already belongs to a different Discord identity.
        if (! $user instanceof User || ($user->discord_id !== null && $user->discord_id !== $identity['id'])) {
            return null;
        }

        $user->forceFill(['discord_id' => $identity['id']])->save();

        return $user;
    }

    private function back(string $fragment): RedirectResponse
    {
        return redirect()->to('/auth/login#'.$fragment);
    }
}
