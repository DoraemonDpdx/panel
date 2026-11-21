<?php

declare(strict_types=1);

namespace Pterodactyl\Tests\Pest\Unit\Services\Servers\EnvFileBuilderTest;

use Pterodactyl\Services\Servers\Ports\EnvFileBuilder;
use Pterodactyl\Tests\TestCase;

uses(TestCase::class);

const VALUES = ['SERVER_IP' => '203.0.113.10', 'SERVER_PORT' => '25565', 'PORT' => '25565', 'QUERY_PORT' => '25566'];

test('renders dotenv, json and yaml', function (): void {
    $builder = new EnvFileBuilder;

    expect($builder->render(VALUES, 'dotenv'))->toBe("SERVER_IP=203.0.113.10\nSERVER_PORT=25565\nPORT=25565\nQUERY_PORT=25566\n")
        ->and(json_decode($builder->render(VALUES, 'json'), true))->toBe(VALUES)
        ->and($builder->render(['PORT' => '25565', 'NAME' => 'my app'], 'yaml'))->toBe("PORT: \"25565\"\nNAME: \"my app\"\n");
});

test('quotes dotenv values that need it', function (): void {
    $out = (new EnvFileBuilder)->render(['A' => 'two words', 'B' => 'say "hi"', 'C' => 'a#b', 'D' => '$HOME'], 'dotenv');

    expect($out)->toContain('A="two words"')->toContain('B="say \"hi\""')->toContain('C="a#b"')->toContain('D="\$HOME"');
});

test('appends a managed block and keeps every user line', function (): void {
    $existing = "# my app\nDB_HOST=localhost\n\nAPI_KEY=abc\n";
    $result = (new EnvFileBuilder)->merge($existing, VALUES, 'dotenv', 'managed', 'warn');

    expect($result->content)->toStartWith($existing)
        ->and($result->content)->toContain(EnvFileBuilder::BLOCK_START)->toContain(EnvFileBuilder::BLOCK_END)
        ->and($result->content)->toContain("QUERY_PORT=25566\n");
});

test('replaces only the block on regeneration and keeps user lines in place', function (): void {
    $builder = new EnvFileBuilder;
    $user = ["# top\nTOP=1\n", "\nBOTTOM=2\n"];
    $content = $user[0];
    $content = $builder->merge($content, VALUES, 'dotenv', 'managed', 'warn')->content.$user[1];

    for ($i = 0; $i < 10; $i++) {
        $values = [...VALUES, 'QUERY_PORT' => (string) (25566 + $i)];
        $content = $builder->merge($content, $values, 'dotenv', 'managed', 'warn')->content;
    }

    expect($content)->toStartWith("# top\nTOP=1\n")
        ->and($content)->toEndWith("\nBOTTOM=2\n")
        ->and(substr_count($content, EnvFileBuilder::BLOCK_START))->toBe(1)
        ->and($content)->toContain('QUERY_PORT=25575')->not->toContain('QUERY_PORT=25566');
});

test('is stable when nothing changes', function (): void {
    $builder = new EnvFileBuilder;
    $once = $builder->merge("A=1\n", VALUES, 'dotenv', 'managed', 'warn')->content;

    expect($builder->merge($once, VALUES, 'dotenv', 'managed', 'warn')->content)->toBe($once);
});

test('preserves windows line endings', function (): void {
    $out = (new EnvFileBuilder)->merge("A=1\r\nB=2\r\n", VALUES, 'dotenv', 'managed', 'warn')->content;

    expect($out)->toContain("B=2\r\n")->not->toMatch('/[^\r]\n/');
});

test('reports conflicts under the warn policy and leaves both lines', function (): void {
    $result = (new EnvFileBuilder)->merge("PORT=3000\n", VALUES, 'dotenv', 'managed', 'warn');

    expect($result->conflicts)->toBe(['PORT'])
        ->and($result->content)->toStartWith("PORT=3000\n")->toContain("PORT=25565\n");
});

test('panel wins disables the user line and gives it back when the policy changes', function (): void {
    $builder = new EnvFileBuilder;
    $panel = $builder->merge("PORT=3000\nKEEP=1\n", VALUES, 'dotenv', 'managed', 'panel')->content;

    expect($panel)->toContain(EnvFileBuilder::DISABLED_PREFIX.'PORT=3000')->toContain("KEEP=1\n");

    $mine = $builder->merge($panel, VALUES, 'dotenv', 'managed', 'user');
    expect($mine->content)->toStartWith("PORT=3000\nKEEP=1\n")->not->toMatch('/^PORT=25565/m');
});

test('my value wins keeps conflicting keys out of the block', function (): void {
    $result = (new EnvFileBuilder)->merge("QUERY_PORT=1\n", VALUES, 'dotenv', 'managed', 'user');

    expect($result->content)->toContain("PORT=25565\n")->not->toContain('QUERY_PORT=25566');
});

test('separate mode ignores the existing file', function (): void {
    $result = (new EnvFileBuilder)->merge("USER=1\n", VALUES, 'dotenv', 'separate', 'warn');

    expect($result->content)->toBe((new EnvFileBuilder)->render(VALUES, 'dotenv'))->and($result->conflicts)->toBe([]);
});

test('merges managed json by key', function (): void {
    $result = (new EnvFileBuilder)->merge('{"mine": "yes", "PORT": "3000"}', VALUES, 'json', 'managed', 'panel');
    $data = json_decode($result->content, true);

    expect($data['mine'])->toBe('yes')->and($data['PORT'])->toBe('25565')->and($result->conflicts)->toBe(['PORT']);

    $kept = json_decode((new EnvFileBuilder)->merge('{"PORT": "3000"}', VALUES, 'json', 'managed', 'user')->content, true);
    expect($kept['PORT'])->toBe('3000');
});

test('merges managed yaml using the block markers', function (): void {
    $result = (new EnvFileBuilder)->merge("name: app\n", ['PORT' => '8080'], 'yaml', 'managed', 'warn');

    expect($result->content)->toStartWith("name: app\n")->toContain('PORT: "8080"');
});
