<?php

declare(strict_types=1);

namespace Pterodactyl\Models;

use Illuminate\Database\Eloquent\Attributes\Guarded;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * How a server's generated environment file is written.
 *
 * @property string $file_name
 * @property string $format
 * @property string $mode
 * @property string $conflict_policy
 * @property list<array{key: string, value: string, secret: bool}> $extra
 * @property bool $restart_required
 */
#[Guarded(['id', 'created_at', 'updated_at'])]
class ServerEnvSetting extends Model
{
    public const string RESOURCE_NAME = 'server_env_setting';

    public const array FORMATS = ['dotenv', 'json', 'yaml'];

    public const array MODES = ['managed', 'separate', 'off'];

    public const array CONFLICT_POLICIES = ['panel', 'user', 'warn'];

    protected $attributes = [
        'file_name' => '.env',
        'format' => 'dotenv',
        'mode' => 'managed',
        'conflict_policy' => 'warn',
        'restart_required' => false,
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'server_id' => 'integer',
            'extra' => 'array',
            'restart_required' => 'boolean',
        ];
    }

    /**
     * @return BelongsTo<Server, $this>
     */
    public function server(): BelongsTo
    {
        return $this->belongsTo(Server::class);
    }

    public static function forServer(Server $server): self
    {
        return self::query()->firstOrCreate(['server_id' => $server->id], ['extra' => []]);
    }
}
