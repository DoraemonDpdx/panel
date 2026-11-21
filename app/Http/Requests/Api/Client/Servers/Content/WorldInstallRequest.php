<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Requests\Api\Client\Servers\Content;

use Illuminate\Validation\Rule;
use Pterodactyl\Contracts\Http\ClientPermissionsRequest;
use Pterodactyl\Enum\Permissions;
use Pterodactyl\Http\Requests\Api\Client\ClientApiRequest;

/** Install a CurseForge world. */
class WorldInstallRequest extends ClientApiRequest implements ClientPermissionsRequest
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
            'provider' => ['sometimes', 'string', Rule::in(['curseforge'])],
            'project_id' => ['required', 'string', 'regex:/^\\d{1,10}$/'],
            'file_id' => ['required', 'string', 'regex:/^\\d{1,10}$/'],
            'mode' => ['sometimes', 'string', Rule::in(['replace', 'new'])],
            'backup' => ['sometimes', 'boolean'],
            'level_name' => ['sometimes', 'nullable', 'string', 'max:64'],
        ];
    }
}
