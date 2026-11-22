<?php

declare(strict_types=1);

namespace Pterodactyl\Services\Servers\Mods;

use InvalidArgumentException;

final readonly class ModProviderRegistry
{
    public const string DEFAULT = 'modrinth';

    public function __construct(private ModrinthProvider $modrinth, private CurseForgeProvider $curseForge) {}

    /**
     * @return list<string>
     */
    public function keys(): array
    {
        return array_map(fn (ModProvider $provider): string => $provider->key(), $this->all());
    }

    /**
     * Keys of the providers that can be used right now.
     *
     * @return list<string>
     */
    public function availableKeys(): array
    {
        return array_values(array_map(fn (ModProvider $provider): string => $provider->key(), array_filter($this->all(), fn (ModProvider $provider): bool => $provider->available())));
    }

    public function get(string $key): ModProvider
    {
        return array_find($this->all(), fn (ModProvider $provider): bool => $provider->key() === $key)
            ?? throw new InvalidArgumentException("Unknown mod provider [$key].");
    }

    /**
     * @return list<ModProvider>
     */
    public function all(): array
    {
        return [$this->modrinth, $this->curseForge];
    }
}
