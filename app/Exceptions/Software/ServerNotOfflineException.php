<?php

declare(strict_types=1);

namespace Pterodactyl\Exceptions\Software;

use Pterodactyl\Exceptions\DisplayException;

/** The action needs the server stopped first. */
final class ServerNotOfflineException extends DisplayException
{
    public function __construct()
    {
        parent::__construct('Stop the server first.');
    }
}
