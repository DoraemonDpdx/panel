<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Requests\Api\Client\Servers\Content;

use Closure;
use Pterodactyl\Contracts\Http\ClientPermissionsRequest;
use Pterodactyl\Enum\Permissions;
use Pterodactyl\Http\Requests\Api\Client\ClientApiRequest;

/** Preview a Prism Launcher mod list. */
class PrismPreviewRequest extends ClientApiRequest implements ClientPermissionsRequest
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
            'text' => ['required', 'string', 'max:262144', fn (string $attribute, mixed $value, Closure $fail): mixed => is_string($value) && mb_strlen($value) > 262144 ? $fail('The text may not be larger than 256 KB.') : null],
        ];
    }
}
