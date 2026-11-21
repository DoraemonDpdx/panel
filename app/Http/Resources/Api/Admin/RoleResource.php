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

namespace Pterodactyl\Http\Resources\Api\Admin;

use Illuminate\Http\Request;
use Pterodactyl\Models\Role;

/**
 * @extends AdminResource<Role>
 */
class RoleResource extends AdminResource
{
    public function resourceName(): string
    {
        return Role::RESOURCE_NAME;
    }

    public function toArray(Request $request): array
    {
        $role = $this->resource;

        return [
            'id' => $role->id,
            'name' => $role->name,
            'description' => $role->description,
            'permissions' => $role->permissions ?? [],
            'users_count' => (int) ($role->users_count ?? 0),
            'created_at' => $this->formatTimestamp($role->created_at),
            'updated_at' => $this->formatTimestamp($role->updated_at),
        ];
    }
}

// -- Coded by DPDX. Property of DPDX; run-as-delivered use only. --
