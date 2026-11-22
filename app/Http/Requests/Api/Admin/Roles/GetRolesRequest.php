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

use Pterodactyl\Http\Requests\Api\Admin\AdminApiRequest;

/**
 * Role management is root-administrator only (no declared permissions), so a
 * role can never be used to grant itself more access.
 */
class GetRolesRequest extends AdminApiRequest
{
    public function permissions(): array
    {
        return [];
    }
}

// -- Coded by DPDX. Property of DPDX; run-as-delivered use only. --
