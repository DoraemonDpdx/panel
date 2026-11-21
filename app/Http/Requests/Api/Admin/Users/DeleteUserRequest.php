<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Requests\Api\Admin\Users;

use Pterodactyl\Enum\Permissions;
use Pterodactyl\Http\Requests\Api\Admin\AdminApiRequest;
use Pterodactyl\Models\User;

class DeleteUserRequest extends AdminApiRequest
{
    public function permissions(): array
    {
        return [Permissions::AdminUsersDelete];
    }

    /**
     * Role holders cannot act on other staff accounts (root or role holders).
     */
    public function authorize(): bool
    {
        if (! parent::authorize()) {
            return false;
        }

        $target = $this->route('user');

        if ($target instanceof User && $target->is_owner && ! $target->is($this->user())) {
            return false;
        }

        return $this->user()->root_admin
            || ! ($target instanceof User && $target->isStaff() && ! $target->is($this->user()));
    }
}
