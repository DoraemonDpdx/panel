<?php

declare(strict_types=1);

namespace Pterodactyl\Services\Servers\Software;

use Pterodactyl\Exceptions\Software\InvalidInstallPlanException;

/**
 * Everything the Astrelyse install script should do on the next reinstall, as a value object.
 *
 * The panel writes `toJson()` to `/.astrelyse/plan.json` and stores `sha256()` in the server's
 * ASTRELYSE_PLAN_SHA256 variable. The script refuses a plan whose hash does not match. The JSON is
 * deterministic: fixed key order, no whitespace, unescaped slashes, so the same plan always has the same hash.
 *
 * Every rule here is enforced a second time by the install script.
 *
 * Script order: verify hash, moves, wipe, remove, software, files, archives, eula, delete the plan.
 *
 * @phpstan-type PlanFile array<string, mixed>
 * @phpstan-type PlanArchive array<string, mixed>
 * @phpstan-type PlanSoftware array{type: string, minecraft: string, loader: string|null}
 */
final readonly class InstallPlan
{
    public const int VERSION = 1;

    /** @var list<string> */
    public const array OPERATIONS = ['software', 'modpack', 'world', 'clear', 'mods'];

    /** @var list<string> */
    public const array SOFTWARE_TYPES = ['vanilla', 'paper', 'purpur', 'folia', 'fabric', 'quilt', 'forge', 'neoforge'];

    /**
     * The only hosts a plan may download from, and the only hosts the install script will talk to.
     * (`fill.papermc.io` is the Paper v3 metadata host, `fill-data.papermc.io` serves its jars.)
     *
     * @var list<string>
     */
    public const array ALLOWED_HOSTS = [
        'cdn.modrinth.com',
        'edge.forgecdn.net',
        'mediafilez.forgecdn.net',
        'piston-meta.mojang.com',
        'piston-data.mojang.com',
        'meta.fabricmc.net',
        'maven.fabricmc.net',
        'meta.quiltmc.org',
        'maven.quiltmc.org',
        'maven.minecraftforge.net',
        'maven.neoforged.net',
        'api.papermc.io',
        'fill.papermc.io',
        'fill-data.papermc.io',
        'api.purpurmc.org',
    ];

    /**
     * What a wipe leaves alone. `.astrelyse` is always kept as well, since it holds the plan and uploads.
     *
     * @var list<string>
     */
    public const array DEFAULT_KEEP = ['world', 'world_nether', 'world_the_end', 'server.properties', 'ops.json', 'whitelist.json', 'banned-players.json', 'banned-ips.json', 'eula.txt'];

    /** @var list<string> */
    public array $keep;

    /** @var list<array<string, string>> */
    public array $moves;

    /** @var list<string> */
    public array $remove;

    /** @var list<PlanFile> */
    public array $files;

    /** @var list<PlanArchive> */
    public array $archives;

    /** @var PlanSoftware|null */
    public ?array $software;

    /**
     * @param  array<string, mixed>|null  $software
     * @param  array<int, mixed>  $keep  entries (top level, relative) a wipe leaves in place
     * @param  array<int, array<string, mixed>>  $moves  renames done before the wipe, for backups and disabling folders
     * @param  array<int, mixed>  $remove
     * @param  array<int, array<string, mixed>>  $files  path, url, sha1 and/or sha512, size
     * @param  array<int, array<string, mixed>>  $archives  url or local, sha1 (required with url), strip, into, only
     */
    public function __construct(
        public string $operation,
        public bool $wipe = false,
        array $keep = self::DEFAULT_KEEP,
        ?array $software = null,
        array $moves = [],
        array $remove = [],
        array $files = [],
        array $archives = [],
        public bool $eula = true,
    ) {
        throw_unless(in_array($operation, self::OPERATIONS, true), InvalidInstallPlanException::class, "Unknown plan operation [$operation].");

        $this->keep = array_map(fn (mixed $path): string => self::safePath($path), array_values($keep));
        $this->software = $software === null ? null : $this->normaliseSoftware($software);
        $this->moves = array_map(fn (array $move): array => [
            'from' => self::safePath($move['from'] ?? null),
            'to' => self::safePath($move['to'] ?? null),
        ], array_values($moves));
        $this->remove = array_map(fn (mixed $path): string => self::safePath($path), array_values($remove));
        $this->files = array_map($this->normaliseFile(...), array_values($files));
        $this->archives = array_map($this->normaliseArchive(...), array_values($archives));
    }

    /**
     * @param  array<string, mixed>  $software
     * @param  array<int, string>  $keep
     * @param  array<int, array<string, string>>  $moves
     * @param  array<int, string>  $remove
     */
    public static function forSoftware(array $software, bool $wipe = false, array $keep = self::DEFAULT_KEEP, array $moves = [], array $remove = []): self
    {
        return new self('software', $wipe, $keep, $software, $moves, $remove);
    }

    /**
     * A wipe with no software change; the script reinstalls the current software from the variables afterwards.
     *
     * @param  list<string>|null  $worlds  the world folders to keep, defaulting to the stock three
     */
    public static function forClear(bool $keepWorlds, ?array $worlds = null): self
    {
        return new self('clear', true, $keepWorlds ? ($worlds ?? ['world', 'world_nether', 'world_the_end']) : []);
    }

    /** Whether the https URL points at an allowed host, with no userinfo, port or odd scheme. */
    public static function isAllowedUrl(mixed $url): bool
    {
        if (! is_string($url) || $url === '' || preg_match('/[\x00-\x20\x7f\\\\]/', $url) === 1) {
            return false;
        }

        $parts = parse_url($url);
        if ($parts === false || ($parts['scheme'] ?? '') !== 'https') {
            return false;
        }

        if (isset($parts['user']) || isset($parts['pass']) || isset($parts['port']) || isset($parts['fragment'])) {
            return false;
        }

        return in_array(mb_strtolower($parts['host'] ?? ''), self::ALLOWED_HOSTS, true);
    }

    /**
     * A server-relative path that stays inside the server: no absolute paths, no `..`, no backslashes, no NUL.
     *
     * @throws InvalidInstallPlanException
     */
    public static function safePath(mixed $path, bool $allowEmpty = false): string
    {
        if (! is_string($path)) {
            throw new InvalidInstallPlanException('A plan path must be a string.');
        }

        if ($path === '') {
            return $allowEmpty ? '' : throw new InvalidInstallPlanException('A plan path cannot be empty.');
        }

        if (preg_match('/[\x00-\x1f\x7f\\\\]/', $path) === 1 || str_starts_with($path, '/') || preg_match('/^[A-Za-z]:/', $path) === 1) {
            throw new InvalidInstallPlanException("The plan path [$path] must be relative to the server.");
        }

        $trimmed = mb_rtrim($path, '/');
        foreach (explode('/', $trimmed) as $segment) {
            if ($segment === '' || $segment === '.' || $segment === '..') {
                throw new InvalidInstallPlanException("The plan path [$path] must stay inside the server.");
            }
        }

        return $path;
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return [
            'version' => self::VERSION,
            'operation' => $this->operation,
            'wipe' => ['enabled' => $this->wipe, 'keep' => $this->keep],
            'software' => $this->software,
            'moves' => $this->moves,
            'remove' => $this->remove,
            'files' => $this->files,
            'archives' => $this->archives,
            'eula' => $this->eula,
        ];
    }

    /** Compact, key-ordered JSON: the exact bytes that are hashed and written. */
    public function toJson(): string
    {
        return json_encode($this->toArray(), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    }

    public function sha256(): string
    {
        return hash('sha256', $this->toJson());
    }

    /**
     * @param  array<string, mixed>  $software
     * @return PlanSoftware
     */
    private function normaliseSoftware(array $software): array
    {
        $type = $software['type'] ?? null;
        $minecraft = $software['minecraft'] ?? null;
        $loader = $software['loader'] ?? null;

        throw_unless(is_string($type) && in_array($type, self::SOFTWARE_TYPES, true), InvalidInstallPlanException::class, 'Unknown software type.');
        throw_unless(is_string($minecraft) && preg_match('/^[A-Za-z0-9][A-Za-z0-9._\-+]{0,63}$/', $minecraft) === 1, InvalidInstallPlanException::class, 'Invalid Minecraft version.');
        throw_unless($loader === null || (is_string($loader) && ($loader === '' || preg_match('/^[A-Za-z0-9][A-Za-z0-9._\-+]{0,63}$/', $loader) === 1)), InvalidInstallPlanException::class, 'Invalid loader version.');

        return ['type' => $type, 'minecraft' => $minecraft, 'loader' => $loader === '' ? null : $loader];
    }

    /**
     * @param  array<string, mixed>  $file
     * @return PlanFile
     */
    private function normaliseFile(array $file): array
    {
        $url = $file['url'] ?? null;
        throw_unless(self::isAllowedUrl($url), InvalidInstallPlanException::class, 'The plan file URL is not on an allowed host.');

        $sha1 = $this->hash($file['sha1'] ?? null, 40);
        $sha512 = $this->hash($file['sha512'] ?? null, 128);
        throw_if($sha1 === null && $sha512 === null, InvalidInstallPlanException::class, 'Every plan file needs a sha1 or sha512.');

        $size = $file['size'] ?? null;

        return [
            'path' => self::safePath($file['path'] ?? null),
            'url' => $url,
            'sha1' => $sha1,
            'sha512' => $sha512,
            'size' => is_int($size) && $size >= 0 ? $size : null,
        ];
    }

    /**
     * @param  array<string, mixed>  $archive
     * @return PlanArchive
     */
    private function normaliseArchive(array $archive): array
    {
        $url = $archive['url'] ?? null;
        $local = $archive['local'] ?? null;

        throw_unless(($url === null) !== ($local === null), InvalidInstallPlanException::class, 'An archive needs exactly one of url or local.');

        $sha1 = $this->hash($archive['sha1'] ?? null, 40);
        if ($url !== null) {
            throw_unless(self::isAllowedUrl($url), InvalidInstallPlanException::class, 'The plan archive URL is not on an allowed host.');
            throw_if($sha1 === null, InvalidInstallPlanException::class, 'A downloaded archive needs a sha1.');
        }

        $only = $archive['only'] ?? null;

        return [
            'url' => $url,
            'local' => $local === null ? null : self::safePath($local),
            'sha1' => $sha1,
            'strip' => self::safePath($archive['strip'] ?? '', allowEmpty: true),
            'into' => self::safePath($archive['into'] ?? '', allowEmpty: true),
            'only' => $only === null || $only === '' ? null : self::safePath($only),
        ];
    }

    private function hash(mixed $value, int $length): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        throw_unless(is_string($value) && preg_match('/^[0-9a-f]{'.$length.'}$/', mb_strtolower($value)) === 1, InvalidInstallPlanException::class, 'A plan hash is not valid hex of the right length.');

        return mb_strtolower($value);
    }
}
