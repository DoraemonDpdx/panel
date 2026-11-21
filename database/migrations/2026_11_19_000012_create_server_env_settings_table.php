<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('server_env_settings', function (Blueprint $table): void {
            $table->id();
            $table->unsignedInteger('server_id')->unique();
            $table->string('file_name', 191)->default('.env');
            $table->string('format', 16)->default('dotenv');
            $table->string('mode', 16)->default('managed');
            $table->string('conflict_policy', 16)->default('warn');
            $table->json('extra')->nullable();
            // True when a change has not reached a running process yet; cleared on the next start.
            $table->boolean('restart_required')->default(false);
            $table->timestamps();

            $table->foreign('server_id')->references('id')->on('servers')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('server_env_settings');
    }
};
