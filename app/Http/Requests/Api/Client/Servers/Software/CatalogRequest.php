<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Requests\Api\Client\Servers\Software;

use Illuminate\Validation\Rule;
use Pterodactyl\Contracts\Http\ClientPermissionsRequest;
use Pterodactyl\Enum\Permissions;
use Pterodactyl\Http\Requests\Api\Client\ClientApiRequest;
use Pterodactyl\Services\Servers\Software\SoftwareCatalog;

class CatalogRequest extends ClientApiRequest implements ClientPermissionsRequest
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
        return [
            'type' => ['required', 'string', Rule::in(array_keys(SoftwareCatalog::TYPES))],
            'include_snapshots' => ['sometimes', 'boolean'],
            'minecraft' => ['sometimes', 'nullable', 'string', 'regex:/^[A-Za-z0-9][A-Za-z0-9._+\\-]{0,63}$/'],
        ];
    }
}
