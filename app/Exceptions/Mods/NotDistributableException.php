<?php

declare(strict_types=1);

namespace Pterodactyl\Exceptions\Mods;

use Pterodactyl\Exceptions\DisplayException;

/** The author does not allow this file to be downloaded by other sites, so the user must fetch it themselves. */
class NotDistributableException extends DisplayException
{
    public function __construct(public readonly ?string $pageUrl)
    {
        parent::__construct('The author of this file does not allow it to be downloaded by other sites. Download it from the provider\'s page instead.');
    }
}
