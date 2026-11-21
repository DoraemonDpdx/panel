<?php

declare(strict_types=1);

namespace Pterodactyl\Tests\Integration\Api\Client\Server\Content;

use GuzzleHttp\Promise\PromiseInterface;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Pterodactyl\Tests\Support\Fakes\FakeDaemonFile;

/**
 * A Wings file fake that answers by path: folder listings and file contents differ per path, and a staging folder
 * (a uuid under .astrelyse/import) is written as `{id}` so a test can describe it.
 */
class ContentFiles extends FakeDaemonFile
{
    /** @var array<string, list<array{string, bool}>> folder => entries of [name, isFolder] */
    public array $tree = [];

    /** @var array<string, string> */
    public array $texts = [];

    protected function responseFor(Request $request): ?PromiseInterface
    {
        $path = (string) parse_url($request->url(), PHP_URL_PATH);
        if (preg_match('#^/api/servers/[^/]+/files/(list-directory|contents)$#', $path, $matches) === 1) {
            $query = $this->query($request);

            if ($matches[1] === 'list-directory') {
                $dir = $this->normalise($query['directory'] ?? '/');
                $this->record('getDirectory', ['path' => $dir]);
                if (! isset($this->tree[$dir])) {
                    return Http::response(['error' => 'The requested resource was not found on the system.'], 404);
                }

                return $this->reply(array_map(fn (array $entry): array => ['name' => $entry[0], 'mode' => '-rw-r--r--', 'mode_bits' => '0644', 'size' => 1, 'file' => ! $entry[1], 'symlink' => false, 'mime' => 'x', 'created' => '2024-01-01T00:00:00Z', 'modified' => '2024-01-01T00:00:00Z'], $this->tree[$dir]));
            }

            $file = $this->normalise($query['file'] ?? '');
            $this->record('getContent', ['path' => $file]);

            return isset($this->texts[$file]) ? $this->reply($this->texts[$file]) : Http::response(['error' => 'not found'], 404);
        }

        return parent::responseFor($request);
    }

    private function normalise(string $path): string
    {
        $path = (string) preg_replace('/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/', '{id}', $path);

        return $path === '' ? '/' : (mb_strlen($path) > 1 ? mb_rtrim($path, '/') : $path);
    }
}
