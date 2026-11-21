<?php

declare(strict_types=1);

namespace Pterodactyl\Services\Servers\Software;

use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Pterodactyl\Contracts\Servers\ChangesServerEgg;
use Pterodactyl\Contracts\Servers\UpdatesServerDockerImage;
use Pterodactyl\Exceptions\DisplayException;
use Pterodactyl\Facades\Activity;
use Pterodactyl\Models\Egg;
use Pterodactyl\Models\InstallOperation;
use Pterodactyl\Models\Server;
use Pterodactyl\Models\ServerVariable;
use Pterodactyl\Models\User;
use Pterodactyl\Services\Servers\Mods\MinecraftPlatformDetector;

/**
 * Switches a server's software: validates the choice against the catalog, builds the install plan, updates the
 * egg variables and Java image, and runs the plan. Also repairs the current software and moves a server onto
 * the Astrelyse egg.
 */
final readonly class SoftwareSwitcher
{
    public const string EGG_AUTHOR = 'support@astrelyse.com';

    public const string EGG_NAME = 'Minecraft Java (Astrelyse)';

    /** What each software type's mod or plugin folder accepts, see MINECRAFT_CONTENT_PLAN section 0. */
    private const array ACCEPTS = [
        'vanilla' => [],
        'paper' => ['paper', 'spigot', 'bukkit'],
        'purpur' => ['purpur', 'paper', 'spigot', 'bukkit'],
        'folia' => ['folia'],
        'fabric' => ['fabric'],
        'quilt' => ['quilt', 'fabric'],
        'forge' => ['forge'],
        'neoforge' => ['neoforge'],
    ];

    public function __construct(
        private SoftwareCatalog $catalog,
        private InstallPlanRunner $runner,
        private ServerFileWiper $wiper,
        private MinecraftPlatformDetector $detector,
        private UpdatesServerDockerImage $images,
        private ChangesServerEgg $eggs,
    ) {}

    /**
     * @return array{type: string|null, minecraft: string|null, loader: string|null, egg_managed: bool}
     */
    public function current(Server $server): array
    {
        $managed = $this->runner->supports($server);
        $values = $this->variableValues($server);
        $platform = $this->detector->detect($server);

        $type = mb_strtolower($values['SERVER_TYPE'] ?? '');
        if (! isset(SoftwareCatalog::TYPES[$type])) {
            $type = isset(SoftwareCatalog::TYPES[$platform->platform ?? '']) ? $platform->platform : null;
        }

        $loader = $values['LOADER_VERSION'] ?? '';

        return [
            'type' => $type,
            'minecraft' => $platform->game_version ?? ($values['MC_VERSION'] ?? null),
            'loader' => $managed && $loader !== '' ? $loader : null,
            'egg_managed' => $managed,
        ];
    }

    /**
     * @param  array{type: string, minecraft: string, loader?: string|null, wipe?: array{enabled?: bool, keep_worlds?: bool}, mods_action?: string|null}  $input
     *
     * @throws ValidationException
     * @throws DisplayException
     */
    public function install(Server $server, User $by, array $input): InstallOperation
    {
        $type = $input['type'];
        $minecraft = $input['minecraft'];
        $loader = ($input['loader'] ?? null) ?: null;

        $this->assertManaged($server);
        $this->assertChoice($type, $minecraft, $loader);

        $loader ??= in_array($type, ['fabric', 'quilt', 'forge', 'neoforge'], true) ? $this->catalog->recommendedLoader($type, $minecraft) : null;

        $wipe = (bool) ($input['wipe']['enabled'] ?? false);
        $keepWorlds = (bool) ($input['wipe']['keep_worlds'] ?? true);

        $platform = $this->detector->detect($server);
        $folder = $platform->install_dir;
        $incompatible = $folder !== null && ! in_array($platform->platform, self::ACCEPTS[$type], true);
        $modsAction = $input['mods_action'] ?? ($incompatible ? 'disable' : 'keep');

        $moves = [];
        $remove = [];
        $keep = $wipe ? $this->wiper->keepList($server, $keepWorlds, true) : InstallPlan::DEFAULT_KEEP;

        if ($incompatible) {
            if ($modsAction === 'disable') {
                $to = $folder.'.disabled-'.now()->format('Ymd-Hi');
                $moves[] = ['from' => $folder, 'to' => $to];
                $keep[] = $to;
            } elseif ($modsAction === 'remove') {
                $remove[] = $folder;
            } else {
                $keep[] = $folder;
            }
        } elseif ($folder !== null) {
            $keep[] = $folder;
        }

        $plan = InstallPlan::forSoftware(
            ['type' => $type, 'minecraft' => $minecraft, 'loader' => $loader],
            $wipe,
            array_values(array_unique($keep)),
            $moves,
            $remove,
        );

        return DB::transaction(function () use ($server, $by, $plan, $type, $minecraft, $loader, $wipe, $keepWorlds, $modsAction, $incompatible, $folder): InstallOperation {
            $this->applySoftware($server, $type, $minecraft, $loader);

            if ($incompatible) {
                $rows = $server->modInstalls()->where('install_dir', $folder);
                match ($modsAction) {
                    'disable' => $rows->update(['enabled' => false]),
                    'remove' => $rows->delete(),
                    default => null,
                };
            }

            return $this->runner->run($server, $plan, 'install', [
                'type' => $type,
                'label' => SoftwareCatalog::TYPES[$type]['label'],
                'minecraft' => $minecraft,
                'loader' => $loader,
                'wipe' => $wipe,
                'keep_worlds' => $wipe ? $keepWorlds : true,
                'mods_action' => $incompatible ? $modsAction : 'keep',
            ], $by);
        });
    }

    /** Reinstalls the software the server already has, keeping its files. */
    public function reinstall(Server $server, User $by): InstallOperation
    {
        $this->assertManaged($server);
        $current = $this->current($server);

        throw_if($current['type'] === null || $current['minecraft'] === null, DisplayException::class, 'This server has no software settings to reinstall.');

        $plan = InstallPlan::forSoftware(
            ['type' => $current['type'], 'minecraft' => $current['minecraft'], 'loader' => $current['loader']],
            false,
        );

        return $this->runner->run($server, $plan, 'reinstall', [
            'type' => $current['type'],
            'label' => SoftwareCatalog::TYPES[$current['type']]['label'],
            'minecraft' => $current['minecraft'],
            'loader' => $current['loader'],
        ], $by);
    }

    /**
     * Moves a Minecraft Java server onto the Astrelyse egg, keeping its files.
     *
     * @return array{type: string|null, minecraft: string|null, loader: string|null, egg_managed: bool}
     *
     * @throws DisplayException
     */
    public function convert(Server $server, User $by): array
    {
        if ($this->runner->supports($server)) {
            return $this->current($server);
        }

        $platform = $this->detector->detect($server);
        $type = $platform->platform;
        throw_if($type === null || (! $platform->eligible && $type !== 'vanilla'), DisplayException::class, 'This server is not a Minecraft Java server.');
        throw_unless(isset(SoftwareCatalog::TYPES[$type]), DisplayException::class, "Servers running $type cannot be converted.");

        $egg = Egg::query()->where('author', self::EGG_AUTHOR)->where('name', self::EGG_NAME)->first();
        throw_if($egg === null, DisplayException::class, 'The Astrelyse Minecraft egg is not installed on this panel.');

        $minecraft = $platform->game_version;
        DB::transaction(function () use ($server, $egg, $type, $minecraft, $by): void {
            $from = $server->egg?->name;
            $server = $this->eggs->change($server, $egg, keepVariables: true);

            $this->setVariable($server, 'SERVER_TYPE', $type);
            $this->setVariable($server, 'MC_VERSION', $minecraft ?? 'latest');

            $this->applyJavaImage($server, $minecraft);

            Activity::event('server:software.convert')->subject($server)->actor($by)->property(['from' => $from ?? 'unknown', 'type' => $type])->log();
        });

        return $this->current($server->refresh()->unsetRelations());
    }

    /**
     * Stores the choice in the egg variables and picks the Java image. These run before the plan does.
     */
    private function applySoftware(Server $server, string $type, string $minecraft, ?string $loader): void
    {
        $this->setVariable($server, 'SERVER_TYPE', $type);
        $this->setVariable($server, 'MC_VERSION', $minecraft);
        $this->setVariable($server, 'LOADER_VERSION', $loader ?? '');

        $this->applyJavaImage($server, $minecraft);
    }

    private function applyJavaImage(Server $server, ?string $minecraft): void
    {
        if ($minecraft === null || $minecraft === 'latest') {
            return;
        }

        $egg = $server->egg()->first();
        $image = JavaImageSelector::imageFor($egg === null ? [] : $egg->docker_images, JavaImageSelector::javaMajor($minecraft));

        if ($image !== null && $image !== $server->image) {
            $this->images->update($server, $image);
        }
    }

    private function setVariable(Server $server, string $env, string $value): void
    {
        $variable = $server->egg?->variables()->where('env_variable', $env)->first();

        if ($variable !== null) {
            ServerVariable::query()->updateOrCreate(
                ['server_id' => $server->id, 'variable_id' => $variable->id],
                ['variable_value' => $value],
            );
        }
    }

    /**
     * @return array<string, string>
     */
    private function variableValues(Server $server): array
    {
        $values = [];
        foreach ($server->resolvedVariables() as $variable) {
            $values[$variable->env_variable] = mb_trim((string) ($variable->server_value ?? $variable->default_value));
        }

        return $values;
    }

    private function assertManaged(Server $server): void
    {
        throw_unless($this->runner->supports($server), DisplayException::class, 'This server is not on the Astrelyse Minecraft egg. Convert it first.');
    }

    /**
     * @throws ValidationException
     */
    private function assertChoice(string $type, string $minecraft, ?string $loader): void
    {
        if (! isset(SoftwareCatalog::TYPES[$type])) {
            throw ValidationException::withMessages(['type' => 'Unknown server software.']);
        }

        if (! $this->catalog->hasMinecraft($type, $minecraft)) {
            throw ValidationException::withMessages(['minecraft' => "$type does not offer Minecraft $minecraft."]);
        }

        if ($loader !== null && ($type === 'vanilla' || ! $this->catalog->hasLoader($type, $minecraft, $loader))) {
            throw ValidationException::withMessages(['loader' => "That version is not available for $type on Minecraft $minecraft."]);
        }
    }
}
