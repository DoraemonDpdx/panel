<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Requests\Api\Client\Servers\Software;

use Pterodactyl\Contracts\Http\ClientPermissionsRequest;
use Pterodactyl\Enum\Permissions;
use Pterodactyl\Http\Requests\Api\Client\ClientApiRequest;

class ClearServerRequest extends ClientApiRequest implements ClientPermissionsRequest
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
        return [
            'keep_worlds' => ['required', 'boolean'],
            'confirm' => ['required', 'string', 'max:191'],
        ];
    }
}
