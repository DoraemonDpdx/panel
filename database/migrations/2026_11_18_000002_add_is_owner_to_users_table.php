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

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            // Owners alone may create, edit and delete roles (toggle their actions).
            // The flag is only ever set from the CLI (p:user:owner), never the API.
            $table->boolean('is_owner')->default(false)->after('root_admin');
        });

        // Existing installs: the oldest root administrator becomes the owner.
        $first = DB::table('users')->where('root_admin', true)->orderBy('id')->value('id');
        if ($first !== null) {
            DB::table('users')->where('id', $first)->update(['is_owner' => true]);
        }
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn('is_owner');
        });
    }
};

// -- Coded by DPDX. Property of DPDX; run-as-delivered use only. --
