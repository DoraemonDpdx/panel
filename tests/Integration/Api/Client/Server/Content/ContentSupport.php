<?php

declare(strict_types=1);

namespace Pterodactyl\Tests\Integration\Api\Client\Server\Content;

use Closure;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Pterodactyl\Models\Egg;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\ServerVariable;
use Pterodactyl\Models\User;
use Pterodactyl\Services\Servers\Software\SoftwareSwitcher;
use ZipArchive;

/** Shared fixtures for the content tests: Astrelyse servers, in-memory zips and CDN fakes. */
final class ContentSupport
{
    /**
     * @param  list<string>  $permissions
     * @param  array<string, string>  $variables
     * @return array{User, Server}
     */
    public static function server(object $test, array $permissions, array $variables = ['SERVER_TYPE' => 'fabric', 'MC_VERSION' => '1.21.1']): array
    {
        [$user, $server] = $test->generateTestAccount($permissions);
        $egg = Egg::query()->where('author', SoftwareSwitcher::EGG_AUTHOR)->where('name', SoftwareSwitcher::EGG_NAME)->firstOrFail();
        $server->forceFill(['egg_id' => $egg->id, 'startup' => $egg->startup, 'image' => 'ghcr.io/pterodactyl/yolks:java_21'])->save();
        $server->unsetRelation('egg');
        $server->load('egg');
        foreach ($variables as $env => $value) {
            $variable = $server->egg->variables()->where('env_variable', $env)->firstOrFail();
            ServerVariable::query()->updateOrCreate(['server_id' => $server->id, 'variable_id' => $variable->id], ['variable_value' => $value]);
        }

        return [$user, $server->refresh()];
    }

    public static function variable(Server $server, string $env): ?string
    {
        $variable = $server->egg->variables()->where('env_variable', $env)->firstOrFail();

        return ServerVariable::query()->where('server_id', $server->id)->where('variable_id', $variable->id)->value('variable_value');
    }

    /** @param array<string, string> $entries name => content */
    public static function zip(array $entries): string
    {
        $path = tempnam(sys_get_temp_dir(), 'test-zip-');
        $zip = new ZipArchive;
        $zip->open($path, ZipArchive::CREATE | ZipArchive::OVERWRITE);
        foreach ($entries as $name => $content) {
            $zip->addFromString($name, $content);
        }
        $zip->close();
        $bytes = (string) file_get_contents($path);
        unlink($path);

        return $bytes;
    }

    /** Serves a zip, answering range requests the way a CDN does. */
    public static function cdn(string $bytes): Closure
    {
        return function (Request $request) use ($bytes) {
            $range = $request->header('Range')[0] ?? null;
            $total = mb_strlen($bytes, '8bit');
            if ($range === null) {
                return Http::response($bytes, 200, ['Content-Length' => (string) $total]);
            }

            preg_match('/bytes=(-?\d*)-?(\d*)/', $range, $m);
            if (str_starts_with($m[1], '-')) {
                $start = max(0, $total - (int) mb_substr($m[1], 1));
                $end = $total - 1;
            } else {
                $start = (int) $m[1];
                $end = min($total - 1, (int) $m[2]);
            }

            return Http::response(mb_substr($bytes, $start, $end - $start + 1, '8bit'), 206, ['Content-Range' => "bytes $start-$end/$total"]);
        };
    }

    /** @return array<string, mixed> the plan the panel last wrote through Wings */
    public static function plan(ContentFiles $files): array
    {
        $writes = array_values(array_filter($files->callsFor('putContent'), fn (array $call): bool => $call['path'] === '/.astrelyse/plan.json'));
        expect($writes)->not->toBeEmpty();

        return json_decode($writes[array_key_last($writes)]['content'], true, flags: JSON_THROW_ON_ERROR);
    }

    public static function sha1(string $seed): string
    {
        return sha1($seed);
    }

    public static function sha512(string $seed): string
    {
        return hash('sha512', $seed);
    }
}
