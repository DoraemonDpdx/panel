<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Pterodactyl\Enum\WorkloadProfile;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('eggs', function (Blueprint $table): void {
            // What the egg runs (game, bot, web, database, lavalink or generic); drives the client UI layout.
            $table->string('workload_profile', 16)->default(WorkloadProfile::Generic->value)->after('features');
        });

        $this->markGameEggs();
    }

    /**
     * Only what the egg's tags make clear: the built-in game tags are game servers. Anything else,
     * voice servers included, stays generic until an administrator sets it.
     */
    public function markGameEggs(): void
    {
        if (Schema::hasTable('tags') && Schema::hasTable('taggables')) {
            $eggIds = DB::table('taggables')
                ->join('tags', 'tags.id', '=', 'taggables.tag_id')
                ->where('taggables.taggable_type', 'egg')
                ->whereIn('tags.slug', WorkloadProfile::gameTagSlugs())
                ->pluck('taggables.taggable_id');

            foreach ($eggIds->unique()->chunk(500) as $chunk) {
                DB::table('eggs')->whereIn('id', $chunk->all())->update(['workload_profile' => WorkloadProfile::Game->value]);
            }
        }
    }

    public function down(): void
    {
        Schema::table('eggs', function (Blueprint $table): void {
            $table->dropColumn('workload_profile');
        });
    }
};
