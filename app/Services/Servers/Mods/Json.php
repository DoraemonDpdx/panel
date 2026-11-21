<?php

declare(strict_types=1);

namespace Pterodactyl\Services\Servers\Mods;

/**
 * Narrows decoded JSON (provider responses, plan files) to the shapes the content code reads.
 */
final class Json
{
    /**
     * @return array<string, mixed>
     */
    public static function object(mixed $value): array
    {
        return is_array($value) ? array_filter($value, is_string(...), ARRAY_FILTER_USE_KEY) : [];
    }

    /**
     * The entries of a list that are objects.
     *
     * @return list<array<string, mixed>>
     */
    public static function rows(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }

        $rows = [];
        foreach ($value as $row) {
            if (is_array($row)) {
                $rows[] = self::object($row);
            }
        }

        return $rows;
    }

    /**
     * @return list<string>
     */
    public static function strings(mixed $value): array
    {
        return is_array($value) ? array_values(array_filter($value, is_string(...))) : [];
    }

    public static function string(mixed $value): ?string
    {
        return is_string($value) ? $value : null;
    }

    /** An ID that may arrive as an integer or a string, as text. */
    public static function id(mixed $value): string
    {
        return is_int($value) || is_string($value) ? (string) $value : '';
    }
}
