<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Controllers\Auth;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Knuckles\Scribe\Attributes\BodyParam;
use Knuckles\Scribe\Attributes\Endpoint;
use Knuckles\Scribe\Attributes\Group;
use Knuckles\Scribe\Attributes\Response as ScribeResponse;
use Knuckles\Scribe\Attributes\Unauthenticated;
use Pterodactyl\Contracts\Users\CompletesLogins;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Models\User;
use Pterodactyl\Services\Auth\GoogleIdTokenVerifier;

#[Group('Authentication', 'Browser session authentication endpoints used by the panel frontend.', authenticated: false)]
class GoogleLoginController extends AbstractLoginController
{
    private const array LOGIN_CHECKPOINT_EXAMPLE = [
        'data' => [
            'complete' => false,
            'confirmation_token' => 'b6e22f85d63c4d9db9739f9ab0a27a48f51f7ad38ef8c12fd157c4c6f4b2e51d',
            'step' => 'totp',
        ],
    ];

    /**
     * Sign in with a Google ID token. Accounts are never created from Google: the
     * token's verified email must match an existing panel user, which is then
     * linked to the Google account. Two-factor and passkey steps still apply.
     *
     * @throws DisplayException
     */
    #[Unauthenticated]
    #[Endpoint('Login with Google', 'Authenticates with a Google Identity Services ID token. Returns a complete login payload or the next checkpoint step.')]
    #[BodyParam('credential', 'string', 'The Google ID token (JWT).', required: true, example: 'eyJhbGciOiJSUzI1NiIs...')]
    #[ScribeResponse(self::LOGIN_CHECKPOINT_EXAMPLE, description: 'A second factor (authenticator code or passkey) is required before login can complete.')]
    public function __invoke(Request $request, CompletesLogins $logins, GoogleIdTokenVerifier $google): JsonResponse
    {
        $request->validate(['credential' => ['required', 'string', 'min:20', 'max:8192']]);

        if (! $google->enabled()) {
            throw new DisplayException('Google sign-in is not configured.');
        }

        if ($this->hasTooManyLoginAttempts($request)) {
            $this->sendLockoutResponse($request);
        }

        $identity = $google->verify($request->string('credential')->toString());
        $user = $identity === null ? null : $this->resolveUser($identity);

        if (! $user instanceof User) {
            $this->incrementLoginAttempts($request);
            $this->fireFailedLoginEvent(null, ['email' => $identity['email'] ?? 'google']);

            throw new DisplayException('Google sign-in could not be verified for any panel account.');
        }

        $this->clearLoginAttempts($request);

        return $this->sendLoginResponse($logins->complete($user), $request);
    }

    /**
     * @param  array{sub: string, email: string, name: string|null}  $identity
     */
    private function resolveUser(array $identity): ?User
    {
        $user = User::query()->where('google_id', $identity['sub'])->first();
        if ($user instanceof User) {
            return $user;
        }

        $user = User::query()->where('email', mb_strtolower($identity['email']))->first();
        // Never relink an account that already belongs to a different Google identity.
        if (! $user instanceof User || ($user->google_id !== null && $user->google_id !== $identity['sub'])) {
            return null;
        }

        $user->forceFill(['google_id' => $identity['sub']])->save();

        return $user;
    }
}
