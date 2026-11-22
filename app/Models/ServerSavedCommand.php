<?php

declare(strict_types=1);

namespace Pterodactyl\Models;

use Illuminate\Database\Eloquent\Attributes\Guarded;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A console command pinned to a server, shared with every user who has the console permission.
 *
 * @property int $id
 * @property int $server_id
 * @property string $label
 * @property string $command
 * @property bool $confirm
 * @property int $position
 * @property-read Server $server
 */
#[Guarded(['id', 'created_at', 'updated_at'])]
class ServerSavedCommand extends Model
{
    public const string RESOURCE_NAME = 'server_saved_command';

    /** The most commands a server can pin. */
    public const int LIMIT = 24;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'server_id' => 'integer',
            'confirm' => 'boolean',
            'position' => 'integer',
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
