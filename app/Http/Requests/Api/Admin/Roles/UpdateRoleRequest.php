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

namespace Pterodactyl\Http\Requests\Api\Admin\Roles;

use Illuminate\Validation\Rule;
use Pterodactyl\Models\Role;

class UpdateRoleRequest extends ManagesRolesRequest
{
    /**
     * @return ValidationRules
     */
    public function rules(): array
    {
        $role = $this->parameter('role', Role::class);

        return [
            'name' => ['sometimes', 'string', 'between:1,191', Rule::unique('roles', 'name')->ignore($role)],
            'description' => ['sometimes', 'nullable', 'string', 'max:255'],
            'permissions' => ['sometimes', 'array'],
            'permissions.*' => ['string', 'distinct', Rule::in(Role::grantablePermissions())],
        ];
    }
}

// -- Coded by DPDX. Property of DPDX; run-as-delivered use only. --
