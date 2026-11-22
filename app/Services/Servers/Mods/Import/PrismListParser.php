<?php

declare(strict_types=1);

namespace Pterodactyl\Services\Servers\Mods\Import;

use JsonException;

/**
 * Reads a mod list exported from Prism Launcher ("Export mod list") and returns one entry per mod.
 * Accepts the HTML, Markdown, plaintext, JSON and CSV exports, and a plain list of URLs. The format
 * is detected from the text itself.
 *
 * Entries are de-duplicated: an entry is dropped if its url or its lowercased name was already
 * seen, so the first occurrence wins. The result is capped at 1000 entries. Pure string handling,
 * no I/O.
 */
final readonly class PrismListParser
{
    private const int MAX_ENTRIES = 1000;

    /**
     * @return list<PrismEntry>
     */
    public function parse(string $text): array
    {
        $text = $this->normalise($text);

        $entries = $this->parseJson($text)
            ?? $this->parseCsv($text)
            ?? $this->parseHtml($text)
            ?? $this->parseMarkdown($text)
            ?? $this->parseLines($text);

        return $this->finalise($entries);
    }

    /**
     * Strips a byte order mark and turns CRLF and CR into LF. Line count is unchanged, so line
     * numbers still match the original text.
     */
    private function normalise(string $text): string
    {
        $text = preg_replace('/\A\xEF\xBB\xBF/', '', $text) ?? $text;

        return str_replace(["\r\n", "\r"], "\n", $text);
    }

    /**
     * @return list<PrismEntry>|null
     */
    private function parseJson(string $text): ?array
    {
        $trimmed = mb_trim($text);

        if (! str_starts_with($trimmed, '[')) {
            return null;
        }

        try {
            $decoded = json_decode($trimmed, true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            return null;
        }

        if (! is_array($decoded)) {
            return null;
        }

        $entries = [];
        foreach (array_values($decoded) as $index => $item) {
            if (! is_array($item)) {
                continue;
            }

            $url = $this->httpUrl($this->field($item['url'] ?? null));
            $filename = $this->field($item['filename'] ?? null);
            $name = $this->field($item['name'] ?? null) ?? $filename ?? ($url !== null ? $this->nameFromUrl($url) : null);

            if ($name === null) {
                continue;
            }

            $entries[] = new PrismEntry($index + 1, $name, $url, $this->field($item['version'] ?? null), $filename);
        }

        return $entries;
    }

    /**
     * A CSV export has a header row with a name or url column, in any order.
     *
     * @return list<PrismEntry>|null
     */
    private function parseCsv(string $text): ?array
    {
        $lines = explode("\n", $text);
        $headerAt = null;
        $columns = [];

        foreach ($lines as $index => $line) {
            if (mb_trim($line) === '') {
                continue;
            }

            $cells = array_map(
                fn (?string $cell): string => mb_strtolower(mb_trim((string) $cell)),
                str_getcsv($line),
            );

            if (count($cells) < 2 || (! in_array('name', $cells, true) && ! in_array('url', $cells, true))) {
                return null;
            }

            $headerAt = $index;
            $columns = array_flip($cells);
            break;
        }

        if ($headerAt === null) {
            return null;
        }

        $entries = [];
        foreach (array_slice($lines, $headerAt + 1, null, true) as $index => $line) {
            if (mb_trim($line) === '') {
                continue;
            }

            $cells = str_getcsv($line);
            $cell = fn (string $column): ?string => isset($columns[$column]) ? $this->field($cells[$columns[$column]] ?? null) : null;

            $url = $this->httpUrl($cell('url'));
            $name = $cell('name') ?? $cell('filename') ?? ($url !== null ? $this->nameFromUrl($url) : null);

            if ($name === null) {
                continue;
            }

            $entries[] = new PrismEntry($index + 1, $name, $url, $cell('version'), $cell('filename'));
        }

        return $entries;
    }

    /**
     * Each `<li>` is one mod. The first anchor gives the name and url. Text after it, or the whole
     * item when there is no anchor, gives the version in brackets.
     *
     * @return list<PrismEntry>|null
     */
    private function parseHtml(string $text): ?array
    {
        if (preg_match('/<(?:li|ul|a)\b/i', $text) !== 1) {
            return null;
        }

        preg_match_all(
            '/<li\b[^>]*>(.*?)(?:<\/li\s*>|(?=<li\b)|<\/ul\s*>|\z)/is',
            $text,
            $matches,
            PREG_SET_ORDER | PREG_OFFSET_CAPTURE,
        );

        preg_match_all('/\n/', $text, $newlines, PREG_OFFSET_CAPTURE);
        $newlineAt = array_column($newlines[0], 1);

        // Matches arrive in offset order, so one cursor over the newlines gives each line number.
        $line = 1;
        $cursor = 0;
        $entries = [];
        foreach ($matches as $match) {
            $offset = $match[0][1];
            while (isset($newlineAt[$cursor]) && $newlineAt[$cursor] < $offset) {
                $line++;
                $cursor++;
            }

            $entry = $this->htmlItem($line, $match[1][0]);

            if ($entry !== null) {
                $entries[] = $entry;
            }
        }

        return $entries;
    }

    private function htmlItem(int $line, string $inner): ?PrismEntry
    {
        $url = null;
        $name = null;
        $rest = $inner;

        if (preg_match('/<a\b[^>]*?\bhref\s*=\s*(["\'])(.*?)\1[^>]*>(.*?)<\/a\s*>/is', $inner, $anchor) === 1) {
            $url = $this->httpUrl($this->field($this->decodeEntities($anchor[2])));
            $name = $this->field($this->htmlText($anchor[3]));
            $rest = str_replace($anchor[0], ' ', $inner);
        }

        [$text, $version] = $this->splitVersion($this->htmlText($rest));

        $name ??= $this->field($text);
        $name ??= $url !== null ? $this->nameFromUrl($url) : null;

        if ($name === null) {
            return null;
        }

        return new PrismEntry($line, $name, $url, $version);
    }

    /**
     * Markdown export: `- [Name](url) [version]`, one mod per line.
     *
     * @return list<PrismEntry>|null
     */
    private function parseMarkdown(string $text): ?array
    {
        if (preg_match('/\[[^\[\]\n]*\]\([^)\s]+\)/', $text) !== 1) {
            return null;
        }

        $entries = [];
        foreach (explode("\n", $text) as $index => $raw) {
            if (preg_match('/\[([^\[\]]*)\]\(([^)\s]+)\)(.*)\z/', $raw, $match) !== 1) {
                continue;
            }

            $url = $this->httpUrl($match[2]);
            $name = $this->field($this->unescapeMarkdown($match[1])) ?? ($url !== null ? $this->nameFromUrl($url) : null);
            [, $version] = $this->splitVersion($match[3]);

            if ($name === null) {
                continue;
            }

            $entries[] = new PrismEntry($index + 1, $name, $url, $version);
        }

        return $entries;
    }

    /**
     * Plaintext export and plain URL lists. Each line is a URL, or a name with an optional
     * `[version]` and `(filename.jar)`. Blank and junk lines are skipped.
     *
     * @return list<PrismEntry>
     */
    private function parseLines(string $text): array
    {
        $entries = [];
        foreach (explode("\n", $text) as $index => $raw) {
            $line = $this->collapse($raw);

            if ($line === '' || $this->isJunk($line)) {
                continue;
            }

            $url = $this->httpUrl($line);

            if ($url !== null) {
                $entries[] = new PrismEntry($index + 1, $this->nameFromUrl($url), $url);

                continue;
            }

            [$name, $version] = $this->splitVersion($line);

            $filename = null;
            if (preg_match('/\(([^()]+\.(?:jar|zip|litemod))\)\s*\z/i', $name, $match) === 1) {
                $filename = $this->field($match[1]);
                $name = $this->collapse(str_replace($match[0], ' ', $name));
            }

            $name = $this->field($name) ?? $filename;

            if ($name === null) {
                continue;
            }

            $entries[] = new PrismEntry($index + 1, $name, null, $version, $filename);
        }

        return $entries;
    }

    /**
     * A line with no letters or digits, a heading, a tag, or a `Label:` line is not a mod.
     */
    private function isJunk(string $line): bool
    {
        return preg_match('/[\p{L}\p{N}]/u', $line) !== 1
            || str_starts_with($line, '#')
            || str_starts_with($line, '<')
            || str_ends_with($line, ':');
    }

    /**
     * Removes the first `[...]` from the text and returns the rest with the version it held.
     *
     * @return array{string, ?string}
     */
    private function splitVersion(string $text): array
    {
        if (preg_match('/\[([^\[\]]+)\]/', $text, $match) !== 1) {
            return [$this->collapse($text), null];
        }

        return [$this->collapse(str_replace($match[0], ' ', $text)), $this->field($match[1])];
    }

    /**
     * Keeps only http and https links. Anything else (javascript:, relative paths) is dropped.
     */
    private function httpUrl(?string $value): ?string
    {
        if ($value === null || preg_match('~^https?://[^\s<>"]+\z~i', $value) !== 1) {
            return null;
        }

        return $value;
    }

    /**
     * A name from a link when the export gives none. For Modrinth and CurseForge that is the
     * project slug; otherwise it is the last path segment.
     */
    private function nameFromUrl(string $url): string
    {
        $host = mb_strtolower((string) parse_url($url, PHP_URL_HOST));
        $path = (string) parse_url($url, PHP_URL_PATH);
        $segments = array_values(array_filter(explode('/', $path), fn (string $segment): bool => $segment !== ''));
        $count = count($segments);

        $name = match (true) {
            str_contains($host, 'curseforge') && $count >= 3 => $segments[2],
            str_contains($host, 'modrinth') && $count >= 2 && $segments[0] !== 'data' => $segments[1],
            default => $count === 0 ? '' : $segments[$count - 1],
        };

        $name = rawurldecode($name);

        return $name !== '' ? $name : $url;
    }

    private function htmlText(string $html): string
    {
        return $this->decodeEntities(strip_tags($html));
    }

    private function decodeEntities(string $text): string
    {
        return html_entity_decode($text, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    }

    private function unescapeMarkdown(string $text): string
    {
        return preg_replace('/\\\\([\\\\`*_{}\[\]()#+\-.!|<>~])/', '$1', $text) ?? $text;
    }

    /**
     * Trims a value and collapses runs of whitespace, including non-breaking spaces. Returns null
     * for anything that is not a non-empty string.
     */
    private function field(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $value = $this->collapse($value);

        return $value === '' ? null : $value;
    }

    private function collapse(string $value): string
    {
        return mb_trim(preg_replace('/[\s\x{00A0}]+/u', ' ', $value) ?? $value);
    }

    /**
     * Keeps the first occurrence of each url or lowercased name, and stops at the cap.
     *
     * @param  list<PrismEntry>  $entries
     * @return list<PrismEntry>
     */
    private function finalise(array $entries): array
    {
        $seenUrls = [];
        $seenNames = [];
        $result = [];

        foreach ($entries as $entry) {
            $url = $entry->url !== null ? mb_strtolower($entry->url) : null;
            $name = mb_strtolower($entry->name);

            if (($url !== null && isset($seenUrls[$url])) || isset($seenNames[$name])) {
                continue;
            }

            if ($url !== null) {
                $seenUrls[$url] = true;
            }

            $seenNames[$name] = true;
            $result[] = $entry;

            if (count($result) >= self::MAX_ENTRIES) {
                break;
            }
        }

        return $result;
    }
}
