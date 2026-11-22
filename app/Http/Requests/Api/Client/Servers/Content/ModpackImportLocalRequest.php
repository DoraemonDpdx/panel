<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Requests\Api\Client\Servers\Content;

use Pterodactyl\Contracts\Http\ClientPermissionsRequest;
use Pterodactyl\Enum\Permissions;
use Pterodactyl\Http\Requests\Api\Client\ClientApiRequest;

/** Install a modpack archive uploaded to the server. */
class ModpackImportLocalRequest extends ClientApiRequest implements ClientPermissionsRequest
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
            'path' => ['required', 'string', 'max:500', 'regex:/^[^\\x00-\\x1f\\\\]+\\.(zip|mrpack)$/i'],
            'wipe' => ['sometimes', 'array'],
            'wipe.enabled' => ['sometimes', 'boolean'],
            'wipe.keep_worlds' => ['sometimes', 'boolean'],
        ];
    }
}
