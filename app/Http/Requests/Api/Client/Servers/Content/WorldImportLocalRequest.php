<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Requests\Api\Client\Servers\Content;

use Illuminate\Validation\Rule;
use Pterodactyl\Contracts\Http\ClientPermissionsRequest;
use Pterodactyl\Enum\Permissions;
use Pterodactyl\Http\Requests\Api\Client\ClientApiRequest;

/** Install a world zip uploaded to the server. */
class WorldImportLocalRequest extends ClientApiRequest implements ClientPermissionsRequest
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
            'mode' => ['sometimes', 'string', Rule::in(['replace', 'new'])],
            'backup' => ['sometimes', 'boolean'],
            'level_name' => ['sometimes', 'nullable', 'string', 'max:64'],
        ];
    }
}
