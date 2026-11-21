<?php

declare(strict_types=1);

namespace Pterodactyl\Data;

use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Support\Str;

/**
 * A login that has passed its first factor and is waiting for the account's
 * two-factor challenge to be answered within the same session.
 */
final readonly class LoginCheckpoint
{
    private const int LIFETIME_MINUTES = 5;

    public function __construct(
        public int $userId,
        public string $token,
        public CarbonInterface $expiresAt,
        public bool $totpPending = true,
        public bool $passkeyPending = false,
    ) {}

    public static function issue(int $userId, bool $totp = true, bool $passkey = false): self
    {
        return new self($userId, Str::random(64), CarbonImmutable::now()->addMinutes(self::LIFETIME_MINUTES), $totp, $passkey);
    }

    /**
     * Whether a value read back from the session is a checkpoint that can
     * still be confirmed. Anything else is treated as if none had been issued.
     *
     * @phpstan-assert-if-true self $value
     */
    public static function isPending(mixed $value): bool
    {
        return $value instanceof self && ! $value->expiresAt->isBefore(CarbonImmutable::now());
    }

    /**
     * The factor the login is waiting on right now: the authenticator code
     * first, then the passkey.
     */
    public function step(): string
    {
        return $this->totpPending ? 'totp' : 'passkey';
    }

    /**
     * A fresh checkpoint (new token, new lifetime) with the given factor
     * cleared, or null once nothing is left to confirm.
     */
    public function after(string $step): ?self
    {
        $totp = $this->totpPending && $step !== 'totp';
        $passkey = $this->passkeyPending && $step !== 'passkey';

        return $totp || $passkey ? self::issue($this->userId, $totp, $passkey) : null;
    }

    /** Compare a submitted confirmation token against this checkpoint in constant time. */
    public function matches(string $token): bool
    {
        return hash_equals($this->token, $token);
    }
}
