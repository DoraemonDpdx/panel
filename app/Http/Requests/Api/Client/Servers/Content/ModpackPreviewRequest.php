<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Requests\Api\Client\Servers\Content;

use Illuminate\Validation\Rule;
use Pterodactyl\Contracts\Http\ClientPermissionsRequest;
use Pterodactyl\Enum\Permissions;
use Pterodactyl\Http\Requests\Api\Client\ClientApiRequest;
use Pterodactyl\Http\Requests\Api\Client\Servers\Mods\ValidatesProvider;

/** Preview a modpack install. */
class ModpackPreviewRequest extends ClientApiRequest implements ClientPermissionsRequest
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
            'provider' => ['required', 'string', Rule::in(['modrinth', 'curseforge'])],
            'project_id' => $this->idRule(),
            'version_id' => $this->idRule(),
        ];
    }
}
