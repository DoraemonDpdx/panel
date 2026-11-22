<?php

declare(strict_types=1);

namespace Database\Factories;

use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\ServerModInstall;

/**
 * @extends Factory<ServerModInstall>
 */
class ServerModInstallFactory extends Factory
{
    /**
     * The name of the factory's corresponding model.
     *
     * @var string
     */
    protected $model = ServerModInstall::class;

    /**
     * Define the model's default state.
     */
    public function definition(): array
    {
        $name = fake()->unique()->word();

        return [
            'server_id' => Server::factory()->withRelationships(),
            'provider' => ServerModInstall::PROVIDER_MODRINTH,
            'project_id' => Str::random(8),
            'version_id' => Str::random(8),
            'slug' => $name,
            'project_type' => 'mod',
            'title' => ucfirst($name),
            'icon_url' => null,
            'filename' => $name.'-1.0.0.jar',
            'version_number' => '1.0.0',
            'sha512' => hash('sha512', $name),
            'sha1' => null,
            'install_dir' => 'mods',
            'enabled' => true,
        ];
    }
}
