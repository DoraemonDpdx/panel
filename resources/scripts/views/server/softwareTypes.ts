import type { ContentProvider, ContentSort, WorldMode } from '@/api/server/content/types';
import type { ModsAction, OperationStatus, SoftwareKind } from '@/api/server/software/types';
import type { CorePanelDestination } from '@/sdk/navigation';

export type SoftwareTab = 'type' | 'modpacks' | 'worlds' | 'maintenance';

/** The software page: its title, for the tab and the document. */
export interface SoftwarePageModel {
    readonly loading: boolean;
    readonly error: string | null;
    readonly retry: () => void;
    readonly title: string;
}

/** The latest operation, said in the words of the status chip. */
export interface SoftwareOperationView {
    readonly id: string;
    readonly status: OperationStatus;
    /** Pending or running: the page polls it and locks its writes. */
    readonly active: boolean;
    readonly failed: boolean;
    readonly succeeded: boolean;
    /** `Installing…`, `Failed` or `Succeeded`, for the kind of operation. */
    readonly label: string;
    /** When it finished, or started while it runs, as an ISO date. */
    readonly at: string | null;
    readonly error: string | null;
    /** A hint the install left behind, such as the level name to set. */
    readonly note: string | null;
}

export interface SoftwareHeaderModel {
    readonly typeLabel: string;
    readonly icon: string;
    /** `Fabric 0.16.9 · Minecraft 1.21.1`. */
    readonly version: string;
    readonly modpack: {
        readonly title: string;
        readonly iconUrl: string | null;
        readonly version: string | null;
    } | null;
    readonly operation: SoftwareOperationView | null;
}

export interface TypeCardItem {
    readonly type: string;
    readonly label: string;
    readonly kind: SoftwareKind;
    /** `Mods`, `Plugins` or `Vanilla`. */
    readonly kindLabel: string;
    readonly icon: string;
    readonly description: string;
    readonly current: boolean;
}

export interface SelectOptionItem {
    readonly value: string;
    readonly label: string;
}

export interface ModsActionOption {
    readonly value: ModsAction;
    readonly label: string;
}

/** Set when the new type is of another family than the one running (mod, plugin or vanilla). */
export interface FamilyChange {
    /** `mods`, `plugins` or `mods and plugins`. */
    readonly noun: string;
    readonly action: ModsAction;
    readonly setAction: (action: ModsAction) => void;
    readonly options: readonly ModsActionOption[];
}

export interface ConfigureModel {
    readonly type: string;
    readonly label: string;
    readonly icon: string;
    readonly minecraftOptions: readonly SelectOptionItem[];
    readonly minecraft: string | null;
    readonly setMinecraft: (version: string) => void;
    readonly showSnapshots: boolean;
    readonly setShowSnapshots: (show: boolean) => void;
    /** `Loader version` or `Build`; null for vanilla, which has neither. */
    readonly buildLabel: string | null;
    readonly buildOptions: readonly SelectOptionItem[];
    readonly build: string | null;
    readonly setBuild: (build: string) => void;
    readonly catalogLoading: boolean;
    readonly catalogError: string | null;
    readonly retryCatalog: () => void;
    readonly fresh: boolean;
    readonly setFresh: (fresh: boolean) => void;
    readonly keepWorlds: boolean;
    readonly setKeepWorlds: (keep: boolean) => void;
    readonly family: FamilyChange | null;
    /** What installing will do, in a sentence. */
    readonly summary: string;
    /** The install deletes worlds or the old mods, so the confirm is a warning. */
    readonly destructive: boolean;
    /** A Minecraft version is chosen, and the catalog is in. */
    readonly ready: boolean;
    readonly installing: boolean;
    readonly install: () => Promise<void>;
    readonly close: () => void;
}

export interface SoftwareTypeModel {
    readonly cards: readonly TypeCardItem[];
    readonly selected: string | null;
    readonly select: (type: string) => void;
    /** The server is not on the Astrelyse egg, so its software cannot be changed here until it is converted. */
    readonly needsConvert: boolean;
    readonly convert: { readonly pending: boolean; readonly run: () => Promise<void> };
    readonly configure: ConfigureModel | null;
}

/** A modpack or world in a search. */
export interface ContentRowItem {
    readonly projectId: string;
    readonly provider: ContentProvider;
    readonly title: string;
    readonly description: string;
    readonly iconUrl: string | null;
    readonly downloads: number;
    readonly author: string;
    /** At most two. */
    readonly categories: readonly string[];
    /** The loader name, such as `Fabric`; null when the source does not say. */
    readonly loader: string | null;
    readonly minecraft: string | null;
    readonly updated: string | null;
    readonly pageUrl: string | null;
}

export interface ContentHeader {
    readonly title: string;
    readonly iconUrl: string | null;
    readonly author: string | null;
    readonly description: string | null;
    readonly pageUrl: string | null;
    readonly provider: ContentProvider;
}

export interface ContentVersionItem {
    readonly id: string;
    readonly number: string;
    readonly name: string;
    /** `release`, `beta` or `alpha`. */
    readonly type: string;
    readonly published: string;
    readonly loader: string | null;
    readonly minecraft: string | null;
    readonly size: number | null;
}

/** The search, the version drawer and the upload of one kind of content. */
export interface ContentBrowse {
    readonly providers: readonly ContentProvider[];
    readonly provider: ContentProvider;
    readonly setProvider: (provider: ContentProvider) => void;
    readonly query: string;
    readonly setQuery: (query: string) => void;
    readonly sort: ContentSort;
    readonly setSort: (sort: ContentSort) => void;
    readonly results: readonly ContentRowItem[];
    readonly total: number;
    readonly loading: boolean;
    readonly loadingMore: boolean;
    readonly error: string | null;
    /** The source has no key on this panel; a note replaces the list. */
    readonly unavailable: string | null;
    readonly retry: () => void;
    readonly hasMore: boolean;
    readonly loadMore: () => void;
    readonly emptyMessage: string;
    readonly open: (item: ContentRowItem) => void;
}

export interface PreviewView {
    /** `Fabric 0.16.9 · Minecraft 1.21.1`, the software the server switches to. */
    readonly software: string;
    /** `142 server mods · 31 client-only skipped · 3 unverified`. */
    readonly counts: string;
    readonly size: string | null;
    readonly warnings: readonly string[];
}

export interface ModpackDrawerModel {
    readonly header: ContentHeader;
    readonly versions: readonly ContentVersionItem[];
    readonly loading: boolean;
    readonly error: string | null;
    readonly retry: () => void;
    readonly selected: string | null;
    readonly select: (id: string) => void;
    readonly preview: {
        readonly loading: boolean;
        readonly error: string | null;
        readonly retry: () => void;
        readonly data: PreviewView | null;
    };
    /** `Start fresh (keep worlds)`: wipe everything but the worlds. */
    readonly fresh: boolean;
    readonly setFresh: (fresh: boolean) => void;
    readonly install: () => Promise<void>;
    readonly close: () => void;
}

/** A file the user uploads, then imports. */
export interface ImporterModel {
    /** File types the picker offers. */
    readonly accept: string;
    readonly pick: (file: File) => Promise<void>;
    readonly uploading: boolean;
    /** 0 to 100 while uploading. */
    readonly progress: number | null;
    readonly uploaded: { readonly name: string; readonly path: string } | null;
    readonly installing: boolean;
    readonly confirm: () => Promise<void>;
    readonly cancel: () => void;
}

export interface ModpacksModel extends ContentBrowse {
    readonly drawer: ModpackDrawerModel | null;
    readonly importer: ImporterModel & {
        readonly fresh: boolean;
        readonly setFresh: (fresh: boolean) => void;
    };
}

export interface WorldOptionsModel {
    readonly mode: WorldMode;
    readonly setMode: (mode: WorldMode) => void;
    /** Keep a copy of the current world; on by default and only for `replace`. */
    readonly backup: boolean;
    readonly setBackup: (backup: boolean) => void;
    /** A sentence for the confirm. */
    readonly summary: string;
    /** The install replaces the world with no copy kept. */
    readonly destructive: boolean;
    /** How to use a world installed alongside. */
    readonly levelHint: string;
}

export interface WorldDrawerModel {
    readonly header: ContentHeader;
    readonly versions: readonly ContentVersionItem[];
    readonly loading: boolean;
    readonly error: string | null;
    readonly retry: () => void;
    readonly selected: string | null;
    readonly select: (id: string) => void;
    readonly install: () => Promise<void>;
    readonly close: () => void;
}

export interface WorldsModel extends ContentBrowse {
    readonly options: WorldOptionsModel;
    readonly drawer: WorldDrawerModel | null;
    readonly importer: ImporterModel;
}

export interface MaintenanceModel {
    readonly reinstall: { readonly pending: boolean; readonly run: () => Promise<void> };
    readonly clear: {
        /** The server's name, which the user types to confirm. */
        readonly serverName: string;
        readonly matches: (typed: string) => boolean;
        /** The server is on, so its files cannot be cleared. */
        readonly serverRunning: boolean;
        readonly canStop: boolean;
        readonly stopping: boolean;
        readonly stop: () => Promise<void>;
        readonly keepWorlds: boolean;
        readonly setKeepWorlds: (keep: boolean) => void;
        readonly pending: boolean;
        readonly run: (typed: string) => Promise<void>;
    };
}

export interface ServerSoftwareModel {
    readonly loading: boolean;
    readonly error: { readonly kind: 'unsupported' | 'other'; readonly message: string } | null;
    readonly retry: () => void;
    /** The user may change the server's software and content; without it every write control is hidden. */
    readonly canManage: boolean;
    /** Only the server's owner may convert its egg. */
    readonly canConvert: boolean;
    readonly tab: SoftwareTab;
    readonly setTab: (tab: SoftwareTab) => void;
    /** An install is running, so another cannot start. */
    readonly busy: boolean;
    readonly header: SoftwareHeaderModel;
    /** The console, which shows the live install log. */
    readonly consoleDestination: CorePanelDestination;
    readonly type: SoftwareTypeModel;
    readonly modpacks: ModpacksModel;
    readonly worlds: WorldsModel;
    readonly maintenance: MaintenanceModel;
}

declare module '../registry' {
    interface ViewModels {
        'page.server.software': SoftwarePageModel;
        'server.software': ServerSoftwareModel;
    }
}
