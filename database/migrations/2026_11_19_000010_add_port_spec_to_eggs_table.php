<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('eggs', function (Blueprint $table): void {
            // The port roles an egg needs, e.g. [{"role": "QUERY_PORT", "required": false}].
            $table->json('port_spec')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('eggs', function (Blueprint $table): void {
            $table->dropColumn('port_spec');
        });
    }
};
