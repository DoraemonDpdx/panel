<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Requests\Api\Client\Servers\Ports;

use Illuminate\Validation\Rule;
use Pterodactyl\Contracts\Http\ClientPermissionsRequest;
use Pterodactyl\Enum\Permissions;
use Pterodactyl\Http\Requests\Api\Client\ClientApiRequest;
use Pterodactyl\Models\ServerEnvSetting;
use Pterodactyl\Services\Servers\Ports\PortAssigner;

class UpdatePortsRequest extends ClientApiRequest implements ClientPermissionsRequest
{
    /**
     * Rules for the file settings, shared with the preview endpoint.
     *
     * @return ValidationRules
     */
    public static function settingsRules(string $prefix): array
    {
        return [
            $prefix.'file_name' => ['sometimes', 'string', 'min:1', 'max:191'],
            $prefix.'format' => ['sometimes', 'string', Rule::in(ServerEnvSetting::FORMATS)],
            $prefix.'mode' => ['sometimes', 'string', Rule::in(ServerEnvSetting::MODES)],
            $prefix.'conflict_policy' => ['sometimes', 'string', Rule::in(ServerEnvSetting::CONFLICT_POLICIES)],
            $prefix.'extra' => ['sometimes', 'array', 'max:64'],
            $prefix.'extra.*.key' => ['required', 'string', 'max:128', 'regex:/^[A-Za-z_][A-Za-z0-9_]*$/'],
            $prefix.'extra.*.value' => ['nullable', 'string', 'max:4096'],
            $prefix.'extra.*.secret' => ['sometimes', 'boolean'],
        ];
    }

    public function permission(): string
    {
        return Permissions::SettingsPorts->value;
    }

    /**
     * @return ValidationRules
     */
    public function rules(): array
    {
        return [
            'roles' => ['sometimes', 'array', 'max:32'],
            'roles.*.role' => ['required', 'string', 'regex:'.PortAssigner::ROLE_PATTERN],
            'roles.*.auto' => ['required', 'boolean'],
            'roles.*.allocation_id' => ['nullable', 'integer', 'required_if:roles.*.auto,false'],
            'remove_roles' => ['sometimes', 'array', 'max:32'],
            'remove_roles.*' => ['string', 'regex:'.PortAssigner::ROLE_PATTERN],
            ...self::settingsRules('settings.'),
            'settings' => ['sometimes', 'array'],
        ];
    }
}
