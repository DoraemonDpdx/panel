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

namespace Pterodactyl\Console\Commands\User;

use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Pterodactyl\Models\User;

#[Description('Grants or revokes panel owner status, which alone may toggle role actions.')]
#[Signature('p:user:owner {email : Email of the user} {--revoke : Remove owner status instead of granting it}')]
class SetOwnerCommand extends Command
{
    public function handle(): int
    {
        $user = User::query()->where('email', $this->argument('email'))->first();
        if (! $user) {
            $this->error('No user with that email address exists.');

            return 1;
        }

        if ($this->option('revoke')) {
            $user->forceFill(['is_owner' => false])->save();
            $this->info("{$user->email} is no longer an owner.");

            return 0;
        }

        // Owners are always root administrators.
        $user->forceFill(['is_owner' => true, 'root_admin' => true])->save();
        $this->info("{$user->email} is now an owner.");

        return 0;
    }
}

// -- Coded by DPDX. Property of DPDX; run-as-delivered use only. --
