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
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('roles', function (Blueprint $table): void {
            $table->increments('id');
            $table->string('name', 191)->unique();
            $table->string('description', 255)->nullable();
            // List of admin:* permission keys (see Pterodactyl\Enum\Permissions).
            $table->json('permissions');
            $table->timestamps();
        });

        Schema::table('users', function (Blueprint $table): void {
            // Deleting a role demotes its holders instead of deleting them.
            $table->unsignedInteger('role_id')->nullable()->after('root_admin');
            $table->foreign('role_id')->references('id')->on('roles')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropForeign(['role_id']);
            $table->dropColumn('role_id');
        });

        Schema::dropIfExists('roles');
    }
};

// -- Coded by DPDX. Property of DPDX; run-as-delivered use only. --
