<?php

declare(strict_types=1);

namespace Pterodactyl\Services\Servers\Mods;

use Closure;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Exceptions\Mods\ProviderUnavailableException;

/**
 * The HTTP side of the CurseForge Core API (https://docs.curseforge.com). Needs an API key from the admin settings.
 */
class CurseForgeApi
{
    public const string BASE_URL = 'https://api.curseforge.com/v1';

    public function available(): bool
    {
        return $this->apiKey() !== null;
    }

    /**
     * @param  array<string, int|string>  $params
     * @return array<string, mixed>
     */
    public function get(string $path, array $params = []): array
    {
        return $this->send(fn (PendingRequest $http): Response => $http->get($path, $params));
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    public function post(string $path, array $payload): array
    {
        return $this->send(fn (PendingRequest $http): Response => $http->post($path, $payload));
    }

    private function apiKey(): ?string
    {
        $key = config('curseforge.api_key');

        return is_string($key) && mb_trim($key) !== '' ? mb_trim($key) : null;
    }

    /**
     * @param  Closure(PendingRequest): Response  $request
     * @return array<string, mixed>
     */
    private function send(Closure $request): array
    {
        $key = $this->apiKey() ?? throw new ProviderUnavailableException('curseforge');

        try {
            $response = $request(Http::baseUrl(self::BASE_URL)->withHeaders(['x-api-key' => $key])->withUserAgent('astrelyse-panel/'.config('app.version'))->acceptJson()->timeout(10));
        } catch (ConnectionException) {
            throw new DisplayException('CurseForge is not responding right now. Please try again in a moment.');
        }

        if ($response->failed()) {
            throw new DisplayException(match ($response->status()) {
                404 => 'CurseForge could not find that project or file.',
                401, 403 => 'CurseForge rejected the panel\'s API key. Ask an administrator to check it.',
                default => 'CurseForge is not responding right now. Please try again in a moment.',
            });
        }

        $body = $response->json();

        return is_array($body) ? array_filter($body, is_string(...), ARRAY_FILTER_USE_KEY) : [];
    }
}
