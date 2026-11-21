<?php

declare(strict_types=1);

namespace Pterodactyl\Services\Servers\Ports;

use Illuminate\Http\Response;
use Pterodactyl\Exceptions\Http\Connection\DaemonConnectionException;
use Pterodactyl\Facades\Daemon;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\ServerEnvSetting;

/**
 * Builds the environment file for a server and writes it through the daemon's file endpoint.
 */
final readonly class EnvFileSync
{
    /** What a secret extra variable shows as in a preview. */
    public const string MASK = '••••••••';

    /** The largest existing file the panel will merge into. */
    private const int MAX_EXISTING_BYTES = 1024 * 1024;

    public function __construct(private PortEnvironment $environment, private EnvFileBuilder $builder) {}

    /**
     * What would be written, with secret values masked.
     *
     * @return array{path: string, mode: string, format: string, content: string, conflicts: list<string>, writes_file: bool}
     */
    public function preview(Server $server, ServerEnvSetting $settings, bool $reachExisting = true): array
    {
        $values = $this->maskedValues($server, $settings);
        $existing = $settings->mode === 'managed' && $reachExisting ? $this->existing($server, $settings, tolerant: true) : '';
        $result = $this->builder->merge($existing, $values, $settings->format, $settings->mode, $settings->conflict_policy);

        return [
            'path' => $settings->file_name,
            'mode' => $settings->mode,
            'format' => $settings->format,
            'content' => $settings->mode === 'off' ? '' : $result->content,
            'conflicts' => $result->conflicts,
            'writes_file' => $settings->mode !== 'off',
        ];
    }

    /**
     * Writes the file for the current ports and settings. Does nothing in "off" mode.
     *
     * @return list<string>|null the keys the user's own file already defined, or null when nothing was written
     */
    public function write(Server $server, ServerEnvSetting $settings): ?array
    {
        if ($settings->mode === 'off') {
            return null;
        }

        $values = $this->environment->fileValues($server, $settings);
        $existing = $settings->mode === 'managed' ? $this->existing($server, $settings, tolerant: false) : '';
        $result = $this->builder->merge($existing, $values, $settings->format, $settings->mode, $settings->conflict_policy);

        Daemon::server($server)->files()->putContent('/'.$settings->file_name, $result->content);

        return $result->conflicts;
    }

    /**
     * @return array<string, string>
     */
    private function maskedValues(Server $server, ServerEnvSetting $settings): array
    {
        $values = $this->environment->all($server);
        foreach ($settings->extra as $extra) {
            if (! array_key_exists($extra['key'], $values)) {
                $values[$extra['key']] = $extra['secret'] ? self::MASK : $extra['value'];
            }
        }

        return $values;
    }

    private function existing(Server $server, ServerEnvSetting $settings, bool $tolerant): string
    {
        try {
            return Daemon::server($server)->files()->getContent('/'.$settings->file_name, self::MAX_EXISTING_BYTES);
        } catch (DaemonConnectionException $exception) {
            // A file that does not exist yet is simply empty.
            if ($exception->getStatusCode() === Response::HTTP_NOT_FOUND || $tolerant) {
                return '';
            }

            throw $exception;
        }
    }
}
