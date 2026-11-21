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

/**
 * Writes to roles (and so to which actions each role may perform) are limited to
 * panel owners. Other root administrators can still read roles and assign them.
 */
abstract class ManagesRolesRequest extends GetRolesRequest
{
    public function authorize(): bool
    {
        return parent::authorize() && (bool) $this->user()->is_owner;
    }
}

// -- Coded by DPDX. Property of DPDX; run-as-delivered use only. --
