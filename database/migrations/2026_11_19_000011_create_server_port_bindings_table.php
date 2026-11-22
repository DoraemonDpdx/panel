<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('server_port_bindings', function (Blueprint $table): void {
            $table->id();
            $table->unsignedInteger('server_id');
            $table->unsignedInteger('allocation_id');
            $table->string('role', 64);
            $table->boolean('auto')->default(true);
            $table->timestamps();

            $table->foreign('server_id')->references('id')->on('servers')->cascadeOnDelete();
            $table->foreign('allocation_id')->references('id')->on('allocations')->cascadeOnDelete();
            $table->unique(['server_id', 'role']);
            $table->unique(['server_id', 'allocation_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('server_port_bindings');
    }
};
