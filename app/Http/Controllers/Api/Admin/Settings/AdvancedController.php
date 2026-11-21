<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Controllers\Api\Admin\Settings;

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Crypt;
use Knuckles\Scribe\Attributes\Endpoint;
use Knuckles\Scribe\Attributes\Group;
use Knuckles\Scribe\Attributes\Response as ScribeResponse;
use Knuckles\Scribe\Attributes\Subgroup;
use Pterodactyl\Http\Controllers\Api\Admin\AdminApiController;
use Pterodactyl\Http\Requests\Api\Admin\Settings\UpdateAdvancedSettingsRequest;
use Pterodactyl\Models\Setting;
use Pterodactyl\Providers\SettingsServiceProvider;

#[Group('Admin API', 'Root administrator endpoints for managing panel configuration and resources.')]
#[Subgroup('Settings', 'View and update global panel settings.')]
class AdvancedController extends AdminApiController
{
    /**
     * Update advanced settings.
     */
    #[Endpoint('Update advanced settings', 'Updates reCAPTCHA, the CurseForge API key, HTTP client timeout, and client allocation feature settings.')]
    #[ScribeResponse(status: 204, description: 'Advanced settings updated.')]
    public function __invoke(UpdateAdvancedSettingsRequest $request, Kernel $kernel): Response
    {
        foreach ($request->normalize() as $key => $value) {
            if ($value === null || $value === '') {
                $stored = $value === null ? null : '';
            } elseif (in_array($key, SettingsServiceProvider::getEncryptedKeys(), true)) {
                $stored = Crypt::encrypt((string) $value);
            } else {
                $stored = (string) $value;
            }

            Setting::put('settings::'.$key, $stored);
        }

        $kernel->call('queue:restart');

        return $this->returnNoContent();
    }
}
