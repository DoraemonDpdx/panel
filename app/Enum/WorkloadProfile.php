<?php

declare(strict_types=1);

namespace Pterodactyl\Enum;

/**
 * What kind of workload an egg runs. The client UI uses it to decide which tabs and
 * widgets a server shows, so a Discord bot does not get a player roster and a database
 * does not get a console-first layout. `generic` shows everything.
 */
enum WorkloadProfile: string
{
    case Game = 'game';
    case Bot = 'bot';
    case Web = 'web';
    case Database = 'database';
    case Lavalink = 'lavalink';
    case Generic = 'generic';

    /**
     * Slugs of the built-in tags that are unambiguously game servers.
     *
     * @return list<string>
     */
    public static function gameTagSlugs(): array
    {
        return [
            EggSpecificTags::Srcds->value,
            EggSpecificTags::Bedrock->value,
            EggSpecificTags::Minecraft->value,
            EggSpecificTags::Rust->value,
            EggSpecificTags::GarrysMod->value,
            EggSpecificTags::Fivem->value,
        ];
    }

    /**
     * @return list<string>
     */
    public static function values(): array
    {
        return array_map(fn (self $case): string => $case->value, self::cases());
    }
}
