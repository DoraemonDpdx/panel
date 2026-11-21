import type { PanelDestination } from '@/sdk/navigation';
import type {
    InstalledMod,
    ModCategory,
    ModDependency,
    ModPlatform,
    ModProject,
    ModProviderName,
    ModSearchResult,
    ModVersion,
    PrismItem,
    ResolvedLink,
} from '@/api/server/mods/types';
import type {
    InstalledFilter,
    InstalledModItem,
    ModCategoryOption,
    ModCompatibility,
    ModDependencyItem,
    ModProjectDetail,
    ModResultItem,
    ModsPlatformInfo,
    ModVersionItem,
    PrismRow,
    ResolvedLinkItem,
} from './modsTypes';

export const PROVIDER_NAMES = {
    modrinth: 'Modrinth',
    curseforge: 'CurseForge',
} as const satisfies Record<ModProviderName, string>;

const LOADER_NAMES = {
    paper: 'Paper',
    purpur: 'Purpur',
    folia: 'Folia',
    spigot: 'Spigot',
    bukkit: 'Bukkit',
    sponge: 'Sponge',
    fabric: 'Fabric',
    quilt: 'Quilt',
    forge: 'Forge',
    neoforge: 'NeoForge',
    velocity: 'Velocity',
    bungeecord: 'BungeeCord',
    waterfall: 'Waterfall',
} as const;

const loaderNames = new Map<string, string>(Object.entries(LOADER_NAMES));

export const loaderName = (slug: string | null): string => (slug ? (loaderNames.get(slug) ?? slug) : 'Unknown');

export const platformInfo = (
    detected: ModPlatform | undefined,
    version: { detected: string | null; latest: boolean },
    providers: readonly ModProviderName[]
): ModsPlatformInfo => ({
    eligible: detected?.eligible ?? false,
    noun: detected?.project_type ?? 'mod',
    title: detected?.project_type === 'plugin' ? 'Plugins' : 'Mods',
    detectedLoader: detected?.platform ?? null,
    detectedVersion: version.detected,
    versionIsLatest: version.latest,
    installDir: detected?.install_dir ?? null,
    providers,
});

export const chipLabel = (
    loader: string | null,
    gameVersion: string | null,
    state: { overridden: boolean; latest: boolean }
): string => {
    const version = gameVersion ?? 'any version';
    let note = '';

    if (state.overridden) {
        note = ' (custom)';
    } else if (state.latest) {
        note = ' (latest)';
    }

    return `${loaderName(loader)} · ${version}${note}`;
};

export const searchResults = (
    pages: readonly { data: readonly ModSearchResult[] }[],
    installing: ReadonlySet<string>
): ModResultItem[] =>
    pages.flatMap((page) =>
        page.data.map((item) => ({
            projectId: item.project_id,
            title: item.title,
            description: item.description,
            iconUrl: item.icon_url,
            downloads: item.downloads,
            author: item.author,
            categories: item.categories.slice(0, 2),
            updated: item.date_modified ?? null,
            installed: item.installed,
            installing: installing.has(item.project_id),
            provider: item.provider,
            pageUrl: item.page_url,
            distributable: item.distributable,
            side: item.side ?? 'server',
        }))
    );

export const installedItem = (mod: InstalledMod, busy: boolean): InstalledModItem => ({
    filename: mod.filename,
    id: mod.id,
    projectId: mod.project_id,
    title: mod.tracked ? mod.title || mod.filename : mod.filename,
    iconUrl: mod.icon_url,
    version: mod.version_number,
    enabled: mod.enabled,
    tracked: mod.tracked,
    missing: mod.present === false,
    update: mod.update ? { versionId: mod.update.version_id, version: mod.update.version_number } : null,
    provider: mod.tracked ? mod.provider : null,
    pageUrl: mod.tracked ? mod.page_url : null,
    canChangeVersion: mod.tracked && mod.id !== null && mod.project_id !== null,
    fromModpack: mod.from_modpack === true,
    busy,
});

export const filterInstalled = (
    raw: readonly InstalledMod[],
    busy: ReadonlySet<string>,
    status: InstalledFilter,
    text: string
): InstalledModItem[] => {
    const needle = text.trim().toLowerCase();

    return raw
        .map((mod) => installedItem(mod, busy.has(mod.filename)))
        .filter(
            (item) =>
                (status === 'all' || (status === 'enabled') === item.enabled) &&
                (needle === '' ||
                    item.title.toLowerCase().includes(needle) ||
                    item.filename.toLowerCase().includes(needle))
        );
};

/** `26.1–26.2` for a run of versions, or the one version. */
const versionRange = (versions: readonly string[]): string => {
    const first = versions.at(0);
    const last = versions.at(-1);

    return first !== undefined && last !== undefined && first !== last ? `${first}–${last}` : (first ?? 'unknown');
};

export const compatibility = (version: ModVersion, serverVersion: string | null): ModCompatibility => {
    const full = version.game_versions.join(', ');

    if (serverVersion === null) {
        return { tone: 'neutral', label: `Built for ${versionRange(version.game_versions)}`, full };
    }

    if (version.game_versions.includes(serverVersion)) {
        return { tone: 'success', label: `Works on ${serverVersion}`, full };
    }

    return { tone: 'warning', label: `Built for ${versionRange(version.game_versions)}`, full };
};

export const versionItem = (version: ModVersion, current: boolean, serverVersion: string | null): ModVersionItem => ({
    id: version.id,
    name: version.name,
    number: version.version_number,
    type: version.version_type,
    published: version.date_published,
    size: version.file.size,
    compatibility: compatibility(version, serverVersion),
    current,
    distributable: version.distributable ?? true,
    pageUrl: version.page_url ?? null,
});

export const requiredDependencies = (
    version: ModVersion | undefined,
    installed: readonly InstalledMod[]
): ModDependencyItem[] =>
    (version?.dependencies ?? [])
        .filter(
            (dependency): dependency is ModDependency & { project_id: string } =>
                dependency.dependency_type === 'required' && dependency.project_id !== null
        )
        .map((dependency) => ({
            projectId: dependency.project_id,
            versionId: dependency.version_id,
            installed: installed.some((mod) => mod.project_id === dependency.project_id),
        }));

/** The version an update points at when it is compatible, else the newest compatible one. */
export const preselectVersion = (
    mod: InstalledMod | undefined,
    compatible: readonly ModVersion[],
    preferred?: string | null
): string | null => {
    if (preferred && compatible.some((version) => version.id === preferred)) {
        return preferred;
    }

    const updateId = mod?.update?.version_id;

    return (compatible.some((version) => version.id === updateId) ? updateId : compatible[0]?.id) ?? null;
};

/** The category tags offered when the source gives none: Modrinth's. */
const MODRINTH_CATEGORIES = [
    'adventure',
    'decoration',
    'economy',
    'equipment',
    'food',
    'game-mechanics',
    'library',
    'magic',
    'management',
    'minigame',
    'mobs',
    'optimization',
    'social',
    'storage',
    'technology',
    'transportation',
    'utility',
    'worldgen',
];

const titleCase = (tag: string): string =>
    tag
        .split(/[-_\s]+/)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

export const categoryOptions = (
    provided: readonly ModCategory[] | undefined,
    provider: ModProviderName
): ModCategoryOption[] => {
    if (provided && provided.length > 0) {
        return provided.map((category) => ({ value: category.id, label: category.label || titleCase(category.id) }));
    }

    return provider === 'modrinth' ? MODRINTH_CATEGORIES.map((tag) => ({ value: tag, label: titleCase(tag) })) : [];
};

/** Only a plain https link is followed or shown as an image; anything else from a source is dropped. */
export const safeHttpUrl = (url: string | null | undefined): string | null => {
    if (!url) {
        return null;
    }

    try {
        return new URL(url).protocol === 'https:' ? url : null;
    } catch {
        return null;
    }
};

const MAX_DESCRIPTION = 4000;

/**
 * A source's description as plain text. It is never parsed as HTML or markdown into elements: the text
 * is shown as it is, so a tag in it appears as characters. Markdown images and link targets are only
 * tidied away so the text reads.
 */
export const plainDescription = (body: string | null | undefined): string | null => {
    const text = (body ?? '')
        .replaceAll(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replaceAll(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replaceAll(/^#{1,6}\s+/gm, '')
        .replaceAll(/\r\n?/g, '\n')
        .replaceAll(/\n{3,}/g, '\n\n')
        .trim();

    return text === '' ? null : text.slice(0, MAX_DESCRIPTION);
};

const LINK_LABELS = [
    ['source', 'Source'],
    ['issues', 'Issues'],
    ['wiki', 'Wiki'],
    ['discord', 'Discord'],
] as const;

export const projectDetail = (project: ModProject | undefined, loading: boolean): ModProjectDetail => ({
    loading,
    description: plainDescription(project?.body ?? project?.description),
    gallery: (project?.gallery ?? [])
        .flatMap((image) => {
            const url = safeHttpUrl(image.url);

            return url ? [{ url, title: image.title ?? '' }] : [];
        })
        .slice(0, 4),
    links: LINK_LABELS.flatMap(([key, label]) => {
        const url = safeHttpUrl(project?.links?.[key]);

        return url ? [{ label, url }] : [];
    }),
});

const INSTALLABLE_KINDS = new Set(['mod', 'plugin']);
const SOFTWARE_KINDS = new Set(['modpack', 'world']);

const REFUSALS = new Map([
    ['shader', "Shaders are client-only content, so they can't be installed on a server."],
    ['resourcepack', "Resource packs are client-only content, so they can't be installed on a server."],
]);

export const isSoftwareKind = (kind: string): boolean => SOFTWARE_KINDS.has(kind);

export const resolvedItem = (link: ResolvedLink): ResolvedLinkItem => {
    const refusal = REFUSALS.get(link.kind);
    const known = INSTALLABLE_KINDS.has(link.kind) || isSoftwareKind(link.kind);
    const compatible = link.compatible && refusal === undefined && known;

    return {
        kind: link.kind,
        provider: link.provider,
        projectId: link.project_id,
        title: link.title,
        iconUrl: link.icon_url,
        compatible,
        reason: compatible ? null : (refusal ?? link.reason ?? "This link can't be installed on this server."),
        installable: compatible && INSTALLABLE_KINDS.has(link.kind),
    };
};

/** The search a Software page link carries; the page reads `modpack` or `world`, and `version` when set. */
export type SoftwareSearch = {
    modpack?: string;
    world?: string;
    version?: string;
    tab?: string;
    import?: string;
};

/** A modpack or world link goes to the Software page, which is not in the core path list yet. */
export const softwareDestination = (serverId: string, search?: SoftwareSearch): PanelDestination =>
    // oxlint-disable-next-line rules/no-chained-type-assertions -- `/server/$id/software` joins `CorePanelPath` when the Software page lands.
    ({ to: '/server/$id/software', params: { id: serverId }, search }) as unknown as PanelDestination;

export const softwareSearch = (link: ResolvedLink): SoftwareSearch => {
    const search: SoftwareSearch = {};
    const target = `${link.provider}:${link.project_id}`;

    if (link.kind === 'world') {
        search.world = target;
    } else {
        search.modpack = target;
    }

    if (link.version_id) {
        search.version = link.version_id;
    }

    return search;
};

const CLIENT_ONLY = "Client-only: it isn't installed on a server.";
const UNMATCHED = 'No matching project was found on Modrinth or CurseForge.';

/** One row of the review: what it can be, and whether it starts ticked. */
export const prismRow = (item: PrismItem, ticked: boolean): PrismRow => {
    const clientOnly = item.side === 'client';
    const matched = item.matched;
    const selectable = matched !== null && item.compatible && !clientOnly;
    let reason: string | null = null;

    if (!selectable) {
        if (clientOnly) {
            reason = item.reason ?? CLIENT_ONLY;
        } else if (matched === null) {
            reason = item.reason ?? UNMATCHED;
        } else {
            reason = item.reason ?? "It doesn't match this server's loader or version.";
        }
    }

    return {
        line: item.line,
        name: item.name,
        matched: matched ? { title: matched.title, iconUrl: matched.icon_url, provider: matched.provider } : null,
        match: item.match,
        side: item.side,
        reason,
        ticked: selectable && ticked,
        selectable,
        clientOnly,
    };
};

/** Rows the preview recommends: compatible, matched, verified server-side, and trusted by the match. */
export const recommendedLines = (items: readonly PrismItem[]): number[] =>
    items
        .filter((item) => prismRow(item, true).selectable && item.selected && item.side !== 'unknown')
        .map((item) => item.line);

/** Every row that can be installed without a doubt about its side; unverified rows are left to the user. */
export const compatibleLines = (items: readonly PrismItem[]): number[] =>
    items.filter((item) => prismRow(item, true).selectable && item.side !== 'unknown').map((item) => item.line);
