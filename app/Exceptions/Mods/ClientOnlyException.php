<?php

declare(strict_types=1);

namespace Pterodactyl\Exceptions\Mods;

use Illuminate\Http\JsonResponse;
use Pterodactyl\Exceptions\DisplayException;

/** The project only runs on the client (a shader, a minimap, a rendering mod), so it does nothing on a server. */
class ClientOnlyException extends DisplayException
{
    public function __construct(public readonly ?string $title = null)
    {
        parent::__construct(($title !== null ? "$title is" : 'This content is').' client-only and cannot be installed on a server.');
    }

    public function render(): JsonResponse
    {
        return new JsonResponse(['error' => 'client_only', 'title' => $this->title], 422);
    }
}
