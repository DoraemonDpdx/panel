<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Requests\Api\Client\Servers\Mods;

use Pterodactyl\Contracts\Http\ClientPermissionsRequest;
use Pterodactyl\Enum\Permissions;
use Pterodactyl\Http\Requests\Api\Client\ClientApiRequest;

class ProjectVersionsRequest extends ClientApiRequest implements ClientPermissionsRequest
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
            'project_id' => $this->idRule(),
            'game_version' => ['sometimes', 'nullable', 'string', 'regex:/^[A-Za-z0-9._\-]{1,32}$/'],
        ];
    }

    protected function prepareForValidation(): void
    {
        $this->merge(['project_id' => $this->route('projectId')]);
    }
}
