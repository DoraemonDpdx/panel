<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('server_saved_commands', function (Blueprint $table): void {
            $table->id();
            $table->unsignedInteger('server_id');
            $table->string('label', 64);
            $table->string('command', 1024);
            $table->boolean('confirm')->default(false);
            $table->unsignedSmallInteger('position')->default(0);
            $table->timestamps();

            $table->foreign('server_id')->references('id')->on('servers')->cascadeOnDelete();
            $table->index(['server_id', 'position']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('server_saved_commands');
    }
};
