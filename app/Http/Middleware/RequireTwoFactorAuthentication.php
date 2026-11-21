<?php

declare(strict_types=1);

namespace Pterodactyl\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Pterodactyl\Exceptions\Http\TwoFactorAuthRequiredException;
use Pterodactyl\Http\Concerns\ResolvesRequestContext;
use Symfony\Component\HttpFoundation\Response;

class RequireTwoFactorAuthentication
{
    use ResolvesRequestContext;

    public const int LEVEL_NONE = 0;

    public const int LEVEL_ADMIN = 1;

    public const int LEVEL_ALL = 2;

    /**
     * The route to redirect a user to enable 2FA.
     */
    protected string $redirectRoute = '/account/two-factor?required=1';

    /**
     * Check the user state on the incoming request to determine if they should be allowed to
     * proceed or not. This checks if the Panel is configured to require 2FA on an account in
     * order to perform actions. If so, we check the level at which it is required (all users
     * or just admins) and then check if the user has enabled it for their account.
     *
     * @throws TwoFactorAuthRequiredException
     */
    /**
     * @param  Closure(Request):Response  $next
     * @return Response
     */
    public function handle(Request $request, Closure $next): mixed
    {
        $user = $request->user();
        $uri = mb_rtrim($request->getRequestUri(), '/').'/';
        $current = $this->resolvedRoute($request)->getName() ?? '';

        if (! $user || $request->is('account/two-factor') || Str::startsWith($uri, ['/auth/']) || Str::startsWith($current, ['auth.', 'account.'])) {
            return $next($request);
        }

        $level = config('pterodactyl.auth.2fa_required');

        // Two-factor is compulsory for staff (owners, root administrators and role holders)
        // whatever the panel-wide setting says; it can only ever raise the requirement.
        if ($user->mustUseTwoFactor()) {
            $level = max($level, self::LEVEL_ADMIN);
        }

        // If nothing is required, or the user is already using 2FA, send them straight through.
        //
        // If the level is set as admin and the user is not an admin, pass them through as well.
        if ($level === self::LEVEL_NONE || $user->use_totp) {
            return $next($request);
        }

        if ($level === self::LEVEL_ADMIN && ! $user->mustUseTwoFactor()) {
            return $next($request);
        }

        // For API calls return an exception which gets rendered nicely in the API response.
        throw_if($request->isJson() || Str::startsWith($uri, '/api/'), TwoFactorAuthRequiredException::class);

        return redirect()->to($this->redirectRoute);
    }
}
