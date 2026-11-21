<?php

declare(strict_types=1);

namespace Pterodactyl\Services\Servers\Mods\Import;

/**
 * One mod read from a Prism Launcher "Export mod list" file, or from a plain list of links.
 *
 * `line` is where the entry appeared in the text, counted from 1. JSON has no lines, so there it is
 * the entry's 1-based position in the array. `url` is set only for http or https links. `version`
 * and `filename` are set when the export includes them.
 */
final readonly class PrismEntry
{
    public function __construct(
        public int $line,
        public string $name,
        public ?string $url = null,
        public ?string $version = null,
        public ?string $filename = null,
    ) {}
}
