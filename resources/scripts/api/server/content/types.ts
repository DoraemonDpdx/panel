import type { InstallOperation } from '../software/types';

export type ContentProvider = 'modrinth' | 'curseforge';
export type ContentSort = 'relevance' | 'downloads' | 'updated' | 'newest';
export type WorldMode = 'replace' | 'new';

/** A modpack or world in a search. */
export interface ContentResult {
    project_id: string;
    slug?: string;
    title: string;
    description: string;
    icon_url: string | null;
    downloads: number;
    author: string;
    categories?: string[];
    /** The loader a modpack needs. */
    loader?: string | null;
    /** The Minecraft version it needs. */
    minecraft?: string | null;
    provider: ContentProvider;
    page_url: string | null;
    date_modified?: string | null;
}

export interface ContentSearchMeta {
    total: number;
    offset: number;
    limit: number;
}

export interface ContentSearchPage {
    data: ContentResult[];
    meta: ContentSearchMeta;
}

/** A modpack version, or a world file; its id is the `version_id`, or the CurseForge `file_id`. */
export interface ContentVersion {
    id: string;
    name: string;
    version_number: string;
    /** `release`, `beta` or `alpha`. */
    version_type: string;
    date_published: string;
    loader?: string | null;
    minecraft?: string | null;
    game_versions?: string[];
    file?: { filename?: string; size?: number } | null;
}

export interface ModpackPreview {
    software: { type: string; minecraft: string; loader: string | null };
    files: { server: number; skipped_client: number; unverified: number };
    size_bytes: number | null;
    warnings: string[];
}

export interface ContentSearchParams {
    provider: ContentProvider;
    query: string;
    sort: ContentSort;
}

export interface WipeBody {
    enabled: boolean;
    keep_worlds: boolean;
}

export interface ModpackInstallInput {
    provider: ContentProvider;
    projectId: string;
    versionId: string;
    wipe: WipeBody;
}

export interface ModpackImportInput {
    path: string;
    wipe: WipeBody;
}

export interface WorldInstallInput {
    projectId: string;
    fileId: string;
    mode: WorldMode;
    backup: boolean;
}

export interface WorldImportInput {
    path: string;
    mode: WorldMode;
    backup: boolean;
}

export type ContentErrorKind = 'provider_unavailable' | 'client_only' | 'not_a_world' | 'other';

export interface ContentError {
    kind: ContentErrorKind;
    message: string;
}

export type { InstallOperation };
