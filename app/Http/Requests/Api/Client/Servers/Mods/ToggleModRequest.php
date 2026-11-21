<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Requests\Api\Client\Servers\Mods;

use Pterodactyl\Contracts\Http\ClientPermissionsRequest;
use Pterodactyl\Enum\Permissions;
use Pterodactyl\Http\Requests\Api\Client\ClientApiRequest;
use Pterodactyl\Services\Servers\Mods\ModInstaller;

class ToggleModRequest extends ClientApiRequest implements ClientPermissionsRequest
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
            'filename' => ['required', 'string', 'max:255', 'regex:'.ModInstaller::DISK_FILE_PATTERN],
            'enabled' => ['required', 'boolean'],
        ];
    }
}
