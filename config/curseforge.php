<?php

declare(strict_types=1);

return [
    /*
     * CurseForge Core API key, from https://console.curseforge.com. Without it the CurseForge
     * source is hidden in the server Mods tab and only Modrinth is offered. Never sent to clients.
     */
    'api_key' => env('CURSEFORGE_API_KEY'),
];
