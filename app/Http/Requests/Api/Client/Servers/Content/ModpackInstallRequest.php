<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Requests\Api\Client\Servers\Content;

use Illuminate\Validation\Rule;
use Pterodactyl\Contracts\Http\ClientPermissionsRequest;
use Pterodactyl\Enum\Permissions;
use Pterodactyl\Http\Requests\Api\Client\ClientApiRequest;
use Pterodactyl\Http\Requests\Api\Client\Servers\Mods\ValidatesProvider;

/** Install a modpack. */
class ModpackInstallRequest extends ClientApiRequest implements ClientPermissionsRequest
{
    use ValidatesProvider;

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
            'provider' => ['required', 'string', Rule::in(['modrinth', 'curseforge'])],
            'project_id' => $this->idRule(),
            'version_id' => $this->idRule(),
            'wipe' => ['sometimes', 'array'],
            'wipe.enabled' => ['sometimes', 'boolean'],
            'wipe.keep_worlds' => ['sometimes', 'boolean'],
        ];
    }
}
