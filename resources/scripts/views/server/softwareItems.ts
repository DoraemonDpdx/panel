import type { ContentResult, ContentVersion, ModpackPreview } from '@/api/server/content/types';
import {
    ANY_MINECRAFT,
    isActiveOperation,
    type CatalogLoader,
    type CatalogMinecraft,
    type InstallOperation,
    type ModpackInfo,
    type ModsAction,
    type SoftwareCatalog,
    type SoftwareInstallBody,
    type SoftwareCurrent,
    type SoftwareKind,
    type SoftwareTypeInfo,
} from '@/api/server/software/types';
import { isString } from '@/lib/objects';
import { bytesToString } from '@/lib/formatters';
import { loaderName } from './modsItems';
import type {
    ContentRowItem,
    ContentVersionItem,
    ModsActionOption,
    PreviewView,
    SelectOptionItem,
    SoftwareHeaderModel,
    SoftwareOperationView,
    TypeCardItem,
} from './softwareTypes';

export const KIND_LABELS = {
    mod: 'Mods',
    plugin: 'Plugins',
    vanilla: 'Vanilla',
} as const satisfies Record<SoftwareKind, string>;

const DESCRIPTIONS = {
    vanilla: "Mojang's own server, with no mods or plugins.",
    paper: 'A fast server that runs Bukkit and Spigot plugins.',
    purpur: 'Paper with extra options for tuning gameplay.',
    folia: "Paper's multithreaded fork, built for very large servers.",
    fabric: 'A light mod loader with a large mod library.',
    quilt: 'A mod loader that runs Fabric mods.',
    forge: 'The long-running mod loader, with the biggest modpacks.',
    neoforge: 'The modern successor to Forge.',
} as const;

const descriptions = new Map<string, string>(Object.entries(DESCRIPTIONS));

export const MODS_ACTIONS: readonly ModsActionOption[] = [
    { value: 'keep', label: 'Keep them where they are' },
    { value: 'disable', label: 'Move them to a disabled folder' },
    { value: 'remove', label: 'Delete them' },
];

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

export const typeLabel = (type: string | null, types: readonly SoftwareTypeInfo[]): string =>
    type === null ? 'Unknown' : (types.find((candidate) => candidate.type === type)?.label ?? capitalize(type));

export const typeCards = (types: readonly SoftwareTypeInfo[], currentType: string | null): TypeCardItem[] =>
    types.map((info) => ({
        type: info.type,
        label: info.label,
        kind: info.kind,
        kindLabel: KIND_LABELS[info.kind],
        icon: info.icon,
        description: info.description ?? descriptions.get(info.type) ?? '',
        current: info.type === currentType,
    }));

/** `Fabric 0.16.9 · Minecraft 1.21.1`. */
export const versionLine = (
    type: string,
    minecraft: string | null,
    loader: string | null,
    types: readonly SoftwareTypeInfo[]
): string => {
    const software = [typeLabel(type, types), loader].filter((part): part is string => !!part).join(' ');

    return minecraft ? `${software} · Minecraft ${minecraft}` : software;
};

const ACTIVE_LABELS = {
    software: 'Installing…',
    modpack: 'Installing modpack…',
    world: 'Installing world…',
    clear: 'Clearing files…',
    reinstall: 'Reinstalling…',
} as const;

const activeLabels = new Map<string, string>(Object.entries(ACTIVE_LABELS));

const DONE_LABELS = {
    clear: 'Cleared',
    reinstall: 'Reinstalled',
} as const;

const doneLabels = new Map<string, string>(Object.entries(DONE_LABELS));

/** The level name an install says to set, when its summary has one. */
const levelNote = (summary: InstallOperation['summary']): string | null => {
    const level = summary?.level_name;

    return isString(level) && level !== ''
        ? `Set level-name to ${level} in server.properties to use the new world.`
        : null;
};

export const operationView = (operation: InstallOperation | null): SoftwareOperationView | null => {
    if (!operation) {
        return null;
    }

    const active = isActiveOperation(operation);
    const failed = operation.status === 'failed';

    let label: string;

    if (active) {
        label = activeLabels.get(operation.kind) ?? 'Installing…';
    } else if (failed) {
        label = 'Failed';
    } else {
        label = doneLabels.get(operation.kind) ?? 'Succeeded';
    }

    return {
        id: String(operation.id),
        status: operation.status,
        active,
        failed,
        succeeded: operation.status === 'succeeded',
        label,
        at: active ? operation.started_at : (operation.finished_at ?? operation.started_at),
        error: operation.error,
        note: operation.status === 'succeeded' ? levelNote(operation.summary) : null,
    };
};

export const headerModel = (
    current: SoftwareCurrent,
    types: readonly SoftwareTypeInfo[],
    modpack: ModpackInfo | null,
    operation: InstallOperation | null
): SoftwareHeaderModel => ({
    typeLabel: typeLabel(current.type, types),
    icon: types.find((candidate) => candidate.type === current.type)?.icon ?? 'server',
    version: current.type ? versionLine(current.type, current.minecraft, current.loader, types) : 'Not detected yet',
    modpack: modpack ? { title: modpack.title, iconUrl: modpack.icon_url, version: modpack.version_number } : null,
    operation: operationView(operation),
});

/** `mods`, `plugins` or `mods and plugins`, for what the old family left behind. */
export const familyNoun = (kind: SoftwareKind | undefined): string => {
    if (kind === 'mod') {
        return 'mods';
    }

    return kind === 'plugin' ? 'plugins' : 'mods and plugins';
};

export const minecraftOptions = (versions: readonly CatalogMinecraft[]): SelectOptionItem[] =>
    versions.map((version) => ({
        value: version.id,
        label: `${version.id}${version.type === 'snapshot' ? ' (snapshot)' : ''}${version.latest ? ' (latest)' : ''}`,
    }));

/** The newest release, or the one marked latest. */
export const defaultMinecraft = (versions: readonly CatalogMinecraft[]): string | null =>
    (
        versions.find((version) => version.latest && version.type === 'release') ??
        versions.find((version) => version.type === 'release') ??
        versions[0]
    )?.id ?? null;

/** The first stable loader or build; the catalog lists the newest first. */
export const recommendedBuild = (builds: readonly CatalogLoader[]): string | null => {
    const build = builds.find((candidate) => candidate.stable) ?? builds[0];

    return build ? String(build.id) : null;
};

export const buildOptions = (builds: readonly CatalogLoader[]): SelectOptionItem[] => {
    const recommended = recommendedBuild(builds);

    return builds.map((build) => ({
        value: String(build.id),
        label: `${build.id}${String(build.id) === recommended ? ' (recommended)' : ''}${build.stable ? '' : ' (unstable)'}`,
    }));
};

/** The label of the second select: a loader version for the mod loaders, a build for the plugin servers. */
export const buildLabel = (type: string): string | null => {
    if (type === 'vanilla') {
        return null;
    }

    return ['paper', 'purpur', 'folia'].includes(type) ? 'Build' : 'Loader version';
};

interface SummaryInput {
    label: string;
    minecraft: string | null;
    build: string | null;
    fresh: boolean;
    keepWorlds: boolean;
    family: { noun: string; action: ModsAction } | null;
}

const FAMILY_SENTENCES = {
    keep: 'leave your current {noun} where they are',
    disable: 'move your current {noun} to a disabled folder',
    remove: 'delete your current {noun}',
} as const satisfies Record<ModsAction, string>;

/** The sentence under the form: what installing will do. */
export const installSummary = ({ label, minecraft, build, fresh, keepWorlds, family }: SummaryInput): string => {
    const software = [label, build].filter((part): part is string => !!part).join(' ');
    const target = `${software}${minecraft ? ` for ${minecraft}` : ''}`;
    let files: string;

    if (fresh) {
        files = keepWorlds ? 'keep only your worlds' : 'delete everything, worlds included';
    } else {
        files = 'keep all your files';
    }

    const parts = [`install ${target}`, files];

    if (family && !fresh) {
        parts.push(FAMILY_SENTENCES[family.action].replace('{noun}', family.noun));
    }

    const [first, ...rest] = parts;
    const tail = rest.length > 1 ? `${rest.slice(0, -1).join(', ')} and ${rest.at(-1)}` : rest.join('');

    return `The server will stop, ${first}${tail ? ` and ${tail}` : ''}. Takes about a minute.`;
};

const compact = (text: string | null | undefined): string | null => (text ? text : null);

export const contentRow = (item: ContentResult): ContentRowItem => ({
    projectId: item.project_id,
    provider: item.provider,
    title: item.title,
    description: item.description,
    iconUrl: item.icon_url,
    downloads: item.downloads,
    author: item.author,
    categories: (item.categories ?? []).slice(0, 2),
    loader: item.loader ? loaderName(item.loader) : null,
    minecraft: compact(item.minecraft),
    updated: item.date_modified ?? null,
    pageUrl: item.page_url,
});

export const contentRows = (pages: readonly { data: readonly ContentResult[] }[]): ContentRowItem[] =>
    pages.flatMap((page) => page.data.map(contentRow));

export const versionItem = (version: ContentVersion): ContentVersionItem => ({
    id: String(version.id),
    number: version.version_number || version.name,
    name: version.name,
    type: version.version_type,
    published: version.date_published,
    loader: version.loader ? loaderName(version.loader) : null,
    minecraft: compact(version.minecraft ?? version.game_versions?.at(-1)),
    size: version.file?.size ?? null,
});

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

export const previewView = (preview: ModpackPreview, types: readonly SoftwareTypeInfo[]): PreviewView => {
    const { files, software } = preview;
    const parts = [plural(files.server, 'server mod')];

    if (files.skipped_client > 0) {
        parts.push(`${files.skipped_client} client-only skipped`);
    }

    if (files.unverified > 0) {
        parts.push(`${files.unverified} unverified`);
    }

    return {
        software: versionLine(software.type, software.minecraft, software.loader, types),
        counts: parts.join(' · '),
        size: preview.size_bytes ? bytesToString(preview.size_bytes) : null,
        warnings: preview.warnings,
    };
};

export const levelHint =
    'It is installed in its own folder. Set level-name in server.properties to its folder name, then restart.';

export const worldSummary = (mode: 'replace' | 'new', backup: boolean): string => {
    if (mode === 'new') {
        return 'The server will stop and install the world alongside your current one.';
    }

    return backup
        ? 'The server will stop, save a backup copy of your current world and replace it.'
        : 'The server will stop and replace your current world. No copy is kept.';
};

export interface CatalogChoice {
    readonly minecraft: string | null;
    readonly builds: readonly CatalogLoader[];
    readonly build: string | null;
}

/** The chosen Minecraft version and build, each falling back to the recommended one when the pick is not offered. */
export const resolveChoice = (
    catalog: SoftwareCatalog | undefined,
    minecraftPick: string | null,
    buildPick: string | null
): CatalogChoice => {
    const versions = catalog?.minecraft ?? [];
    const picked = versions.find((version) => version.id === minecraftPick)?.id;
    const minecraft = picked ?? defaultMinecraft(versions);
    const builds = minecraft === null ? [] : (catalog?.loaders[minecraft] ?? catalog?.loaders[ANY_MINECRAFT] ?? []);
    const pickedBuild = builds.find((candidate) => String(candidate.id) === buildPick);

    return { minecraft, builds, build: pickedBuild ? String(pickedBuild.id) : recommendedBuild(builds) };
};

/** The new type is of another family than the one running. */
export const changesFamily = (kind: SoftwareKind | undefined, currentKind: SoftwareKind | undefined): boolean =>
    kind !== undefined && currentKind !== undefined && kind !== currentKind;

export interface InstallChoices {
    readonly type: string;
    readonly minecraft: string;
    readonly build: string | null;
    readonly fresh: boolean;
    readonly keepWorlds: boolean;
    readonly modsAction: ModsAction;
}

export const installBody = (choices: InstallChoices): SoftwareInstallBody => ({
    type: choices.type,
    minecraft: choices.minecraft,
    loader: choices.type === 'vanilla' ? undefined : (choices.build ?? undefined),
    wipe: { enabled: choices.fresh, keep_worlds: choices.keepWorlds },
    mods_action: choices.modsAction,
});
