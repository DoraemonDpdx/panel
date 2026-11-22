<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Requests\Api\Client\Servers\Software;

use Pterodactyl\Contracts\Http\ClientPermissionsRequest;
use Pterodactyl\Enum\Permissions;
use Pterodactyl\Http\Requests\Api\Client\ClientApiRequest;

/** An action that needs no input beyond software.manage: reinstall and convert. */
class SoftwareManageRequest extends ClientApiRequest implements ClientPermissionsRequest
{
    public function permission(): string
    {
        return Permissions::SoftwareManage->value;
    }

    /**
     * @return ValidationRules
     */
    public function rules(): array
    {
        return [];
    }
}
