<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Requests\Api\Client\Servers\Ports;

/**
 * Reassigning rebuilds every automatic port on the node, so only a root admin may do it, whatever the server's
 * own permissions say. A server owner or subuser holding settings.ports still gets a 403.
 */
class ReassignPortsRequest extends RegeneratePortsRequest
{
    public function authorize(): bool
    {
        return $this->user()->root_admin && parent::authorize();
    }
}
