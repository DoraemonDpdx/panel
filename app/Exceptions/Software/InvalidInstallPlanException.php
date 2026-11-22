<?php

declare(strict_types=1);

namespace Pterodactyl\Exceptions\Software;

use InvalidArgumentException;

/** Thrown when an install plan breaks a rule: a host outside the allowlist, a path that escapes the server, a missing hash. */
final class InvalidInstallPlanException extends InvalidArgumentException {}
