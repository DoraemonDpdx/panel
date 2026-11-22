<?php

declare(strict_types=1);

namespace Pterodactyl\Services\Servers\Software;

/** Picks the Java version a Minecraft version needs, and the egg docker image that provides it. */
final class JavaImageSelector
{
    /**
     * 1.16.5 and older run on Java 8, 1.17 needs 16, 1.18 to 1.20.4 need 17, 1.20.5 to 1.21.x need 21,
     * and the 26.x line and newer need 25. Unrecognised versions get 21.
     */
    public static function javaMajor(string $minecraft): int
    {
        // Weekly snapshots: 20w45a (first 1.17 snapshot), 21w37a (1.18), 24w14a (1.20.5), 26w and newer.
        if (preg_match('/^(\d{2})w(\d{2})[a-z]$/', $minecraft, $m) === 1) {
            $stamp = ((int) $m[1]) * 100 + (int) $m[2];

            return match (true) {
                $stamp < 2045 => 8,
                $stamp < 2137 => 16,
                $stamp < 2414 => 17,
                $stamp < 2600 => 21,
                default => 25,
            };
        }

        if (preg_match('/^(\d+)\.(\d+)(?:\.(\d+))?/', $minecraft, $m) !== 1) {
            return 21;
        }

        $major = (int) $m[1];
        $minor = (int) $m[2];
        $patch = (int) ($m[3] ?? 0);

        if ($major >= 26) {
            return 25;
        }

        if ($major !== 1) {
            return 21;
        }

        return match (true) {
            $minor <= 16 => 8,
            $minor === 17 => 16,
            $minor <= 19 => 17,
            $minor === 20 => $patch >= 5 ? 21 : 17,
            default => 21,
        };
    }

    /**
     * The egg's docker image for a Java major, matching the yolks `java_<n>` tag. Null when the egg has none.
     *
     * @param  array<string, string>  $dockerImages  label => image
     */
    public static function imageFor(array $dockerImages, int $major): ?string
    {
        foreach ($dockerImages as $image) {
            if (preg_match('/[:_]java_?'.$major.'$/', $image) === 1) {
                return $image;
            }
        }

        return null;
    }
}
