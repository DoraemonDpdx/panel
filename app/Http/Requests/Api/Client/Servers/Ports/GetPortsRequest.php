<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Requests\Api\Client\Servers\Ports;

use Pterodactyl\Http\Requests\Api\Client\ClientApiRequest;

/**
 * Anyone who can open the server can read its ports; changing them takes settings.ports.
 */
class GetPortsRequest extends ClientApiRequest
{
    /** @return array<string, never> */
    public function rules(): array
    {
        return [];
    }
}
