<?php

declare(strict_types=1);

namespace Pterodactyl\Models;

use Illuminate\Database\Eloquent\Attributes\Guarded;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One run of the Astrelyse install script: a software switch, a reinstall, a clear, a modpack
 * or a world. It is opened when the plan is written and closed when Wings reports the install result.
 *
 * @property int $id
 * @property int $server_id
 * @property int|null $user_id
 * @property string $kind
 * @property string $status
 * @property array<string, mixed>|null $summary
 * @property string|null $plan_sha256
 * @property string|null $error
 * @property \Carbon\CarbonImmutable|null $started_at
 * @property \Carbon\CarbonImmutable|null $finished_at
 * @property-read Server $server
 */
#[Guarded(['id', 'created_at', 'updated_at'])]
class InstallOperation extends Model
{
    public const string RESOURCE_NAME = 'install_operation';

    public const string PENDING = 'pending';

    public const string RUNNING = 'running';

    public const string SUCCEEDED = 'succeeded';

    public const string FAILED = 'failed';

    protected $table = 'server_install_operations';

    protected $attributes = ['status' => self::PENDING];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'server_id' => 'integer',
            'user_id' => 'integer',
            'summary' => 'array',
            'started_at' => 'immutable_datetime',
            'finished_at' => 'immutable_datetime',
        ];
    }

    /**
     * Operations are addressed by their numeric id in the client API.
     */
    public function getRouteKeyName(): string
    {
        return 'id';
    }

    /**
     * @return BelongsTo<Server, $this>
     */
    public function server(): BelongsTo
    {
        return $this->belongsTo(Server::class);
    }

    /**
     * @return array<string, mixed>
     */
    public function toPayload(): array
    {
        return [
            'id' => $this->id,
            'kind' => $this->kind,
            'status' => $this->status,
            'summary' => $this->summary ?? [],
            'error' => $this->error,
            'started_at' => $this->started_at?->toIso8601String(),
            'finished_at' => $this->finished_at?->toIso8601String(),
        ];
    }
}
