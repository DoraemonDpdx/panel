<?php

declare(strict_types=1);

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Ramsey\Uuid\Uuid;
use RuntimeException;

/**
 * Fixtures for checking the Mods tab with a mod loader by hand: a "Fabric" egg and a "NeoForge" egg (cloned from
 * the Forge egg), each with one server on the existing demo node. Not called by DatabaseSeeder.
 *
 *     php artisan db:seed --class=ModsDemoSeeder
 *
 * Safe to run repeatedly: eggs and servers are found by fixed UUIDs, so a rerun creates nothing new.
 */
class ModsDemoSeeder extends Seeder
{
    private const string NAMESPACE = 'astrelyse-mods-demo';

    public function run(): void
    {
        $node = $this->int(DB::table('nodes')->where('name', 'demo-node')->value('id'), 'The demo node ("demo-node") does not exist, so there is nowhere to put the demo servers.');
        $owner = $this->int(DB::table('servers')->where('node_id', $node)->value('owner_id') ?? DB::table('users')->min('id'), 'There is no user to own the demo servers.');
        $tag = $this->int(DB::table('tags')->where('slug', 'minecraft')->value('id'), 'The minecraft tag does not exist. Run the egg seeder first.');

        DB::transaction(function () use ($node, $owner, $tag): void {
            $fabric = $this->fabricEgg($tag);
            $neoForge = $this->neoForgeEgg($tag);

            $this->server('Fabric Demo', 'fabric', $fabric, 'java -Xms128M -XX:MaxRAMPercentage=95.0 -jar fabric-server-launch.jar', $node, $owner);
            $this->server('NeoForge Demo', 'neoforge', $neoForge, 'java -Xms128M -XX:MaxRAMPercentage=95.0 @unix_args.txt', $node, $owner);
        });
    }

    private function fabricEgg(int $tag): int
    {
        $uuid = $this->uuid('egg-fabric');
        $existing = DB::table('eggs')->where('uuid', $uuid)->value('id');
        if ($existing !== null) {
            return $this->int($existing, 'Unreadable egg id.');
        }

        $forge = DB::table('eggs')->where('name', 'Forge Minecraft')->first()
            ?? throw new RuntimeException('The Forge Minecraft egg does not exist, so Fabric cannot borrow its settings.');

        $id = (int) DB::table('eggs')->insertGetId([
            ...$this->copyable($forge),
            'uuid' => $uuid,
            'name' => 'Fabric',
            'description' => 'Fabric Minecraft server, for checking the mod installer by hand.',
            'startup' => 'java -jar fabric-server-launch.jar',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        foreach ([
            ['Server Jar File', 'SERVER_JARFILE', 'fabric-server-launch.jar', 'required|regex:/^([\w\d._-]+)(\.jar)$/'],
            ['Minecraft Version', 'MC_VERSION', '1.21.1', 'required|string|max:9'],
        ] as [$name, $env, $default, $rules]) {
            DB::table('egg_variables')->insert([
                'egg_id' => $id, 'name' => $name, 'description' => '', 'env_variable' => $env, 'default_value' => $default,
                'user_viewable' => 1, 'user_editable' => 1, 'rules' => $rules, 'created_at' => now(), 'updated_at' => now(),
            ]);
        }
        $this->tag($id, $tag);

        return $id;
    }

    private function neoForgeEgg(int $tag): int
    {
        $uuid = $this->uuid('egg-neoforge');
        $existing = DB::table('eggs')->where('uuid', $uuid)->value('id');
        if ($existing !== null) {
            return $this->int($existing, 'Unreadable egg id.');
        }

        $forge = DB::table('eggs')->where('name', 'Forge Minecraft')->first()
            ?? throw new RuntimeException('The Forge Minecraft egg does not exist, so NeoForge cannot be cloned from it.');

        $id = (int) DB::table('eggs')->insertGetId([
            ...$this->copyable($forge),
            'uuid' => $uuid,
            'name' => 'NeoForge',
            'description' => 'NeoForge Minecraft server, cloned from the Forge egg for checking the mod installer by hand.',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        foreach (DB::table('egg_variables')->where('egg_id', $forge->id)->get() as $variable) {
            $copy = (array) $variable;
            unset($copy['id']);
            // Keeps "latest" so the latest-version path stays testable on this server.
            DB::table('egg_variables')->insert([...$copy, 'egg_id' => $id, 'created_at' => now(), 'updated_at' => now()]);
        }
        $this->tag($id, $tag);

        return $id;
    }

    private function server(string $name, string $key, int $egg, string $startup, int $node, int $owner): void
    {
        $uuid = $this->uuid("server-$key");
        if (DB::table('servers')->where('uuid', $uuid)->exists()) {
            return;
        }

        $allocation = DB::table('allocations')->where('node_id', $node)->whereNull('server_id')->orderBy('port')->first()
            ?? throw new RuntimeException('There is no free allocation left on the demo node.');

        $id = DB::table('servers')->insertGetId([
            'uuid' => $uuid,
            'uuidShort' => Str::lower(mb_substr(str_replace('-', '', $uuid), 0, 8)),
            'node_id' => $node,
            'name' => $name,
            'description' => 'Demo server for checking the Mods tab.',
            'skip_scripts' => 0,
            'owner_id' => $owner,
            'memory' => 2048,
            'swap' => 0,
            'disk' => 10240,
            'io' => 500,
            'cpu' => 0,
            'oom_disabled' => 0,
            'allocation_id' => $allocation->id,
            'egg_id' => $egg,
            'startup' => $startup,
            'image' => 'ghcr.io/pterodactyl/yolks:java_21',
            'allocation_limit' => 5,
            'database_limit' => 2,
            'backup_limit' => 3,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('allocations')->where('id', $allocation->id)->update(['server_id' => $id]);
    }

    private function tag(int $egg, int $tag): void
    {
        DB::table('taggables')->insertOrIgnore(['tag_id' => $tag, 'kind' => 'egg', 'taggable_type' => 'egg', 'taggable_id' => $egg]);
    }

    /**
     * An egg row without the columns that must be unique or generated.
     *
     * @return array<string, mixed>
     */
    private function copyable(object $egg): array
    {
        $copy = get_object_vars($egg);
        unset($copy['id'], $copy['uuid'], $copy['created_at'], $copy['updated_at']);

        return $copy;
    }

    private function int(mixed $value, string $missing): int
    {
        return is_numeric($value) ? (int) $value : throw new RuntimeException($missing);
    }

    private function uuid(string $name): string
    {
        return Uuid::uuid5(Uuid::NAMESPACE_DNS, self::NAMESPACE.'-'.$name)->toString();
    }
}
