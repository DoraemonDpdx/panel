<?php

declare(strict_types=1);

namespace Pterodactyl\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Table;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * What a user chose on the client dashboard: pinned servers, grouping and status filter.
 *
 * @property int $user_id
 * @property array{pinned: list<string>, group: string, status: string} $preferences
 */
#[Fillable(['user_id', 'preferences'])]
#[Table(name: 'user_dashboard_preferences')]
class UserDashboardPreference extends Model
{
    public const string RESOURCE_NAME = 'dashboard_preferences';

    public const array GROUPS = ['none', 'node', 'game', 'tag'];

    public const array STATUSES = ['all', 'running', 'offline', 'suspended'];

    public const int MAX_PINNED = 100;

    /**
     * @return array{pinned: list<string>, group: string, status: string}
     */
    public static function defaults(): array
    {
        return ['pinned' => [], 'group' => 'none', 'status' => 'all'];
    }

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return ['preferences' => 'array'];
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
