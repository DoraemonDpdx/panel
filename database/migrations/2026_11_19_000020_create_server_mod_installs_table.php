<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('server_mod_installs', function (Blueprint $table): void {
            $table->id();
            $table->unsignedInteger('server_id');
            $table->string('provider', 32)->default('modrinth');
            $table->string('project_id', 32);
            $table->string('version_id', 32);
            $table->string('slug', 191)->nullable();
            $table->string('project_type', 16)->default('mod');
            $table->string('title');
            $table->string('icon_url', 2048)->nullable();
            $table->string('filename');
            $table->string('version_number', 191);
            $table->string('sha512', 128)->nullable();
            $table->string('sha1', 40)->nullable();
            $table->string('install_dir', 32);
            $table->boolean('enabled')->default(true);
            $table->timestamps();

            $table->foreign('server_id')->references('id')->on('servers')->cascadeOnDelete();
            $table->unique(['server_id', 'provider', 'project_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('server_mod_installs');
    }
};
