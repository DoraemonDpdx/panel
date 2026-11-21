<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Requests\Api\Client\Servers\Mods;

use Illuminate\Validation\Rule;
use Pterodactyl\Contracts\Http\ClientPermissionsRequest;
use Pterodactyl\Enum\Permissions;
use Pterodactyl\Http\Requests\Api\Client\ClientApiRequest;
use Pterodactyl\Services\Servers\Mods\ModrinthClient;

class SearchModsRequest extends ClientApiRequest implements ClientPermissionsRequest
{
    use ValidatesProvider;

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
            'provider' => $this->providerRule(),
            'query' => ['sometimes', 'nullable', 'string', 'max:100'],
            'category' => ['sometimes', 'nullable', 'string', 'regex:'.($this->input('provider') === 'curseforge' ? '/^\d{1,10}$/' : '/^[a-z0-9\-]{1,48}$/')],
            'game_version' => ['sometimes', 'nullable', 'string', 'regex:/^[A-Za-z0-9._\-]{1,32}$/'],
            'offset' => ['sometimes', 'integer', 'min:0', 'max:10000'],
            'limit' => ['sometimes', 'integer', 'min:1', 'max:50'],
            'sort' => ['sometimes', 'string', Rule::in(ModrinthClient::SORTS)],
        ];
    }
}
