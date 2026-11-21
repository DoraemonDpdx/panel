<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Requests\Api\Client\Servers\Ports;

use Pterodactyl\Http\Requests\Api\Client\ClientApiRequest;

/**
 * A preview changes nothing, so anyone who can read the ports can preview a draft.
 */
class PreviewPortsRequest extends ClientApiRequest
{
    /**
     * @return ValidationRules
     */
    public function rules(): array
    {
        return UpdatePortsRequest::settingsRules('');
    }
}
