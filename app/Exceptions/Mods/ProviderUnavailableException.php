<?php

declare(strict_types=1);

namespace Pterodactyl\Exceptions\Mods;

use Pterodactyl\Exceptions\DisplayException;

/** The provider is not configured, for example CurseForge without an API key. */
class ProviderUnavailableException extends DisplayException
{
    public function __construct(string $provider)
    {
        parent::__construct("The $provider provider is not available on this panel.");
    }
}
