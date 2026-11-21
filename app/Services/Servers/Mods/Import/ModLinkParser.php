<?php

declare(strict_types=1);

namespace Pterodactyl\Services\Servers\Mods\Import;

/**
 * Reads a Modrinth or CurseForge URL and returns the project, version or file it points at, so the
 * import flow can look the mod up without the user typing its slug. This is pure string handling:
 * no requests are made.
 *
 * Only http and https URLs on an exact host from the allow list are accepted. Lookalike hosts
 * (modrinth.com.evil.io), userinfo and non-default ports are rejected, and so is any path that is
 * not a known project shape. Query strings and fragments are ignored.
 */
final readonly class ModLinkParser
{
    private const array MODRINTH_HOSTS = ['modrinth.com', 'www.modrinth.com', 'cdn.modrinth.com'];

    private const array CURSEFORGE_HOSTS = ['curseforge.com', 'www.curseforge.com'];

    /**
     * Modrinth path segment to project kind. `project/{id}` is handled separately and is a mod.
     */
    private const array MODRINTH_KINDS = [
        'mod' => 'mod',
        'plugin' => 'plugin',
        'datapack' => 'datapack',
        'modpack' => 'modpack',
        'shader' => 'shader',
        'resourcepack' => 'resourcepack',
    ];

    /**
     * CurseForge path segment (after /minecraft/) to project kind.
     */
    private const array CURSEFORGE_KINDS = [
        'mc-mods' => 'mod',
        'bukkit-plugins' => 'plugin',
        'modpacks' => 'modpack',
        'worlds' => 'world',
        'texture-packs' => 'resourcepack',
        'shaders' => 'shader',
    ];

    private const string MODRINTH_ID_PATTERN = '/^[A-Za-z0-9]{8}\z/';

    private const string SLUG_PATTERN = '/^[a-z0-9_\-.]{1,64}\z/i';

    private const string FILE_ID_PATTERN = '/^[0-9]{1,18}\z/';

    private const string CDN_FILE_PATTERN = '/^[\w.+%\-]{1,255}\z/';

    public function parse(string $url): ?ParsedLink
    {
        $url = mb_trim($url);

        if ($url === '' || mb_strlen($url) > 2048 || preg_match('/[\s\x00-\x1F\x7F]/', $url) === 1) {
            return null;
        }

        $parts = parse_url($url);

        if ($parts === false || ! isset($parts['scheme'], $parts['host'])) {
            return null;
        }

        if (! in_array(mb_strtolower($parts['scheme']), ['http', 'https'], true)) {
            return null;
        }

        if (isset($parts['user']) || isset($parts['pass']) || (isset($parts['port']) && ! in_array($parts['port'], [80, 443], true))) {
            return null;
        }

        $segments = $this->segments($parts['path'] ?? '');

        if ($segments === null) {
            return null;
        }

        $host = mb_strtolower($parts['host']);

        return match (true) {
            $host === 'cdn.modrinth.com' => $this->cdn($segments),
            in_array($host, self::MODRINTH_HOSTS, true) => $this->modrinth($segments),
            in_array($host, self::CURSEFORGE_HOSTS, true) => $this->curseforge($segments),
            default => null,
        };
    }

    /**
     * Splits a path into segments. One trailing slash is tolerated. An empty segment (a double
     * slash) makes the path invalid.
     *
     * @return list<string>|null
     */
    private function segments(string $path): ?array
    {
        $path = mb_rtrim($path, '/');

        if ($path === '') {
            return [];
        }

        if (! str_starts_with($path, '/')) {
            return null;
        }

        $segments = explode('/', mb_substr($path, 1));

        return in_array('', $segments, true) ? null : $segments;
    }

    /**
     * @param  list<string>  $segments
     */
    private function modrinth(array $segments): ?ParsedLink
    {
        $count = count($segments);

        if ($count === 2 && $segments[0] === 'project' && $this->isModrinthId($segments[1])) {
            return new ParsedLink('modrinth', 'mod', $segments[1]);
        }

        if (($count !== 2 && $count !== 4) || ! isset(self::MODRINTH_KINDS[mb_strtolower($segments[0])]) || ! $this->isSlug($segments[1])) {
            return null;
        }

        $kind = self::MODRINTH_KINDS[mb_strtolower($segments[0])];

        if ($count === 2) {
            return new ParsedLink('modrinth', $kind, $segments[1]);
        }

        // Modrinth version pages are addressed by id ("ZouiUX7t") or, far more often in shared
        // links, by version number ("mc1.21.1-0.13.1"); its API resolves both under the project.
        if ($segments[2] !== 'version' || ! ($this->isModrinthId($segments[3]) || $this->isVersionNumber($segments[3]))) {
            return null;
        }

        return new ParsedLink('modrinth', $kind, $segments[1], versionId: $segments[3]);
    }

    private function isVersionNumber(string $value): bool
    {
        return preg_match('/^[A-Za-z0-9][A-Za-z0-9._+\-]{0,63}$/', $value) === 1 && ! str_contains($value, '..');
    }

    /**
     * CDN links carry no project type, so the kind defaults to `mod`. Resolve the real kind from
     * the project before installing.
     *
     * @param  list<string>  $segments
     */
    private function cdn(array $segments): ?ParsedLink
    {
        if (count($segments) !== 5 || $segments[0] !== 'data' || $segments[2] !== 'versions') {
            return null;
        }

        if (! $this->isModrinthId($segments[1]) || ! $this->isModrinthId($segments[3]) || preg_match(self::CDN_FILE_PATTERN, $segments[4]) !== 1) {
            return null;
        }

        return new ParsedLink('modrinth', 'mod', $segments[1], versionId: $segments[3]);
    }

    /**
     * @param  list<string>  $segments
     */
    private function curseforge(array $segments): ?ParsedLink
    {
        $count = count($segments);

        if (($count !== 3 && $count !== 5) || mb_strtolower($segments[0]) !== 'minecraft') {
            return null;
        }

        $kind = self::CURSEFORGE_KINDS[mb_strtolower($segments[1])] ?? null;

        if ($kind === null || ! $this->isSlug($segments[2])) {
            return null;
        }

        if ($count === 3) {
            return new ParsedLink('curseforge', $kind, $segments[2]);
        }

        if (! in_array($segments[3], ['files', 'download'], true) || preg_match(self::FILE_ID_PATTERN, $segments[4]) !== 1) {
            return null;
        }

        return new ParsedLink('curseforge', $kind, $segments[2], fileId: $segments[4]);
    }

    private function isModrinthId(string $value): bool
    {
        return preg_match(self::MODRINTH_ID_PATTERN, $value) === 1;
    }

    private function isSlug(string $value): bool
    {
        return preg_match(self::SLUG_PATTERN, $value) === 1;
    }
}
