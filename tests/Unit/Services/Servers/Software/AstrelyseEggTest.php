<?php

declare(strict_types=1);

namespace Pterodactyl\Tests\Pest\Unit\Services\Servers\Software\AstrelyseEggTest;

use Pterodactyl\Data\EggImportData;
use Pterodactyl\Services\Servers\Software\InstallPlan;
use Pterodactyl\Tests\TestCase;
use Symfony\Component\Process\ExecutableFinder;
use Symfony\Component\Process\Process;

uses(TestCase::class);

const DIRECTORY = __DIR__.'/../../../../../database/Seeders/eggs/minecraft';

/** @return array<string, mixed> */
function egg(): array
{
    return json_decode((string) file_get_contents(DIRECTORY.'/egg-astrelyse-minecraft-java.json'), true, flags: JSON_THROW_ON_ERROR);
}

test('the egg json is valid and imports', function (): void {
    $data = EggImportData::fromJson((string) file_get_contents(DIRECTORY.'/egg-astrelyse-minecraft-java.json'));

    expect($data->name)->toBe('Minecraft Java (Astrelyse)')
        ->and(array_column(egg()['variables'], 'env_variable'))->toBe(['SERVER_TYPE', 'MC_VERSION', 'LOADER_VERSION', 'SERVER_JARFILE', 'ASTRELYSE_PLAN_SHA256']);
});

test('the egg embeds the install script file byte for byte', function (): void {
    expect(egg()['scripts']['installation']['script'])->toBe((string) file_get_contents(DIRECTORY.'/astrelyse-install.sh'));
});

test('the egg uses the install container and the java images the plan needs', function (): void {
    $egg = egg();

    expect($egg['scripts']['installation']['container'])->toBe('eclipse-temurin:21-jdk-jammy')
        ->and($egg['workload_profile'])->toBe('game')
        ->and(array_values($egg['docker_images']))->toContain('ghcr.io/pterodactyl/yolks:java_8', 'ghcr.io/pterodactyl/yolks:java_16', 'ghcr.io/pterodactyl/yolks:java_17', 'ghcr.io/pterodactyl/yolks:java_21', 'ghcr.io/pterodactyl/yolks:java_25');
});

test('the plan hash variable is hidden and locked', function (): void {
    $variable = collect(egg()['variables'])->firstWhere('env_variable', 'ASTRELYSE_PLAN_SHA256');

    expect($variable['user_viewable'])->toBeFalse()->and($variable['user_editable'])->toBeFalse();
});

test('the install script allows exactly the hosts the panel allows', function (): void {
    $script = (string) file_get_contents(DIRECTORY.'/astrelyse-install.sh');
    preg_match('/ALLOWED_HOSTS=\((.*?)\n\)/s', $script, $match);
    $hosts = preg_split('/\s+/', mb_trim($match[1]));

    expect($hosts)->toBe(InstallPlan::ALLOWED_HOSTS);
});

test('the install script has the safety rails', function (): void {
    $script = (string) file_get_contents(DIRECTORY.'/astrelyse-install.sh');

    expect($script)->toStartWith("#!/bin/bash\n")
        ->and($script)->toContain('set -euo pipefail')
        ->and($script)->toContain('sha256sum "$PLAN"')
        ->and($script)->toContain('does not match its hash')
        ->and($script)->toContain('url_allowed')
        ->and($script)->toContain('Refusing to follow a symlink')
        ->and($script)->toContain('step "Downloading $N_FILES file(s)..."')
        ->and($script)->toContain('echo "[astrelyse] $*"')
        ->and($script)->toContain('log "$STEP/$TOTAL $*"');
});

test('the install script parses', function (): void {
    $bash = (new ExecutableFinder)->find('bash');
    expect($bash)->not->toBeNull();

    $process = new Process([$bash, '-n', DIRECTORY.'/astrelyse-install.sh']);
    $process->run();

    expect($process->getErrorOutput())->toBe('')->and($process->getExitCode())->toBe(0);
});

test('shellcheck is clean when it is installed', function (): void {
    $shellcheck = (new ExecutableFinder)->find('shellcheck');
    if ($shellcheck === null) {
        $this->markTestSkipped('shellcheck is not installed.');
    }

    $process = new Process([$shellcheck, '--shell=bash', '--severity=warning', DIRECTORY.'/astrelyse-install.sh']);
    $process->run();

    expect($process->getOutput())->toBe('')->and($process->getExitCode())->toBe(0);
});
