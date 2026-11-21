<?php

declare(strict_types=1);

namespace Pterodactyl\Tests\Pest\Unit\Services\Servers\Software\JavaImageSelectorTest;

use Pterodactyl\Services\Servers\Software\JavaImageSelector;

test('the java major follows the minecraft version', function (string $minecraft, int $java): void {
    expect(JavaImageSelector::javaMajor($minecraft))->toBe($java);
})->with([
    ['1.7.10', 8], ['1.12.2', 8], ['1.16.5', 8],
    ['1.17', 16], ['1.17.1', 16],
    ['1.18', 17], ['1.18.2', 17], ['1.19.4', 17], ['1.20', 17], ['1.20.1', 17], ['1.20.4', 17],
    ['1.20.5', 21], ['1.20.6', 21], ['1.21', 21], ['1.21.1', 21], ['1.21.11', 21],
    ['26.1', 25], ['26.1.2', 25], ['27.1', 25], ['26.4-snapshot-10', 25],
    ['1.21.2-pre1', 21], ['1.20.4-rc1', 17],
    ['20w45a', 16], ['20w20b', 8], ['21w37a', 17], ['23w51b', 17], ['24w14a', 21], ['25w10a', 21], ['26w01a', 25],
    ['garbage', 21],
]);

test('the image comes from the egg and is null when the egg lacks it', function (): void {
    $images = ['Java 21' => 'ghcr.io/pterodactyl/yolks:java_21', 'Java 8' => 'ghcr.io/pterodactyl/yolks:java_8', 'Java 25' => 'ghcr.io/pterodactyl/yolks:java_25'];

    expect(JavaImageSelector::imageFor($images, 21))->toBe('ghcr.io/pterodactyl/yolks:java_21')
        ->and(JavaImageSelector::imageFor($images, 8))->toBe('ghcr.io/pterodactyl/yolks:java_8')
        ->and(JavaImageSelector::imageFor($images, 2))->toBeNull()
        ->and(JavaImageSelector::imageFor($images, 17))->toBeNull();
});
