<?php

declare(strict_types=1);

namespace Pterodactyl\Models;

use Illuminate\Database\Eloquent\Attributes\Guarded;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * The modpack a server was last set up from.
 *
 * @property int $id
 * @property int $server_id
 * @property string $provider
 * @property string $project_id
 * @property string $version_id
 * @property string $title
 * @property string|null $icon_url
 * @property string $version_number
 * @property-read Server $server
 */
#[Guarded(['id', 'created_at', 'updated_at'])]
class ServerModpack extends Model
{
    public const string RESOURCE_NAME = 'server_modpack';

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return ['server_id' => 'integer'];
    }

    /**
     * @return BelongsTo<Server, $this>
     */
    public function server(): BelongsTo
    {
        return $this->belongsTo(Server::class);
    }

    /**
     * @return array{provider: string, project_id: string, version_id: string, title: string, icon_url: string|null, version_number: string}
     */
    public function toPayload(): array
    {
        return [
            'provider' => $this->provider,
            'project_id' => $this->project_id,
            'version_id' => $this->version_id,
            'title' => $this->title,
            'icon_url' => $this->icon_url,
            'version_number' => $this->version_number,
        ];
    }
}
