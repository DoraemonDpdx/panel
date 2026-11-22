<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Requests\Api\Client\Servers\Content;

use Illuminate\Validation\Rule;
use Pterodactyl\Contracts\Http\ClientPermissionsRequest;
use Pterodactyl\Enum\Permissions;
use Pterodactyl\Http\Requests\Api\Client\ClientApiRequest;

/** Install the chosen items of a Prism import. */
class PrismInstallRequest extends ClientApiRequest implements ClientPermissionsRequest
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
            'items' => ['required', 'array', 'min:1', 'max:200'],
            'items.*.provider' => ['required', 'string', Rule::in(['modrinth', 'curseforge'])],
            'items.*.project_id' => ['required', 'string', 'max:32', 'regex:/^[A-Za-z0-9]{1,32}$/'],
            'items.*.version_id' => ['required', 'string', 'max:32', 'regex:/^[A-Za-z0-9]{1,32}$/'],
        ];
    }
}
