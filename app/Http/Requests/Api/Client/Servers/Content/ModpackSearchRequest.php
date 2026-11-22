<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Requests\Api\Client\Servers\Content;

use Illuminate\Validation\Rule;
use Pterodactyl\Contracts\Http\ClientPermissionsRequest;
use Pterodactyl\Enum\Permissions;
use Pterodactyl\Http\Requests\Api\Client\ClientApiRequest;
use Pterodactyl\Http\Requests\Api\Client\Servers\Mods\ValidatesProvider;
use Pterodactyl\Services\Servers\Mods\ModrinthClient;

/** Browse modpacks. */
class ModpackSearchRequest extends ClientApiRequest implements ClientPermissionsRequest
{
    use ValidatesProvider;

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
            'provider' => ['sometimes', 'string', Rule::in(['modrinth', 'curseforge'])],
            'query' => ['sometimes', 'nullable', 'string', 'max:100'],
            'game_version' => ['sometimes', 'nullable', 'string', 'regex:/^[A-Za-z0-9._\-]{1,32}$/'],
            'offset' => ['sometimes', 'integer', 'min:0', 'max:10000'],
            'limit' => ['sometimes', 'integer', 'min:1', 'max:50'],
            'sort' => ['sometimes', 'string', Rule::in(ModrinthClient::SORTS)],
        ];
    }
}
