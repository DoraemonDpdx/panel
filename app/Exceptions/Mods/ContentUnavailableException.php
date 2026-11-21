<?php

declare(strict_types=1);

namespace Pterodactyl\Exceptions\Mods;

use Illuminate\Http\JsonResponse;
use Pterodactyl\Exceptions\DisplayException;

/** A content request that cannot be served, rendered as a 422 with a machine readable error code. */
class ContentUnavailableException extends DisplayException
{
    /**
     * @param  array<string, mixed>  $extra
     */
    public function __construct(public readonly string $error, string $message, public readonly array $extra = [])
    {
        parent::__construct($message);
    }

    public function render(): JsonResponse
    {
        return new JsonResponse(['error' => $this->error, 'message' => $this->getMessage(), ...$this->extra], 422);
    }
}
