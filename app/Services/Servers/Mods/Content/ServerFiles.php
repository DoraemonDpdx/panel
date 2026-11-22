<?php

declare(strict_types=1);

namespace Pterodactyl\Services\Servers\Mods\Content;

use Illuminate\Support\Str;
use Pterodactyl\Exceptions\Http\Connection\DaemonConnectionException;
use Pterodactyl\Exceptions\Mods\ContentUnavailableException;
use Pterodactyl\Facades\Daemon;
use Pterodactyl\Models\Server;
use Throwable;

/**
 * The few things content installs need to know about a server's disk, and the staging area for archives the user
 * uploaded. Everything the panel stages lives under `/.astrelyse/import/<id>/`.
 */
class ServerFiles
{
    public const string IMPORT_ROOT = '.astrelyse/import';

    public const string UPLOAD_ROOT = '.astrelyse/uploads';

    public const string PACK_NAME = 'pack.zip';

    /** The largest server.properties the panel reads. */
    private const int PROPERTIES_LIMIT = 1024 * 1024;

    /**
     * The world folder name from server.properties, `world` when it is not set or cannot be read.
     */
    public function levelName(Server $server): string
    {
        try {
            $properties = Daemon::server($server)->files()->getContent('/server.properties', self::PROPERTIES_LIMIT);
        } catch (Throwable) {
            return 'world';
        }

        if (preg_match('/^level-name=(.*)$/m', $properties, $match) === 1) {
            $name = mb_trim($match[1]);
            if ($this->validLevelName($name)) {
                return $name;
            }
        }

        return 'world';
    }

    public function validLevelName(string $name): bool
    {
        return preg_match('/^[A-Za-z0-9][A-Za-z0-9 _.\-]{0,63}$/', $name) === 1 && ! str_contains($name, '..') && $name !== '.astrelyse';
    }

    /**
     * Names of the entries in the server's root folder, or an empty list when it cannot be read.
     *
     * @return list<string>
     */
    public function rootEntries(Server $server): array
    {
        return array_column($this->listing($server, '/'), 'name');
    }

    /**
     * Sets `level-name` in server.properties.
     */
    public function setLevelName(Server $server, string $name): void
    {
        try {
            $properties = Daemon::server($server)->files()->getContent('/server.properties', self::PROPERTIES_LIMIT);
        } catch (Throwable) {
            $properties = '';
        }

        $properties = preg_match('/^level-name=.*$/m', $properties) === 1
            ? (string) preg_replace('/^level-name=.*$/m', 'level-name='.$name, $properties, 1)
            : mb_rtrim($properties, "\n")."\nlevel-name=$name\n";

        Daemon::server($server)->files()->putContent('/server.properties', mb_ltrim($properties, "\n"));
    }

    /**
     * Moves a file the user uploaded into a fresh staging folder, so it can be unpacked and inspected.
     *
     * @return array{id: string, dir: string, zip: string, original: string}
     */
    public function stage(Server $server, string $path): array
    {
        $path = $this->cleanPath($path);
        $id = (string) Str::uuid();
        $dir = self::IMPORT_ROOT.'/'.$id;
        $files = Daemon::server($server)->files();

        $this->assertIsFile($server, $path);

        $files->createDirectory('.astrelyse', '/');
        $files->createDirectory('import', '/.astrelyse');
        $files->createDirectory($id, '/.astrelyse/import');
        $files->renameFiles('/', [['from' => $path, 'to' => $dir.'/'.self::PACK_NAME]]);

        return ['id' => $id, 'dir' => $dir, 'zip' => $dir.'/'.self::PACK_NAME, 'original' => $path];
    }

    /**
     * Unpacks a staged archive into its staging folder.
     *
     * @param  array{id: string, dir: string, zip: string, original: string}  $staged
     */
    public function unpack(Server $server, array $staged): void
    {
        Daemon::server($server)->files()->decompressFile('/'.$staged['dir'], self::PACK_NAME);
    }

    /**
     * Removes everything unpacked from a staged archive, keeping the archive itself for the install to read.
     *
     * @param  array{id: string, dir: string, zip: string, original: string}  $staged
     */
    public function clearUnpacked(Server $server, array $staged): void
    {
        $names = array_values(array_filter(array_column($this->listing($server, '/'.$staged['dir']), 'name'), fn (string $name): bool => $name !== self::PACK_NAME));
        if ($names !== []) {
            Daemon::server($server)->files()->deleteFiles('/'.$staged['dir'], $names);
        }
    }

    /**
     * Puts a staged archive back where the user left it and removes the staging folder. Used when an import is refused.
     *
     * @param  array{id: string, dir: string, zip: string, original: string}  $staged
     */
    public function restore(Server $server, array $staged): void
    {
        try {
            $this->clearUnpacked($server, $staged);
            Daemon::server($server)->files()->renameFiles('/', [['from' => $staged['zip'], 'to' => $staged['original']]]);
            Daemon::server($server)->files()->deleteFiles('/'.self::IMPORT_ROOT, [$staged['id']]);
        } catch (Throwable) {
            // The staging folder is under .astrelyse and harmless if it stays.
        }
    }

    /**
     * A file in a staged folder, read as text.
     */
    public function read(Server $server, string $path, int $limit = 16 * 1024 * 1024): ?string
    {
        try {
            return Daemon::server($server)->files()->getContent('/'.mb_ltrim($path, '/'), $limit);
        } catch (Throwable) {
            return null;
        }
    }

    /**
     * Entries (name and whether it is a folder) in a folder.
     *
     * @return list<array{name: string, directory: bool}>
     */
    public function listing(Server $server, string $path): array
    {
        try {
            $entries = Daemon::server($server)->files()->getDirectory($path);
        } catch (DaemonConnectionException $exception) {
            if ($exception->getStatusCode() === 404) {
                return [];
            }

            throw $exception;
        }

        $result = [];
        foreach ($entries as $entry) {
            $name = $entry['name'] ?? null;
            if (is_string($name)) {
                $result[] = ['name' => $name, 'directory' => ($entry['file'] ?? true) === false && ($entry['symlink'] ?? false) !== true];
            }
        }

        return $result;
    }

    /**
     * The shallowest folder inside a staged folder that holds a `level.dat`, as a path with a trailing slash relative
     * to it (an empty string when it sits at the top), or null when there is none.
     */
    public function findLevelRoot(Server $server, string $dir, int $depth = 3): ?string
    {
        for ($level = 0; $level <= $depth; $level++) {
            $found = $this->levelRootAt($server, $dir, '', $level);
            if ($found !== null) {
                return $found;
            }
        }

        return null;
    }

    /**
     * Looks for level.dat exactly `$remaining` folders below `$relative`.
     */
    private function levelRootAt(Server $server, string $dir, string $relative, int $remaining): ?string
    {
        $entries = $this->listing($server, '/'.$dir.($relative === '' ? '' : '/'.mb_rtrim($relative, '/')));

        if ($remaining === 0) {
            return array_any($entries, fn (array $entry): bool => $entry['name'] === 'level.dat' && ! $entry['directory']) ? $relative : null;
        }

        foreach ($entries as $entry) {
            if ($entry['directory'] && $entry['name'] !== '__MACOSX') {
                $found = $this->levelRootAt($server, $dir, $relative.$entry['name'].'/', $remaining - 1);
                if ($found !== null) {
                    return $found;
                }
            }
        }

        return null;
    }

    /**
     * Only files the upload flow put in `/.astrelyse/uploads/` can be imported: no traversal, a plain file name, and a
     * .zip or .mrpack extension.
     */
    private function cleanPath(string $path): string
    {
        $path = mb_ltrim($path, '/');
        $prefix = self::UPLOAD_ROOT.'/';
        $name = str_starts_with($path, $prefix) ? mb_substr($path, mb_strlen($prefix)) : '';

        if ($name === '' || str_contains($name, '/') || str_contains($path, '..') || preg_match('/^[\w.\-+ ()]+$/u', $name) !== 1) {
            throw new ContentUnavailableException('invalid_path', 'Only files uploaded to .astrelyse/uploads can be imported.');
        }
        if (preg_match('/\.(zip|mrpack)$/i', $name) !== 1) {
            throw new ContentUnavailableException('invalid_path', 'Choose a .zip or .mrpack file.');
        }

        return $path;
    }

    private function assertIsFile(Server $server, string $path): void
    {
        $directory = dirname($path) === '.' ? '/' : '/'.dirname($path);
        $entry = array_find($this->listing($server, $directory), fn (array $item): bool => $item['name'] === basename($path));
        if ($entry === null || $entry['directory']) {
            throw new ContentUnavailableException('file_not_found', 'That file was not found on the server.');
        }
    }
}
