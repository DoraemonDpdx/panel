<?php

declare(strict_types=1);

/*
 * ============================================================
 *  Coded by DPDX
 * ============================================================
 *  This file is proprietary to DPDX. Customers receiving a
 *  DPDX-built product may run it as delivered only; they hold
 *  no ownership of it, and no other party has any right to use it.
 */

namespace Pterodactyl\Models;

use Database\Factories\RoleFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\RouteKey;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Pterodactyl\Enum\Permissions;

#[Fillable(['name', 'description', 'permissions'])]
#[RouteKey('id')]
class Role extends Model
{
    /** @use HasFactory<RoleFactory> */
    use HasFactory;

    public const string RESOURCE_NAME = 'role';

    /**
     * @var list<string>
     */
    public static array $searchableColumns = ['name', 'description'];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return ['permissions' => 'array'];
    }

    /**
     * Every permission a role may be granted: the admin:* keys only. Server
     * subuser permissions are granted per server, never through a role.
     *
     * @return list<string>
     */
    public static function grantablePermissions(): array
    {
        return collect(Permissions::cases())
            ->map(fn (Permissions $permission): string => $permission->value)
            ->filter(fn (string $value): bool => str_starts_with($value, 'admin:'))
            ->values()
            ->all();
    }

    public function allows(string $ability): bool
    {
        return in_array($ability, $this->permissions ?? [], true);
    }

    /**
     * @return HasMany<User, $this>
     */
    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }
}

// -- Coded by DPDX. Property of DPDX; run-as-delivered use only. --
