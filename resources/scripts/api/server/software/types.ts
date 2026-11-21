export type SoftwareKind = 'mod' | 'plugin' | 'vanilla';
export type OperationStatus = 'pending' | 'running' | 'succeeded' | 'failed';
/** What happens to the files in `mods/` and `plugins/` when the server changes family. */
export type ModsAction = 'keep' | 'disable' | 'remove';

export interface SoftwareTypeInfo {
    type: string;
    label: string;
    kind: SoftwareKind;
    /** A lucide icon name. */
    icon: string;
    description?: string;
}

export interface SoftwareCurrent {
    type: string | null;
    minecraft: string | null;
    loader: string | null;
    /** The server runs the Astrelyse Minecraft egg; when it does not, it can be converted. */
    egg_managed: boolean;
}

/** What an operation says about itself; the install adds more than the page reads. */
export interface OperationSummary {
    /** The folder name of a world installed alongside. */
    level_name?: string | null;
}

export interface InstallOperation {
    id: number | string;
    kind: string;
    status: OperationStatus;
    summary: OperationSummary | null;
    error: string | null;
    started_at: string | null;
    finished_at: string | null;
    created_at?: string | null;
}

export interface ModpackInfo {
    provider: 'modrinth' | 'curseforge';
    project_id: string;
    version_id: string | null;
    title: string;
    icon_url: string | null;
    version_number: string | null;
}

export interface SoftwareState {
    current: SoftwareCurrent;
    types: SoftwareTypeInfo[];
    operation: InstallOperation | null;
    modpack: ModpackInfo | null;
}

export interface CatalogMinecraft {
    id: string;
    type: 'release' | 'snapshot';
    latest: boolean;
}

export interface CatalogLoader {
    id: string;
    stable: boolean;
}

export interface SoftwareCatalog {
    minecraft: CatalogMinecraft[];
    /** Loader versions by Minecraft version; builds for Paper, Purpur and Folia. */
    loaders: Record<string, CatalogLoader[]>;
}

export interface SoftwareInstallBody {
    type: string;
    minecraft: string;
    loader?: string;
    wipe: { enabled: boolean; keep_worlds: boolean };
    mods_action: ModsAction;
}

export type SoftwareErrorKind = 'unsupported' | 'busy' | 'other';

/** Catalog key of a list that is valid for every Minecraft version (Fabric and Quilt). */
export const ANY_MINECRAFT = '*';

export interface SoftwareError {
    kind: SoftwareErrorKind;
    message: string;
}

export const isActiveOperation = (operation: Pick<InstallOperation, 'status'> | null | undefined): boolean =>
    operation?.status === 'pending' || operation?.status === 'running';
