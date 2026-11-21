<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Requests\Api\Client\Servers\SavedCommands;

use Pterodactyl\Contracts\Http\ClientPermissionsRequest;
use Pterodactyl\Enum\Permissions;
use Pterodactyl\Http\Requests\Api\Client\ClientApiRequest;
use Pterodactyl\Models\ServerSavedCommand;

/**
 * Saved commands are shared with, and managed by, everyone who may use the console.
 */
class ReorderSavedCommandRequest extends ClientApiRequest implements ClientPermissionsRequest
{
    public function permission(): string
    {
        return Permissions::ControlConsole->value;
    }

    /**
     * @return ValidationRules
     */
    public function rules(): array
    {
        return [
            'ids' => ['required', 'array', 'max:'.ServerSavedCommand::LIMIT],
            'ids.*' => ['integer', 'distinct'],
        ];
    }
}
