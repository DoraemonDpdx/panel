<?php

declare(strict_types=1);

namespace Pterodactyl\Services\Auth;

use Carbon\FactoryImmutable;
use Illuminate\Contracts\Cache\Repository as Cache;
use Illuminate\Http\Client\Factory as Http;
use Lcobucci\JWT\Encoding\JoseEncoder;
use Lcobucci\JWT\Signer\Key\InMemory;
use Lcobucci\JWT\Signer\Rsa\Sha256;
use Lcobucci\JWT\Token\Parser;
use Lcobucci\JWT\UnencryptedToken;
use Lcobucci\JWT\Validation\Constraint\LooseValidAt;
use Lcobucci\JWT\Validation\Constraint\PermittedFor;
use Lcobucci\JWT\Validation\Constraint\SignedWith;
use Lcobucci\JWT\Validation\Validator;
use phpseclib3\Crypt\PublicKeyLoader;
use phpseclib3\Crypt\RSA\PublicKey;
use Throwable;

/**
 * Verifies a Google Identity Services ID token (signature against Google's
 * published keys, issuer, audience and expiry) and returns its identity.
 */
class GoogleIdTokenVerifier
{
    private const string CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

    private const array ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

    public function __construct(private readonly Http $http, private readonly Cache $cache) {}

    public function enabled(): bool
    {
        return (string) config('services.google.client_id') !== '';
    }

    /**
     * @return array{sub: string, email: string, name: string|null}|null
     */
    public function verify(string $idToken): ?array
    {
        $audience = (string) config('services.google.client_id');
        if ($audience === '') {
            return null;
        }

        if ($idToken === '') {
            return null;
        }

        try {
            $token = (new Parser(new JoseEncoder()))->parse($idToken);
            if (! $token instanceof UnencryptedToken) {
                return null;
            }

            $kid = $token->headers()->get('kid');
            $key = is_string($kid) ? ($this->keys()[$kid] ?? '') : '';
            if ($key === '') {
                return null;
            }

            $valid = (new Validator())->validate(
                $token,
                new SignedWith(new Sha256(), InMemory::plainText($key)),
                new PermittedFor($audience),
                new LooseValidAt(FactoryImmutable::getDefaultInstance()),
            );
            $claims = $token->claims();
            if (! $valid || ! in_array($claims->get('iss'), self::ISSUERS, true)) {
                return null;
            }
            if ($claims->get('email_verified') !== true || ! is_string($claims->get('email')) || ! is_string($claims->get('sub'))) {
                return null;
            }

            $name = $claims->get('name');

            return ['sub' => $claims->get('sub'), 'email' => $claims->get('email'), 'name' => is_string($name) ? $name : null];
        } catch (Throwable) {
            return null;
        }
    }

    /**
     * @return array<string, string> PEM public keys indexed by key id
     */
    private function keys(): array
    {
        return $this->cache->remember('google:oauth:certs', 3600, fn (): array => $this->fetchKeys());
    }

    /**
     * @return array<string, string>
     */
    private function fetchKeys(): array
    {
        $jwks = $this->http->timeout(5)->get(self::CERTS_URL)->throw()->json('keys');

        $keys = [];
        foreach (is_array($jwks) ? $jwks : [] as $jwk) {
            if (! is_array($jwk) || ($jwk['kty'] ?? null) !== 'RSA' || ! is_string($jwk['kid'] ?? null)) {
                continue;
            }

            $public = PublicKeyLoader::load(json_encode($jwk, JSON_THROW_ON_ERROR));
            $pem = $public instanceof PublicKey ? $public->toString('PKCS8') : null;
            if (is_string($pem) && $pem !== '') {
                $keys[$jwk['kid']] = $pem;
            }
        }

        return $keys;
    }
}
