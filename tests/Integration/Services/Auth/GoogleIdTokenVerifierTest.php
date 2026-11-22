<?php

declare(strict_types=1);

namespace Pterodactyl\Tests\Pest\Integration\Services\Auth\GoogleIdTokenVerifierTest;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Lcobucci\JWT\Encoding\ChainedFormatter;
use Lcobucci\JWT\Encoding\JoseEncoder;
use Lcobucci\JWT\Signer\Key\InMemory;
use Lcobucci\JWT\Signer\Rsa\Sha256;
use Lcobucci\JWT\Token\Builder;
use phpseclib3\Crypt\RSA;
use Pterodactyl\Services\Auth\GoogleIdTokenVerifier;
use Pterodactyl\Tests\Integration\Http\HttpTestCase;

uses(HttpTestCase::class);

const AUDIENCE = 'astrelyse-test.apps.googleusercontent.com';

/**
 * @param  array<string, mixed>  $claims
 */
function token(RSA\PrivateKey $key, array $claims = [], string $kid = 'key-1'): string
{
    $builder = (new Builder(new JoseEncoder(), ChainedFormatter::withUnixTimestampDates()))
        ->issuedBy($claims['iss'] ?? 'https://accounts.google.com')
        ->permittedFor($claims['aud'] ?? AUDIENCE)
        ->relatedTo('1234567890')
        ->issuedAt(CarbonImmutable::now()->subMinute())
        ->expiresAt($claims['exp'] ?? CarbonImmutable::now()->addHour())
        ->withHeader('kid', $kid)
        ->withClaim('email', 'staff@example.com')
        ->withClaim('email_verified', $claims['email_verified'] ?? true)
        ->withClaim('name', 'Staff Member');

    return $builder->getToken(new Sha256(), InMemory::plainText((string) $key->toString('PKCS8')))->toString();
}

function tampered(RSA\PrivateKey $key): string
{
    [$header, , $signature] = explode('.', token($key));
    $forged = mb_rtrim(strtr(base64_encode((string) json_encode(['sub' => 'attacker', 'email' => 'staff@example.com', 'email_verified' => true, 'iss' => 'https://accounts.google.com', 'aud' => AUDIENCE, 'exp' => time() + 3600])), '+/', '-_'), '=');

    return $header.'.'.$forged.'.'.$signature;
}

beforeEach(function () {
    Cache::flush();
    config()->set('services.google.client_id', AUDIENCE);
    $this->key = RSA::createKey(2048);
    $jwk = json_decode((string) $this->key->getPublicKey()->toString('JWK'), true)['keys'][0];
    Http::fake(['www.googleapis.com/oauth2/v3/certs' => Http::response(['keys' => [$jwk + ['kid' => 'key-1', 'use' => 'sig', 'alg' => 'RS256']]])]);
    $this->verifier = app(GoogleIdTokenVerifier::class);
});

test('a valid token yields the verified identity', function () {
    expect($this->verifier->verify(token($this->key)))->toBe(['sub' => '1234567890', 'email' => 'staff@example.com', 'name' => 'Staff Member']);
});

test('tokens that fail any check are rejected', function (string $case) {
    $other = RSA::createKey(2048);
    $jwt = match ($case) {
        'wrong signer' => token($other),
        'wrong audience' => token($this->key, ['aud' => 'someone-else.apps.googleusercontent.com']),
        'wrong issuer' => token($this->key, ['iss' => 'https://evil.example.com']),
        'expired' => token($this->key, ['exp' => CarbonImmutable::now()->subMinutes(5)]),
        'unverified email' => token($this->key, ['email_verified' => false]),
        'unknown key id' => token($this->key, [], 'key-404'),
        'garbage' => 'not.a.jwt',
        'tampered' => tampered($this->key),
    };

    expect($this->verifier->verify($jwt))->toBeNull();
})->with(['wrong signer', 'wrong audience', 'wrong issuer', 'expired', 'unverified email', 'unknown key id', 'garbage', 'tampered']);

test('nothing verifies when google sign in is not configured', function () {
    config()->set('services.google.client_id', '');

    expect($this->verifier->enabled())->toBeFalse()
        ->and($this->verifier->verify(token($this->key)))->toBeNull();
});
