<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Requests\Api\Client\Servers\Mods;

use Pterodactyl\Contracts\Http\ClientPermissionsRequest;
use Pterodactyl\Enum\Permissions;
use Pterodactyl\Http\Requests\Api\Client\ClientApiRequest;

class ChangeModVersionRequest extends ClientApiRequest implements ClientPermissionsRequest
{
    public function permission(): string
    {
        return Permissions::ModsInstall->value;
    }

    /**
     * @return ValidationRules
     */
    public function rules(): array
    {
        return [
            // The pattern depends on the installed row's provider, which the controller checks.
            'version_id' => ['required', 'string', 'regex:/^[A-Za-z0-9]{1,16}$/'],
        ];
    }
}
