<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Controllers\Api\Client;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Hash;
use Knuckles\Scribe\Attributes\BodyParam;
use Knuckles\Scribe\Attributes\Endpoint;
use Knuckles\Scribe\Attributes\Group;
use Knuckles\Scribe\Attributes\Response as ScribeResponse;
use Knuckles\Scribe\Attributes\Subgroup;
use Pterodactyl\Exceptions\Http\Base\InvalidPasswordProvidedException;
use Pterodactyl\Models\UserPasskey;
use Pterodactyl\Services\Passkeys\PasskeyService;
use Symfony\Component\HttpKernel\Exception\BadRequestHttpException;

#[Group('Client API', 'Endpoints authenticated as a panel user using a client API token.')]
#[Subgroup('Passkeys', 'Manage the passkeys used as an extra sign-in step for the authenticated user.')]
class PasskeyController extends ClientApiController
{
    private const array PASSKEY_EXAMPLE = [
        'id' => 1,
        'name' => 'MacBook',
        'created_at' => '2026-11-18T12:00:00+00:00',
        'last_used_at' => null,
    ];

    private const array OPTIONS_EXAMPLE = [
        'data' => [
            'options' => [
                'rp' => ['name' => 'Astrelyse', 'id' => 'panel.example.com'],
                'user' => ['name' => 'user@example.com', 'id' => '9a8b7c6d-5e4f-4321-9876-123456789abc', 'displayName' => 'user'],
                'challenge' => 'dGVzdC1jaGFsbGVuZ2U',
                'pubKeyCredParams' => [['type' => 'public-key', 'alg' => -7]],
                'timeout' => 60000,
                'attestation' => 'none',
            ],
        ],
    ];

    #[Endpoint('List passkeys', 'Lists the passkeys registered on the authenticated account.')]
    #[ScribeResponse(['data' => [self::PASSKEY_EXAMPLE]], description: 'The passkeys registered on the account.')]
    public function index(Request $request): JsonResponse
    {
        $user = $this->authenticatedUser($request);

        return new JsonResponse([
            'data' => $user->passkeys()->orderBy('created_at')->get()->map(fn (UserPasskey $passkey): array => $this->present($passkey))->all(),
        ]);
    }

    #[Endpoint('Begin passkey registration', 'Returns WebAuthn creation options for registering a new passkey.')]
    #[ScribeResponse(self::OPTIONS_EXAMPLE, description: 'WebAuthn creation options to pass to the browser.')]
    public function options(Request $request, PasskeyService $passkeys): JsonResponse
    {
        return new JsonResponse(['data' => ['options' => $passkeys->beginRegistration($this->authenticatedUser($request), $request)]]);
    }

    #[Endpoint('Register a passkey', 'Verifies the browser attestation and stores the new passkey.')]
    #[BodyParam('response', 'object', 'The WebAuthn attestation produced by the browser.', required: true)]
    #[BodyParam('name', 'string', 'A name to recognise the passkey by.', required: true, example: 'MacBook')]
    #[ScribeResponse(['data' => self::PASSKEY_EXAMPLE], status: 201, description: 'The passkey was registered.')]
    public function store(Request $request, PasskeyService $passkeys): JsonResponse
    {
        $request->validate([
            'response' => ['required', 'array'],
            'name' => ['required', 'string', 'max:60'],
        ]);

        $passkey = $passkeys->finishRegistration(
            $this->authenticatedUser($request),
            $request,
            $request->array('response'),
            $request->string('name')->toString(),
        );
        throw_unless($passkey instanceof UserPasskey, BadRequestHttpException::class, 'That passkey could not be added. Try again.');

        return new JsonResponse(['data' => $this->present($passkey)], Response::HTTP_CREATED);
    }

    #[Endpoint('Remove a passkey', 'Removes a passkey from the authenticated account after verifying the account password.')]
    #[BodyParam('password', 'string', 'The current account password.', required: true, example: 'current-password')]
    #[ScribeResponse(status: 204, description: 'The passkey was removed.')]
    public function delete(Request $request, int $id): JsonResponse
    {
        $user = $this->authenticatedUser($request);
        $request->validate(['password' => ['required', 'string']]);
        throw_unless(Hash::check($request->string('password')->toString(), $user->password), InvalidPasswordProvidedException::class, trans('validation.internal.invalid_password'));

        $user->passkeys()->whereKey($id)->firstOrFail()->delete();

        return new JsonResponse([], Response::HTTP_NO_CONTENT);
    }

    /**
     * @return array{id: int, name: string, created_at: string, last_used_at: string|null}
     */
    private function present(UserPasskey $passkey): array
    {
        return [
            'id' => $passkey->id,
            'name' => $passkey->name,
            'created_at' => $passkey->created_at->toIso8601String(),
            'last_used_at' => $passkey->last_used_at?->toIso8601String(),
        ];
    }
}
