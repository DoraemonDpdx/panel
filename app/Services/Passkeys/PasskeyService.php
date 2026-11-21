<?php

declare(strict_types=1);

namespace Pterodactyl\Services\Passkeys;

use Illuminate\Contracts\Session\Session;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Pterodactyl\Models\User;
use Pterodactyl\Models\UserPasskey;
use Symfony\Component\Serializer\Encoder\JsonEncode;
use Symfony\Component\Serializer\Normalizer\AbstractObjectNormalizer;
use Symfony\Component\Serializer\SerializerInterface;
use Throwable;
use UnexpectedValueException;
use Webauthn\AttestationStatement\AttestationStatementSupportManager;
use Webauthn\AuthenticatorAssertionResponse;
use Webauthn\AuthenticatorAssertionResponseValidator;
use Webauthn\AuthenticatorAttestationResponse;
use Webauthn\AuthenticatorAttestationResponseValidator;
use Webauthn\AuthenticatorSelectionCriteria;
use Webauthn\CeremonyStep\CeremonyStepManagerFactory;
use Webauthn\CredentialRecord;
use Webauthn\Denormalizer\WebauthnSerializerFactory;
use Webauthn\PublicKeyCredential;
use Webauthn\PublicKeyCredentialCreationOptions;
use Webauthn\PublicKeyCredentialParameters;
use Webauthn\PublicKeyCredentialRequestOptions;
use Webauthn\PublicKeyCredentialRpEntity;
use Webauthn\PublicKeyCredentialUserEntity;

/**
 * Registers and verifies passkeys (WebAuthn credentials). Ceremony options are
 * kept in the server-side session, bound to a purpose and a user, and are
 * consumed on first use so a challenge can never be replayed.
 */
class PasskeyService
{
    private const string REGISTER_KEY = 'passkey_register_options';

    private const string LOGIN_KEY = 'passkey_login_options';

    private const int CHALLENGE_TTL_SECONDS = 300;

    private readonly SerializerInterface $serializer;

    public function __construct(private readonly Session $session)
    {
        $this->serializer = (new WebauthnSerializerFactory(AttestationStatementSupportManager::create()))->create();
    }

    /**
     * Build creation options for a user and remember them for the verify step.
     *
     * @return array<array-key, mixed>
     */
    public function beginRegistration(User $user, Request $request): array
    {
        $existing = $user->passkeys->map(fn (UserPasskey $passkey) => $this->record($passkey)->getPublicKeyCredentialDescriptor())->all();

        $options = PublicKeyCredentialCreationOptions::create(
            PublicKeyCredentialRpEntity::create((string) config('app.name', 'Astrelyse'), $request->getHost()),
            PublicKeyCredentialUserEntity::create($user->email, (string) $user->uuid, $user->username),
            random_bytes(32),
            [
                PublicKeyCredentialParameters::create('public-key', -7),
                PublicKeyCredentialParameters::create('public-key', -8),
                PublicKeyCredentialParameters::create('public-key', -257),
            ],
            authenticatorSelection: AuthenticatorSelectionCriteria::create(
                userVerification: AuthenticatorSelectionCriteria::USER_VERIFICATION_REQUIREMENT_REQUIRED,
                residentKey: AuthenticatorSelectionCriteria::RESIDENT_KEY_REQUIREMENT_PREFERRED,
            ),
            attestation: PublicKeyCredentialCreationOptions::ATTESTATION_CONVEYANCE_PREFERENCE_NONE,
            excludeCredentials: $existing,
            timeout: 60_000,
        );

        $this->stash(self::REGISTER_KEY, $user, $options);

        return $this->toArray($options);
    }

    /**
     * Verify the browser's response to the creation options and store the passkey.
     *
     * @param  array<array-key, mixed>  $response
     */
    public function finishRegistration(User $user, Request $request, array $response, string $name): ?UserPasskey
    {
        $options = $this->take(self::REGISTER_KEY, $user, PublicKeyCredentialCreationOptions::class);
        if (! $options instanceof PublicKeyCredentialCreationOptions) {
            return null;
        }

        try {
            $credential = $this->serializer->deserialize(json_encode($response, JSON_THROW_ON_ERROR), PublicKeyCredential::class, 'json');
            $attestation = $credential->response;
            if (! $attestation instanceof AuthenticatorAttestationResponse) {
                return null;
            }

            $record = AuthenticatorAttestationResponseValidator::create($this->ceremonies($request)->creationCeremony())
                ->check($attestation, $options, $request->getHost());
        } catch (Throwable) {
            return null;
        }

        $credentialId = $this->encodeId($record->publicKeyCredentialId);
        if (UserPasskey::query()->where('credential_id', $credentialId)->exists()) {
            return null;
        }

        return $user->passkeys()->create([
            'name' => Str::limit(mb_trim($name) !== '' ? mb_trim($name) : 'Passkey', 60, ''),
            'credential_id' => $credentialId,
            'credential' => $this->serializer->serialize($record, 'json'),
        ]);
    }

    /**
     * Build request options limited to the user's own passkeys.
     *
     * @return array<array-key, mixed>
     */
    public function beginAuthentication(User $user, Request $request): array
    {
        $options = PublicKeyCredentialRequestOptions::create(
            random_bytes(32),
            $request->getHost(),
            $user->passkeys->map(fn (UserPasskey $passkey) => $this->record($passkey)->getPublicKeyCredentialDescriptor())->all(),
            PublicKeyCredentialRequestOptions::USER_VERIFICATION_REQUIREMENT_REQUIRED,
            60_000,
        );

        $this->stash(self::LOGIN_KEY, $user, $options);

        return $this->toArray($options);
    }

    /**
     * Verify an assertion against one of the user's passkeys. Returns the
     * passkey that signed it, or null for any failure.
     *
     * @param  array<array-key, mixed>  $response
     */
    public function finishAuthentication(User $user, Request $request, array $response): ?UserPasskey
    {
        $options = $this->take(self::LOGIN_KEY, $user, PublicKeyCredentialRequestOptions::class);
        if (! $options instanceof PublicKeyCredentialRequestOptions) {
            return null;
        }

        try {
            $credential = $this->serializer->deserialize(json_encode($response, JSON_THROW_ON_ERROR), PublicKeyCredential::class, 'json');
            $assertion = $credential->response;
            if (! $assertion instanceof AuthenticatorAssertionResponse) {
                return null;
            }

            $passkey = $user->passkeys()->where('credential_id', $this->encodeId($credential->rawId))->first();
            if (! $passkey instanceof UserPasskey) {
                return null;
            }

            $updated = AuthenticatorAssertionResponseValidator::create($this->ceremonies($request)->requestCeremony())
                ->check($this->record($passkey), $assertion, $options, $request->getHost(), (string) $user->uuid);
        } catch (Throwable) {
            return null;
        }

        $passkey->forceFill([
            'credential' => $this->serializer->serialize($updated, 'json'),
            'last_used_at' => now(),
        ])->save();

        return $passkey;
    }

    private function ceremonies(Request $request): CeremonyStepManagerFactory
    {
        $factory = new CeremonyStepManagerFactory();
        $factory->setAllowedOrigins([$request->getSchemeAndHttpHost()]);
        $factory->setAttestationStatementSupportManager(AttestationStatementSupportManager::create());

        return $factory;
    }

    private function record(UserPasskey $passkey): CredentialRecord
    {
        return $this->serializer->deserialize($passkey->credential, CredentialRecord::class, 'json');
    }

    private function encodeId(string $raw): string
    {
        return mb_rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
    }

    /**
     * @return array<array-key, mixed>
     */
    private function toArray(PublicKeyCredentialCreationOptions|PublicKeyCredentialRequestOptions $options): array
    {
        $json = $this->serializer->serialize($options, 'json', [
            AbstractObjectNormalizer::SKIP_NULL_VALUES => true,
            JsonEncode::OPTIONS => JSON_THROW_ON_ERROR,
        ]);

        $decoded = json_decode($json, true, 512, JSON_THROW_ON_ERROR);
        throw_unless(is_array($decoded), UnexpectedValueException::class, 'WebAuthn options must serialize to an object.');

        return $decoded;
    }

    private function stash(string $key, User $user, PublicKeyCredentialCreationOptions|PublicKeyCredentialRequestOptions $options): void
    {
        $this->session->put($key, [
            'user' => $user->id,
            'expires' => time() + self::CHALLENGE_TTL_SECONDS,
            'options' => $this->serializer->serialize($options, 'json', [AbstractObjectNormalizer::SKIP_NULL_VALUES => true]),
        ]);
    }

    /**
     * @template T of object
     *
     * @param  class-string<T>  $class
     * @return T|null
     */
    private function take(string $key, User $user, string $class): ?object
    {
        $stored = $this->session->pull($key);
        if (! is_array($stored) || ($stored['user'] ?? null) !== $user->id || ($stored['expires'] ?? 0) < time() || ! is_string($stored['options'] ?? null)) {
            return null;
        }

        try {
            return $this->serializer->deserialize($stored['options'], $class, 'json');
        } catch (Throwable) {
            return null;
        }
    }
}
