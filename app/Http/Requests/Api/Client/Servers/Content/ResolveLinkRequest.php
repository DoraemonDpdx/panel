<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Requests\Api\Client\Servers\Content;

use Pterodactyl\Contracts\Http\ClientPermissionsRequest;
use Pterodactyl\Enum\Permissions;
use Pterodactyl\Http\Requests\Api\Client\ClientApiRequest;

/** Resolve a pasted link. */
class ResolveLinkRequest extends ClientApiRequest implements ClientPermissionsRequest
{
    public function permission(): string
    {
        return Permissions::ModsRead->value;
    }

    /**
     * @return ValidationRules
     */
    public function rules(): array
    {
        return [
            'url' => ['required', 'string', 'max:2048'],
        ];
    }
}
