<?php

declare(strict_types=1);

namespace Pterodactyl\Services\Servers\Mods\Content;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Psr\Http\Message\ResponseInterface;
use Pterodactyl\Exceptions\Mods\ContentUnavailableException;
use Throwable;

/**
 * Reads archives (modpack zips, mrpacks, server packs, world zips) from a provider's CDN for inspection.
 *
 * The panel never installs from these: it downloads one only to read its index, streamed to a temp file
 * under a size cap, and a listing is read with HTTP range requests. Every URL, including each redirect, must be
 * https on an allowed host with no userinfo or port.
 */
class RemoteArchive
{
    /** The largest archive the panel will download to read its index. */
    public const int DEFAULT_MAX_BYTES = 100 * 1024 * 1024;

    private const int MAX_REDIRECTS = 3;

    /** The most of a zip's central directory that is read. */
    private const int MAX_DIRECTORY_BYTES = 8 * 1024 * 1024;

    private const int TAIL_BYTES = 65536;

    /**
     * Downloads the archive to a temp file and returns its path. The caller deletes it.
     *
     * @param  list<string>  $hosts
     */
    public function download(string $url, array $hosts, ?int $maxBytes = null): string
    {
        $max = $maxBytes ?? $this->maxBytes();
        // A private, unguessable file in the app's own storage rather than the shared system temp dir.
        $dir = storage_path('app/content-tmp');
        if (! is_dir($dir) && ! @mkdir($dir, 0700, true) && ! is_dir($dir)) {
            throw new ContentUnavailableException('download_failed', 'The pack could not be downloaded.');
        }
        $path = $dir.'/pack-'.bin2hex(random_bytes(16));
        $handle = @fopen($path, 'x');
        if ($handle === false) {
            throw new ContentUnavailableException('download_failed', 'The pack could not be downloaded.');
        }
        fclose($handle);

        $exceeded = false;

        try {
            for ($hop = 0; ; $hop++) {
                $this->assertAllowed($url, $hosts);

                $response = Http::withUserAgent('astrelyse-panel/'.config('app.version'))
                    ->timeout(300)
                    ->withoutRedirecting()
                    ->withOptions([
                        'sink' => $path,
                        'on_headers' => function (ResponseInterface $response) use ($max, &$exceeded): void {
                            $length = (int) $response->getHeaderLine('Content-Length');
                            if ($length > $max) {
                                $exceeded = true;
                                throw new ContentUnavailableException('too_large', 'That pack is too large to inspect.');
                            }
                        },
                        'progress' => function (int $total, int $downloaded) use ($max, &$exceeded): void {
                            if ($downloaded > $max) {
                                $exceeded = true;
                                throw new ContentUnavailableException('too_large', 'That pack is too large to inspect.');
                            }
                        },
                    ])
                    ->get($url);

                if ($response->redirect() && $hop < self::MAX_REDIRECTS && $response->header('Location') !== '') {
                    $url = $this->absolute($url, $response->header('Location'));

                    continue;
                }

                break;
            }

            if ($response->failed()) {
                throw new ContentUnavailableException('download_failed', 'The pack could not be downloaded from the provider.');
            }

            clearstatcache(true, $path);
            if ((int) filesize($path) > $max) {
                throw new ContentUnavailableException('too_large', 'That pack is too large to inspect.');
            }

            return $path;
        } catch (Throwable $exception) {
            @unlink($path);

            if ($exceeded) {
                throw new ContentUnavailableException('too_large', 'That pack is too large to inspect.');
            }

            throw $exception instanceof ConnectionException
                ? new ContentUnavailableException('download_failed', 'The pack could not be downloaded from the provider.')
                : $exception;
        }
    }

    /**
     * The file names inside a remote zip, read from its central directory with range requests, or null when the
     * host does not support ranges or the zip cannot be read that way.
     *
     * @param  list<string>  $hosts
     * @return list<string>|null
     */
    public function names(string $url, array $hosts): ?array
    {
        try {
            $tail = $this->range($url, $hosts, '-'.self::TAIL_BYTES);
            if ($tail === null) {
                return null;
            }
            [$tailBytes, $total] = $tail;

            $eocd = mb_strrpos($tailBytes, "PK\x05\x06", 0, '8bit');
            if ($eocd === false || mb_strlen($tailBytes, '8bit') < $eocd + 22) {
                return null;
            }

            /** @var array{size: int, offset: int}|false $fields */
            $fields = unpack('Vsize/Voffset', mb_substr($tailBytes, $eocd + 12, 8, '8bit'));
            if ($fields === false || $fields['offset'] === 0xFFFFFFFF || $fields['size'] === 0xFFFFFFFF || $fields['size'] > self::MAX_DIRECTORY_BYTES) {
                return null;
            }

            $tailStart = $total - mb_strlen($tailBytes, '8bit');
            if ($fields['offset'] >= $tailStart) {
                $directory = mb_substr($tailBytes, $fields['offset'] - $tailStart, $fields['size'], '8bit');
            } else {
                $part = $this->range($url, $hosts, $fields['offset'].'-'.($fields['offset'] + $fields['size'] - 1));
                $directory = $part[0] ?? null;
            }

            return $directory === null ? null : $this->parseDirectory($directory);
        } catch (ContentUnavailableException $exception) {
            throw $exception;
        } catch (Throwable) {
            return null;
        }
    }

    /**
     * @return list<string>|null
     */
    private function parseDirectory(string $directory): ?array
    {
        $names = [];
        $position = 0;
        $length = mb_strlen($directory, '8bit');
        while ($position + 46 <= $length && mb_substr($directory, $position, 4, '8bit') === "PK\x01\x02") {
            /** @var array{name: int, extra: int, comment: int}|false $sizes */
            $sizes = unpack('vname/vextra/vcomment', mb_substr($directory, $position + 28, 6, '8bit'));
            if ($sizes === false) {
                return null;
            }
            $names[] = mb_substr($directory, $position + 46, $sizes['name'], '8bit');
            $position += 46 + $sizes['name'] + $sizes['extra'] + $sizes['comment'];
        }

        return $names;
    }

    /**
     * @param  list<string>  $hosts
     * @return array{string, int}|null the bytes and the total size of the file, or null without range support
     */
    private function range(string $url, array $hosts, string $range): ?array
    {
        for ($hop = 0; ; $hop++) {
            $this->assertAllowed($url, $hosts);

            try {
                $response = Http::withUserAgent('astrelyse-panel/'.config('app.version'))->timeout(30)->withoutRedirecting()->withHeaders(['Range' => "bytes=$range"])->get($url);
            } catch (ConnectionException) {
                return null;
            }

            if ($response->redirect() && $hop < self::MAX_REDIRECTS && $response->header('Location') !== '') {
                $url = $this->absolute($url, $response->header('Location'));

                continue;
            }

            break;
        }

        if ($response->status() !== 206 || preg_match('#/(\d+)$#', $response->header('Content-Range'), $matches) !== 1) {
            return null;
        }

        return [$this->body($response), (int) $matches[1]];
    }

    private function body(Response $response): string
    {
        return $response->body();
    }

    /**
     * @param  list<string>  $hosts
     */
    private function assertAllowed(string $url, array $hosts): void
    {
        $parts = parse_url($url);
        if ($parts === false || ($parts['scheme'] ?? null) !== 'https' || ! in_array(mb_strtolower($parts['host'] ?? ''), $hosts, true) || isset($parts['user']) || isset($parts['pass']) || isset($parts['port'])) {
            throw new ContentUnavailableException('foreign_host', 'That file is not hosted on the provider\'s download servers.', ['host' => is_array($parts) ? ($parts['host'] ?? null) : null]);
        }
    }

    private function absolute(string $base, string $location): string
    {
        if (preg_match('#^https?://#i', $location) === 1) {
            return $location;
        }

        $parts = parse_url($base);

        return ($parts['scheme'] ?? 'https').'://'.($parts['host'] ?? '').(str_starts_with($location, '/') ? $location : '/'.$location);
    }

    private function maxBytes(): int
    {
        $configured = config('content.max_archive_bytes');

        return is_int($configured) && $configured > 0 ? $configured : self::DEFAULT_MAX_BYTES;
    }
}
