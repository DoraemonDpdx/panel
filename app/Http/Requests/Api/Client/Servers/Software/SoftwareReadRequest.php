<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Requests\Api\Client\Servers\Software;

use Pterodactyl\Contracts\Http\ClientPermissionsRequest;
use Pterodactyl\Enum\Permissions;
use Pterodactyl\Http\Requests\Api\Client\ClientApiRequest;

/** Anyone with software.read may see the current software and the catalog. */
class SoftwareReadRequest extends ClientApiRequest implements ClientPermissionsRequest
{
    public function permission(): string
    {
        return Permissions::SoftwareRead->value;
    }

    /**
     * @return ValidationRules
     */
    public function rules(): array
    {
        return [];
    }
}
