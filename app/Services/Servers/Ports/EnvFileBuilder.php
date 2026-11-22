<?php

declare(strict_types=1);

namespace Pterodactyl\Services\Servers\Ports;

use JsonException;
use Pterodactyl\Models\ServerEnvSetting;

/**
 * Renders the generated environment file and merges it into whatever already exists.
 *
 * Managed-block mode keeps every line outside the markers byte-for-byte. For dotenv and YAML the
 * block sits between comment markers. JSON has no comments, so a managed JSON file is a
 * key-level merge: the panel's keys are set and every other key keeps its place.
 */
final class EnvFileBuilder
{
    public const string BLOCK_START = '# >>> astrelyse ports';

    public const string BLOCK_END = '# <<< astrelyse ports';

    private const string BLOCK_NOTE = ' (managed, edit in Server → Settings → Ports and environment)';

    /** Prefix that marks a user line the panel switched off under the "panel wins" policy. */
    public const string DISABLED_PREFIX = '# [astrelyse disabled] ';

    /**
     * Renders only the panel's values in the given format.
     *
     * @param  array<string, string>  $values
     */
    public function render(array $values, string $format): string
    {
        return match ($format) {
            'json' => json_encode($values, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR)."\n",
            'yaml' => $this->lines($values, 'yaml').($values === [] ? '' : "\n"),
            default => $this->lines($values, 'dotenv').($values === [] ? '' : "\n"),
        };
    }

    /**
     * Merges the panel's values into an existing file for the given mode.
     *
     * @param  array<string, string>  $values
     */
    public function merge(string $existing, array $values, string $format, string $mode, string $policy): EnvFileResult
    {
        if ($mode === 'separate') {
            return new EnvFileResult($this->render($values, $format), []);
        }

        return $format === 'json'
            ? $this->mergeJson($existing, $values, $policy)
            : $this->mergeBlock($existing, $values, $format, $policy);
    }

    /**
     * @param  array<string, string>  $values
     */
    private function mergeBlock(string $existing, array $values, string $format, string $policy): EnvFileResult
    {
        $eol = str_contains($existing, "\r\n") ? "\r\n" : "\n";
        $lines = $existing === '' ? [] : preg_split('/\r\n|\n/', $existing);
        // A trailing newline yields a final empty element; it is restored when the file is joined.
        if ($lines !== [] && end($lines) === '') {
            array_pop($lines);
        }

        $start = $end = null;
        foreach ($lines as $index => $line) {
            if ($start === null && str_starts_with(mb_rtrim($line), self::BLOCK_START)) {
                $start = $index;
            } elseif ($start !== null && mb_rtrim($line) === self::BLOCK_END) {
                $end = $index;
                break;
            }
        }

        $before = $start === null ? $lines : array_slice($lines, 0, $start);
        $after = $start === null || $end === null ? [] : array_slice($lines, $end + 1);
        // A start marker with no end marker swallows nothing: the block is rebuilt after the file.
        if ($start !== null && $end === null) {
            $before = $lines;
            $start = null;
        }

        [$before, $after, $conflicts, $panelKeys] = $this->resolveConflicts($before, $after, $values, $format, $policy);

        $block = [self::BLOCK_START.self::BLOCK_NOTE, ...$this->blockLines($values, $panelKeys, $format), self::BLOCK_END];

        $out = [...$before];
        // Keep a blank separator when the block is first appended below existing content.
        if ($start === null && $out !== [] && trim((string) end($out)) !== '') {
            $out[] = '';
        }

        $out = [...$out, ...$block, ...$after];

        return new EnvFileResult(implode($eol, $out).$eol, $conflicts);
    }

    /**
     * @param  list<string>  $before
     * @param  list<string>  $after
     * @param  array<string, string>  $values
     * @return array{list<string>, list<string>, list<string>, list<string>}
     */
    private function resolveConflicts(array $before, array $after, array $values, string $format, string $policy): array
    {
        $conflicts = [];
        $panelKeys = array_keys($values);

        $handle = function (array $lines) use ($values, $format, $policy, &$conflicts, &$panelKeys): array {
            foreach ($lines as $index => $line) {
                // Lines the panel disabled earlier come back when the policy no longer asks for it.
                if (str_starts_with($line, self::DISABLED_PREFIX)) {
                    $original = mb_substr($line, mb_strlen(self::DISABLED_PREFIX));
                    $key = $this->keyOf($original, $format);
                    if ($key !== null && isset($values[$key]) && $policy === 'panel') {
                        $conflicts[] = $key;

                        continue;
                    }

                    $lines[$index] = $original;
                    $line = $original;
                }

                $key = $this->keyOf($line, $format);
                if ($key === null || ! array_key_exists($key, $values)) {
                    continue;
                }

                $conflicts[] = $key;
                if ($policy === 'panel') {
                    $lines[$index] = self::DISABLED_PREFIX.$line;
                } elseif ($policy === 'user') {
                    $panelKeys = array_values(array_diff($panelKeys, [$key]));
                }
            }

            return $lines;
        };

        $before = $handle($before);
        $after = $handle($after);

        return [$before, $after, array_values(array_unique($conflicts)), $panelKeys];
    }

    /**
     * @param  array<string, string>  $values
     * @param  list<string>  $keys
     * @return list<string>
     */
    private function blockLines(array $values, array $keys, string $format): array
    {
        $out = [];
        foreach ($keys as $key) {
            $out[] = $this->line($key, $values[$key], $format);
        }

        return $out;
    }

    /**
     * @param  array<string, string>  $values
     */
    private function mergeJson(string $existing, array $values, string $policy): EnvFileResult
    {
        $data = [];
        if (mb_trim($existing) !== '') {
            try {
                $decoded = json_decode($existing, true, 512, JSON_THROW_ON_ERROR);
            } catch (JsonException) {
                $decoded = null;
            }

            // A file that is not a JSON object is left to the user; the panel starts a fresh object
            // rather than destroying content it cannot read, so callers see the conflict.
            if (! is_array($decoded) || array_is_list($decoded) && $decoded !== []) {
                return new EnvFileResult($existing, ['(file is not a JSON object)']);
            }

            $data = $decoded;
        }

        $conflicts = [];
        foreach ($values as $key => $value) {
            if (array_key_exists($key, $data) && (string) $data[$key] !== $value) {
                $conflicts[] = $key;
                if ($policy === 'user') {
                    continue;
                }
            }

            // "warn" leaves the user's value alone as well and reports it.
            if (array_key_exists($key, $data) && $policy === 'warn' && (string) $data[$key] !== $value) {
                continue;
            }

            $data[$key] = $value;
        }

        return new EnvFileResult(json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR)."\n", $conflicts);
    }

    /**
     * @param  array<string, string>  $values
     */
    private function lines(array $values, string $format): string
    {
        $out = [];
        foreach ($values as $key => $value) {
            $out[] = $this->line($key, $value, $format);
        }

        return implode("\n", $out);
    }

    private function line(string $key, string $value, string $format): string
    {
        return $format === 'yaml'
            ? $key.': '.$this->yamlScalar($value)
            : $key.'='.$this->dotenvScalar($value);
    }

    private function dotenvScalar(string $value): string
    {
        if ($value === '' || preg_match('/^[A-Za-z0-9_.:\/@%+,-]+$/', $value) === 1) {
            return $value;
        }

        return '"'.strtr($value, ['\\' => '\\\\', '"' => '\\"', "\n" => '\\n', "\r" => '\\r', '$' => '\\$']).'"';
    }

    private function yamlScalar(string $value): string
    {
        // Numbers stay strings so every consumer sees the same type as the process environment.
        if ($value !== '' && preg_match('/^[A-Za-z][A-Za-z0-9_.\/-]*$/', $value) === 1 && ! in_array(mb_strtolower($value), ['true', 'false', 'null', 'yes', 'no', 'on', 'off', 'y', 'n'], true)) {
            return $value;
        }

        return '"'.strtr($value, ['\\' => '\\\\', '"' => '\\"', "\n" => '\\n', "\r" => '\\r']).'"';
    }

    private function keyOf(string $line, string $format): ?string
    {
        $pattern = $format === 'yaml'
            ? '/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/'
            : '/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/';

        return preg_match($pattern, $line, $matches) === 1 ? $matches[1] : null;
    }
}
