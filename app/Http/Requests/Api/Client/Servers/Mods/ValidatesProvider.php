<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Requests\Api\Client\Servers\Mods;

use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\In;
use Pterodactyl\Services\Servers\Mods\ModProviderRegistry;

/**
 * Shared rules for requests that name a mod provider and Modrinth or CurseForge IDs.
 */
trait ValidatesProvider
{
    /**
     * @return array<int, string|In>
     */
    protected function providerRule(): array
    {
        return ['sometimes', 'string', Rule::in(app(ModProviderRegistry::class)->keys())];
    }

    /**
     * An ID rule using the pattern of the requested provider, which defaults to Modrinth.
     *
     * @return array<int, string>
     */
    protected function idRule(): array
    {
        $registry = app(ModProviderRegistry::class);
        $key = $this->input('provider', ModProviderRegistry::DEFAULT);
        $key = is_string($key) && in_array($key, $registry->keys(), true) ? $key : ModProviderRegistry::DEFAULT;

        return ['required', 'string', 'regex:'.$registry->get($key)->idPattern()];
    }
}
