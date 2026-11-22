<?php

declare(strict_types=1);

namespace Pterodactyl\Models;

use Database\Factories\ServerModInstallFactory;
use Illuminate\Database\Eloquent\Attributes\Guarded;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A mod or plugin installed on a server from Modrinth.
 *
 * @property int $id
 * @property int $server_id
 * @property string $provider
 * @property string $project_id
 * @property string $version_id
 * @property string|null $slug
 * @property string $project_type
 * @property string $title
 * @property string|null $icon_url
 * @property string $filename
 * @property string $version_number
 * @property string|null $sha512
 * @property string|null $sha1
 * @property string $install_dir
 * @property bool $enabled
 * @property bool $from_modpack
 * @property-read Server $server
 */
#[Guarded(['id', 'created_at', 'updated_at'])]
class ServerModInstall extends Model
{
    /** @use HasFactory<ServerModInstallFactory> */
    use HasFactory;

    public const string RESOURCE_NAME = 'server_mod_install';

    public const string PROVIDER_MODRINTH = 'modrinth';

    protected $attributes = [
        'provider' => self::PROVIDER_MODRINTH,
        'project_type' => 'mod',
        'enabled' => true,
        'from_modpack' => false,
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'server_id' => 'integer',
            'enabled' => 'boolean',
            'from_modpack' => 'boolean',
        ];
    }

    /**
     * @return BelongsTo<Server, $this>
     */
    public function server(): BelongsTo
    {
        return $this->belongsTo(Server::class);
    }
}
