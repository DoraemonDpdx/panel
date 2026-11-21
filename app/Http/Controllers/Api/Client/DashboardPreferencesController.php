<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Controllers\Api\Client;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Knuckles\Scribe\Attributes\BodyParam;
use Knuckles\Scribe\Attributes\Endpoint;
use Knuckles\Scribe\Attributes\Group;
use Knuckles\Scribe\Attributes\Response as ScribeResponse;
use Knuckles\Scribe\Attributes\Subgroup;
use Pterodactyl\Http\Requests\Api\Client\Account\UpdateDashboardPreferencesRequest;
use Pterodactyl\Models\UserDashboardPreference;

#[Group('Client API', 'Endpoints authenticated as a panel user using a client API token.')]
#[Subgroup('Account', 'View and update the authenticated user account.')]
class DashboardPreferencesController extends ClientApiController
{
    #[Endpoint('Get dashboard preferences', "Returns the authenticated user's pinned servers, grouping and status filter.")]
    #[ScribeResponse(['object' => 'dashboard_preferences', 'attributes' => ['pinned' => [], 'group' => 'none', 'status' => 'all']], status: 200, description: 'Dashboard preferences returned.')]
    public function index(Request $request): JsonResponse
    {
        return $this->present($this->current($request));
    }

    #[Endpoint('Update dashboard preferences', 'Merges the provided fields into the saved dashboard preferences.')]
    #[BodyParam('pinned', 'string[]', 'UUIDs of the pinned servers.', required: false)]
    #[BodyParam('group', 'string', 'One of none, node, game or tag.', required: false, example: 'node')]
    #[BodyParam('status', 'string', 'One of all, running, offline or suspended.', required: false, example: 'all')]
    #[ScribeResponse(['object' => 'dashboard_preferences', 'attributes' => ['pinned' => [], 'group' => 'none', 'status' => 'all']], status: 200, description: 'Dashboard preferences updated.')]
    public function update(UpdateDashboardPreferencesRequest $request): JsonResponse
    {
        $merged = array_merge($this->current($request), $request->validated());

        UserDashboardPreference::query()->updateOrCreate(
            ['user_id' => $request->user()->id],
            ['preferences' => $merged]
        );

        return $this->present($merged);
    }

    /**
     * @return array{pinned: list<string>, group: string, status: string}
     */
    private function current(Request $request): array
    {
        $saved = UserDashboardPreference::query()->where('user_id', $request->user()->id)->first();

        // A `view` saved before the grid layout was removed is ignored, never returned.
        $stored = Arr::except($saved->preferences ?? [], ['view']);

        return array_merge(UserDashboardPreference::defaults(), $stored);
    }

    /**
     * @param  array<string, mixed>  $preferences
     */
    private function present(array $preferences): JsonResponse
    {
        return response()->json([
            'object' => UserDashboardPreference::RESOURCE_NAME,
            'attributes' => $preferences,
        ]);
    }
}
