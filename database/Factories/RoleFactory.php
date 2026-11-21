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

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Pterodactyl\Models\Role;

/**
 * @extends Factory<Role>
 */
class RoleFactory extends Factory
{
    protected $model = Role::class;

    public function definition(): array
    {
        return [
            'name' => fake()->unique()->words(2, true),
            'description' => fake()->sentence(),
            'permissions' => ['admin:users.read'],
        ];
    }

    /**
     * @param  list<string>  $permissions
     */
    public function withPermissions(array $permissions): self
    {
        return $this->state(fn (): array => ['permissions' => $permissions]);
    }
}

// -- Coded by DPDX. Property of DPDX; run-as-delivered use only. --
