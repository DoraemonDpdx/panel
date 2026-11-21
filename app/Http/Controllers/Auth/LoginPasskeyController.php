<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Controllers\Auth;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Event;
use Illuminate\Validation\ValidationException;
use Knuckles\Scribe\Attributes\BodyParam;
use Knuckles\Scribe\Attributes\Endpoint;
use Knuckles\Scribe\Attributes\Group;
use Knuckles\Scribe\Attributes\Response as ScribeResponse;
use Knuckles\Scribe\Attributes\Unauthenticated;
use Pterodactyl\Contracts\Users\CompletesLogins;
use Pterodactyl\Data\LoginCheckpoint;
use Pterodactyl\Events\Auth\ProvidedAuthenticationToken;
use Pterodactyl\Models\User;
use Pterodactyl\Services\Passkeys\PasskeyService;

#[Group('Authentication', 'Browser session authentication endpoints used by the panel frontend.', authenticated: false)]
class LoginPasskeyController extends AbstractLoginController
{
    private const array OPTIONS_EXAMPLE = [
        'data' => [
            'options' => [
                'challenge' => 'dGVzdC1jaGFsbGVuZ2U',
                'rpId' => 'panel.example.com',
                'allowCredentials' => [['type' => 'public-key', 'id' => 'Y3JlZC1h']],
                'userVerification' => 'required',
                'timeout' => 60000,
            ],
        ],
    ];

    private const array LOGIN_COMPLETE_EXAMPLE = [
        'data' => [
            'complete' => true,
            'intended' => '/',
            'user' => [
                'uuid' => '9a8b7c6d-5e4f-4321-9876-123456789abc',
                'username' => 'admin',
                'email' => 'admin@example.com',
                'name_first' => 'Admin',
                'name_last' => 'User',
                'language' => 'en',
                'root_admin' => true,
                'use_totp' => true,
                'created_at' => '2026-06-29T12:00:00+00:00',
                'updated_at' => '2026-06-29T12:00:00+00:00',
                'identifier' => 'usr_1a2b3c4d',
            ],
        ],
    ];

    /**
     * Start the passkey step of a sign-in that is waiting on one.
     *
     * @throws ValidationException
     */
    #[Unauthenticated]
    #[Endpoint('Begin passkey login step', 'Returns WebAuthn request options for the passkey step of a pending login checkpoint.')]
    #[BodyParam('confirmation_token', 'string', 'The confirmation token returned by the previous login step.', required: true, example: 'b6e22f85d63c4d9db9739f9ab0a27a48f51f7ad38ef8c12fd157c4c6f4b2e51d')]
    #[ScribeResponse(self::OPTIONS_EXAMPLE, description: 'WebAuthn request options to pass to the browser.')]
    public function options(Request $request, CompletesLogins $logins, PasskeyService $passkeys): JsonResponse
    {
        $user = $this->resolveUser($request, $logins);

        return new JsonResponse(['data' => ['options' => $passkeys->beginAuthentication($user, $request)]]);
    }

    /**
     * Verify the passkey assertion and finish signing in.
     *
     * @throws ValidationException
     */
    #[Unauthenticated]
    #[Endpoint('Complete passkey login step', 'Verifies a WebAuthn assertion for a pending login checkpoint and completes the login.')]
    #[BodyParam('confirmation_token', 'string', 'The confirmation token returned by the previous login step.', required: true, example: 'b6e22f85d63c4d9db9739f9ab0a27a48f51f7ad38ef8c12fd157c4c6f4b2e51d')]
    #[BodyParam('response', 'object', 'The WebAuthn assertion produced by the browser.', required: true)]
    #[ScribeResponse(self::LOGIN_COMPLETE_EXAMPLE, description: 'Login completed and a browser session was created.')]
    public function verify(Request $request, CompletesLogins $logins, PasskeyService $passkeys): JsonResponse
    {
        $request->validate(['response' => ['required', 'array']]);
        $user = $this->resolveUser($request, $logins);

        if (! $passkeys->finishAuthentication($user, $request, $request->array('response')) instanceof \Pterodactyl\Models\UserPasskey) {
            $this->sendFailedLoginResponse($request, $user, 'That passkey did not work. Try again, or use another one.');
        }

        Event::dispatch(new ProvidedAuthenticationToken($user));

        return $this->sendLoginResponse($logins->factorPassed($user, 'passkey'), $request);
    }

    private function resolveUser(Request $request, CompletesLogins $logins): User
    {
        $request->validate(['confirmation_token' => ['required', 'string']]);

        if ($this->hasTooManyLoginAttempts($request)) {
            $this->sendLockoutResponse($request);
        }

        $checkpoint = $logins->pendingCheckpoint();
        if (! $checkpoint instanceof LoginCheckpoint
            || ! $checkpoint->matches($request->string('confirmation_token')->toString())
            || $checkpoint->step() !== 'passkey') {
            $this->sendFailedLoginResponse($request, null, 'The authentication token provided has expired, please refresh the page and try again.');
        }

        $user = User::query()->find($checkpoint->userId);
        if (! $user instanceof User) {
            $this->sendFailedLoginResponse($request, null, 'The authentication token provided has expired, please refresh the page and try again.');
        }

        return $user;
    }
}
