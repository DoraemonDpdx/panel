<?php

declare(strict_types=1);

namespace Pterodactyl\Models;

use Illuminate\Database\Eloquent\Attributes\Guarded;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Binds a named port role (such as QUERY_PORT) on a server to one of its allocations.
 *
 * @property-read Allocation $allocation
 * @property-read Server $server
 */
#[Guarded(['id', 'created_at', 'updated_at'])]
class ServerPortBinding extends Model
{
    public const string RESOURCE_NAME = 'server_port_binding';

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'server_id' => 'integer',
            'allocation_id' => 'integer',
            'auto' => 'boolean',
        ];
    }

    /**
     * @return BelongsTo<Server, $this>
     */
    public function server(): BelongsTo
    {
        return $this->belongsTo(Server::class);
    }

    /**
     * @return BelongsTo<Allocation, $this>
     */
    public function allocation(): BelongsTo
    {
        return $this->belongsTo(Allocation::class);
    }
}
