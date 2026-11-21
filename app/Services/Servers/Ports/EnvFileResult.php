<?php

declare(strict_types=1);

namespace Pterodactyl\Services\Servers\Ports;

/** A merged file body and the keys the user's own file already defined. */
final readonly class EnvFileResult
{
    /** @param list<string> $conflicts */
    public function __construct(public string $content, public array $conflicts) {}
}
