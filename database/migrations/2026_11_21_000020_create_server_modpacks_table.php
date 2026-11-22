<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('server_modpacks', function (Blueprint $table): void {
            $table->id();
            $table->unsignedInteger('server_id')->unique();
            $table->string('provider', 32);
            $table->string('project_id', 32);
            $table->string('version_id', 32);
            $table->string('title');
            $table->string('icon_url', 2048)->nullable();
            $table->string('version_number', 191);
            $table->timestamps();

            $table->foreign('server_id')->references('id')->on('servers')->cascadeOnDelete();
        });

        Schema::table('server_mod_installs', function (Blueprint $table): void {
            $table->boolean('from_modpack')->default(false)->after('enabled');
        });

        // What to record once an install operation succeeds: the modpack, its mods, a new level name.
        // It is applied when the operation finishes and dropped when it fails.
        Schema::create('server_content_pending', function (Blueprint $table): void {
            $table->id();
            $table->unsignedInteger('server_id');
            $table->unsignedBigInteger('operation_id');
            $table->json('payload');
            $table->timestamps();

            $table->foreign('server_id')->references('id')->on('servers')->cascadeOnDelete();
            $table->foreign('operation_id')->references('id')->on('server_install_operations')->cascadeOnDelete();
            $table->index(['server_id', 'operation_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('server_content_pending');

        Schema::table('server_mod_installs', function (Blueprint $table): void {
            $table->dropColumn('from_modpack');
        });

        Schema::dropIfExists('server_modpacks');
    }
};
