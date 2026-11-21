export type ModSort = 'relevance' | 'downloads' | 'updated' | 'newest';
export type ModProjectType = 'mod' | 'plugin';
export type ModProviderName = 'modrinth' | 'curseforge';
/**
 * Which side runs the content: `server`, `both`, or `unknown` for a CurseForge file Modrinth does not know
 * (shown as "Unverified"). `client` only appears in import reviews; client-only content is never installable.
 */
export type ModSide = 'server' | 'both' | 'unknown' | 'client';

/** The Modrinth loader slugs a server can run, besides vanilla. */
export const MOD_LOADERS = [
    'fabric',
    'quilt',
    'forge',
    'neoforge',
    'paper',
    'purpur',
    'folia',
    'spigot',
    'bukkit',
    'sponge',
    'velocity',
    'bungeecord',
    'waterfall',
] as const;

export interface ModPlatform {
    eligible: boolean;
    platform: string | null;
    game_version: string | null;
    resolved_game_version: string | null;
    project_type: ModProjectType | null;
    install_dir: string | null;
    source: string;
    /** The sources that can be searched; CurseForge is listed only when the panel has a key. */
    providers: ModProviderName[];
}

export interface ModSearchResult {
    project_id: string;
    slug: string;
    title: string;
    description: string;
    icon_url: string | null;
    downloads: number;
    author: string;
    categories: string[];
    /** When the project last changed, if the source says. */
    date_modified?: string | null;
    installed: boolean;
    provider: ModProviderName;
    page_url: string | null;
    /** False when the file may not be downloaded by the panel; the page is the way to get it. */
    distributable: boolean;
    /** Absent from an older backend, which is read as verified. */
    side?: ModSide;
}

export interface ModSearchMeta {
    total: number;
    offset: number;
    limit: number;
    loader: string | null;
    game_version: string | null;
}

export interface ModSearchPage {
    data: ModSearchResult[];
    meta: ModSearchMeta;
}

export interface ModDependency {
    project_id: string | null;
    version_id: string | null;
    /** `required`, `optional`, `incompatible` or `embedded`. */
    dependency_type: string;
}

export interface ModVersion {
    id: string;
    name: string;
    version_number: string;
    /** `release`, `beta` or `alpha`. */
    version_type: string;
    date_published: string;
    game_versions: string[];
    loaders: string[];
    file: { filename: string; url: string | null; size: number; sha512?: string | null; sha1?: string | null };
    dependencies: ModDependency[];
    provider?: ModProviderName;
    page_url?: string | null;
    distributable?: boolean;
    side?: ModSide;
}

export interface InstalledMod {
    /** Null for a jar the panel did not install. */
    id: number | null;
    project_id: string | null;
    version_id: string | null;
    title: string | null;
    icon_url: string | null;
    /** The on-disk name; it ends in `.disabled` while the mod is disabled. */
    filename: string;
    version_number: string | null;
    /** Null for an untracked jar. */
    provider: ModProviderName | null;
    slug: string | null;
    project_type: ModProjectType | null;
    page_url: string | null;
    enabled: boolean;
    /** False for a jar found on disk that the panel has no record of. */
    tracked: boolean;
    /** The file is on disk; false when it was deleted outside the panel, null when the node could not be asked. */
    present: boolean | null;
    update: { version_id: string; version_number: string } | null;
    /** The file came from an installed modpack. */
    from_modpack?: boolean;
}

export interface ModSearchParams {
    provider: ModProviderName;
    query: string;
    gameVersion: string | null;
    sort: ModSort;
    /** A provider tag; null for every category. */
    category: string | null;
}

/** The loader is never sent: the panel always matches the detected one. */
export interface ModVersionParams {
    provider: ModProviderName;
    gameVersion: string | null;
}

export type ModsErrorKind = 'unsupported' | 'unavailable' | 'not_distributable' | 'other';

export interface ModsError {
    kind: ModsErrorKind;
    message: string;
    /** Where the file can be downloaded by hand, for `not_distributable`. */
    pageUrl?: string;
}

/** The installed files, and whether the node could be asked which of them are on disk. */
export interface InstalledList {
    data: InstalledMod[];
    diskUnavailable: boolean;
}

export interface ModCategory {
    id: string;
    label: string;
}

/** A project's detail, read for the drawer. Every field is optional: the page falls back to the search row. */
export interface ModProject {
    project_id: string;
    title?: string;
    description?: string | null;
    /** The long description; Modrinth's `body` or CurseForge's description. Untrusted: shown as text only. */
    body?: string | null;
    gallery?: { url: string; title?: string | null }[];
    links?: { source?: string | null; issues?: string | null; wiki?: string | null; discord?: string | null };
    page_url?: string | null;
}

/** `POST /content/resolve`. */
export interface ResolvedLink {
    /** `shader` and `resourcepack` links are recognised but refused. */
    kind: 'mod' | 'plugin' | 'modpack' | 'world' | 'shader' | 'resourcepack' | (string & {});
    provider: ModProviderName;
    project_id: string;
    version_id?: string | null;
    title: string;
    icon_url: string | null;
    compatible: boolean;
    reason?: string | null;
}

export type PrismMatch = 'url' | 'filename' | 'name' | 'none';

export interface PrismItem {
    line: number;
    name: string;
    url?: string | null;
    matched: {
        provider: ModProviderName;
        project_id: string;
        version_id: string;
        title: string;
        icon_url: string | null;
        filename?: string | null;
    } | null;
    match: PrismMatch;
    side: ModSide;
    compatible: boolean;
    selected: boolean;
    reason?: string | null;
}

export interface PrismInstallItem {
    provider: ModProviderName;
    project_id: string;
    version_id: string;
}

export type InstallOperationStatus = 'pending' | 'running' | 'succeeded' | 'failed';

/** A row of `server_install_operations`, as `GET /software/operations/{id}` returns it. */
export interface InstallOperation {
    id: number | string;
    kind: string;
    status: InstallOperationStatus;
    summary?: { count?: number } | null;
    error?: string | null;
}
