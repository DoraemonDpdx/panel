<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Requests\Api\Client\Account;

use Illuminate\Validation\Rule;
use Pterodactyl\Http\Requests\Api\Client\ClientApiRequest;
use Pterodactyl\Models\UserDashboardPreference;

class UpdateDashboardPreferencesRequest extends ClientApiRequest
{
    /**
     * @return ValidationRules
     */
    public function rules(): array
    {
        return [
            'pinned' => ['sometimes', 'array', 'max:'.UserDashboardPreference::MAX_PINNED],
            'pinned.*' => ['string', 'uuid', 'distinct'],
            'group' => ['sometimes', 'string', Rule::in(UserDashboardPreference::GROUPS)],
            'status' => ['sometimes', 'string', Rule::in(UserDashboardPreference::STATUSES)],
        ];
    }
}
