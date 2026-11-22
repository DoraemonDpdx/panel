import type {
    InstallOperationStatus,
    ModProjectType,
    ModProviderName,
    ModSide,
    ModSort,
    ModsError,
    PrismMatch,
} from '@/api/server/mods/types';
import type { PanelDestination } from '@/sdk/navigation';
import type { PageStatusModel } from '../pageStatus';

/** A failure of the mods API, told apart by kind. */
export type ModsErrorView = ModsError;
export type ModsTab = 'installed' | 'browse' | 'import';
export type InstalledFilter = 'all' | 'enabled' | 'disabled';

/** The mods page: its status, and what the tab and the document are named. */
export interface ModsPageModel extends PageStatusModel {
    /** `Mods`, or `Plugins` on a plugin platform. */
    readonly title: string;
}

export interface ModsPlatformInfo {
    /** Whether the server can use mods or plugins at all. */
    readonly eligible: boolean;
    /** `mod` or `plugin`, as the tab is named. */
    readonly noun: ModProjectType;
    /** `Mods` or `Plugins`. */
    readonly title: string;
    /** The loader the server runs, such as `fabric`; null when it was not detected. */
    readonly detectedLoader: string | null;
    readonly detectedVersion: string | null;
    /** The server asks for the newest game version, which `detectedVersion` has resolved. */
    readonly versionIsLatest: boolean;
    readonly installDir: string | null;
    /** The sources the panel can search. */
    readonly providers: readonly ModProviderName[];
}

export interface ModResultItem {
    readonly projectId: string;
    readonly title: string;
    readonly description: string;
    readonly iconUrl: string | null;
    readonly downloads: number;
    readonly author: string;
    /** At most two. */
    readonly categories: readonly string[];
    /** When the project last changed, as an ISO date; null when the source does not say. */
    readonly updated: string | null;
    readonly installed: boolean;
    /** An install of this project is on its way. */
    readonly installing: boolean;
    readonly provider: ModProviderName;
    /** The project's page at its source. */
    readonly pageUrl: string | null;
    /** The file may be downloaded by the panel; when it may not, `pageUrl` is the way to get it. */
    readonly distributable: boolean;
    /** Only `unknown` is shown, as the "Unverified" badge. */
    readonly side: ModSide;
}

export interface InstalledModItem {
    /** The on-disk file name, which identifies the row. */
    readonly filename: string;
    readonly id: number | null;
    readonly projectId: string | null;
    /** The title, or the file name for a jar the panel did not install. */
    readonly title: string;
    readonly iconUrl: string | null;
    readonly version: string | null;
    readonly enabled: boolean;
    readonly tracked: boolean;
    /** The file is missing on disk; never set while the disk could not be read. */
    readonly missing: boolean;
    readonly update: { readonly versionId: string; readonly version: string } | null;
    /** Where the mod came from; null for untracked jars. */
    readonly provider: ModProviderName | null;
    /** The mod's page at its source; null for untracked jars. */
    readonly pageUrl: string | null;
    /** Another version can be chosen; untracked jars have no project to pick from. */
    readonly canChangeVersion: boolean;
    /** The file came from an installed modpack. */
    readonly fromModpack: boolean;
    readonly busy: boolean;
}

/** Whether a version runs on the server's game version, said in one line. */
export interface ModCompatibility {
    readonly tone: 'success' | 'warning' | 'neutral';
    /** `Works on 26.3` or `Built for 26.1–26.2`. */
    readonly label: string;
    /** Every game version the file lists. */
    readonly full: string;
}

export interface ModVersionItem {
    readonly id: string;
    readonly name: string;
    readonly number: string;
    /** `release`, `beta` or `alpha`. */
    readonly type: string;
    readonly published: string;
    readonly size: number;
    readonly compatibility: ModCompatibility;
    /** The version in place on the server. */
    readonly current: boolean;
    readonly distributable: boolean;
    readonly pageUrl: string | null;
}

export interface ModDependencyItem {
    readonly projectId: string;
    readonly versionId: string | null;
    readonly installed: boolean;
}

/** The project the drawer is about. */
export interface ModPickerHeader {
    readonly title: string;
    readonly iconUrl: string | null;
    readonly author: string | null;
    readonly description: string | null;
    readonly pageUrl: string | null;
}

/** The project's detail view, from the source. Everything in it is plain text or a checked https link. */
export interface ModProjectDetail {
    readonly loading: boolean;
    /** The long description as plain text; never HTML. Null when the source gave none. */
    readonly description: string | null;
    /** At most four, https only. */
    readonly gallery: readonly { readonly url: string; readonly title: string }[];
    readonly links: readonly { readonly label: string; readonly url: string }[];
}

/** What the version drawer is for: installing a result, or changing the version of an installed mod. */
export interface ModPicker {
    readonly mode: 'install' | 'change';
    readonly title: string;
    readonly header: ModPickerHeader;
    readonly detail: ModProjectDetail;
    readonly versions: readonly ModVersionItem[];
    /** The newest compatible version, which is preselected. */
    readonly preselected: string | null;
    readonly loading: boolean;
    readonly error: ModsError | null;
    readonly retry: () => void;
    /** Set when the file may not be installed by the panel: where to download it by hand. */
    readonly blocked: { readonly pageUrl: string | null } | null;
    readonly provider: ModProviderName;
    /** Required dependencies of the versions, listed by project. */
    readonly dependencies: (versionId: string) => readonly ModDependencyItem[];
}

export interface ModCategoryOption {
    readonly value: string;
    readonly label: string;
}

/** The result of pasting a link, as the card shows it. */
export interface ResolvedLinkItem {
    readonly kind: string;
    readonly provider: ModProviderName;
    readonly projectId: string;
    readonly title: string;
    readonly iconUrl: string | null;
    readonly compatible: boolean;
    /** Why it can't be installed; always set when `compatible` is false. */
    readonly reason: string | null;
    /** The link leads to a mod or plugin the install drawer can open. */
    readonly installable: boolean;
}

export interface PrismRow {
    readonly line: number;
    readonly name: string;
    readonly matched: {
        readonly title: string;
        readonly iconUrl: string | null;
        readonly provider: ModProviderName;
    } | null;
    readonly match: PrismMatch;
    readonly side: ModSide;
    /** Why the row can't be ticked. */
    readonly reason: string | null;
    readonly ticked: boolean;
    /** Client-only, unmatched and incompatible rows can never be ticked. */
    readonly selectable: boolean;
    readonly clientOnly: boolean;
}

/** The progress of a batch install, for the tray at the bottom of the page. */
export interface ModsTray {
    readonly status: InstallOperationStatus | 'unknown';
    readonly count: number;
    readonly error: string | null;
    readonly dismiss: () => void;
}

export interface ServerModsModel {
    readonly loading: boolean;
    /** The platform could not be read, or the server does not support mods. */
    readonly error: ModsError | null;
    readonly retry: () => void;
    readonly platform: ModsPlatformInfo;
    /** The server's identifier, for links to its other pages. */
    readonly serverId: string;
    /** The Software page, where the server type (and so the loader) changes. */
    readonly softwareDestination: PanelDestination;
    /** Software › Modpacks, where a `.mrpack` is imported. */
    readonly mrpackDestination: PanelDestination;
    readonly canInstall: boolean;
    /** The user may restart the server. */
    readonly canRestart: boolean;
    readonly tab: ModsTab;
    readonly setTab: (tab: ModsTab) => void;
    /** Changes take effect after a restart; set until the server restarts or the user dismisses it. */
    readonly restartNeeded: boolean;
    readonly dismissRestart: () => void;
    readonly filters: {
        /** The source being searched. */
        readonly provider: ModProviderName;
        readonly providers: readonly ModProviderName[];
        readonly setProvider: (provider: ModProviderName) => void;
        /** The loader the server runs. It is shown, never chosen: it changes on the Software page. */
        readonly loader: string | null;
        /** `Fabric`, for the note that says what mods are matched to. */
        readonly loaderLabel: string;
        readonly gameVersion: string | null;
        /** `Paper · 26.3`, with `(latest)` or `(custom)` after the version when either applies. */
        readonly chip: string;
        /** The user chose another loader or version than the detected ones. */
        readonly overridden: boolean;
        readonly reset: () => void;
        readonly sort: ModSort;
        readonly setGameVersion: (version: string | null) => void;
        readonly setSort: (sort: ModSort) => void;
        /** The category chip chosen, or null for all. */
        readonly category: string | null;
        readonly categories: readonly ModCategoryOption[];
        readonly setCategory: (category: string | null) => void;
    };
    readonly browse: {
        /** What the box holds; the search itself follows a moment later. */
        readonly query: string;
        readonly setQuery: (query: string) => void;
        readonly results: readonly ModResultItem[];
        readonly total: number;
        readonly loading: boolean;
        readonly loadingMore: boolean;
        readonly error: ModsError | null;
        /** The message to show for `error`, scoped to the source. */
        readonly errorMessage: string | null;
        readonly retry: () => void;
        readonly hasMore: boolean;
        readonly loadMore: () => void;
        /** `No results for 'xyz' on Modrinth for Paper · 26.3.` */
        readonly emptyMessage: string;
        /** The search ignores the game version. */
        readonly anyVersion: boolean;
        readonly searchAllVersions: () => void;
    };
    readonly installed: {
        readonly items: readonly InstalledModItem[];
        /** The rows before the filters. */
        readonly count: number;
        readonly loading: boolean;
        readonly error: ModsError | null;
        readonly retry: () => void;
        /** The node could not be asked which files are on disk. */
        readonly diskUnavailable: boolean;
        /** How many rows have an update. */
        readonly updatable: number;
        readonly status: InstalledFilter;
        readonly setStatus: (status: InstalledFilter) => void;
        readonly text: string;
        readonly setText: (text: string) => void;
    };
    readonly import: {
        readonly link: {
            readonly url: string;
            readonly setUrl: (url: string) => void;
            readonly resolving: boolean;
            /** Looks the link up; a modpack or world link leaves for the Software page. */
            readonly resolve: () => Promise<void>;
            readonly result: ResolvedLinkItem | null;
            readonly error: string | null;
            /** Opens the install drawer for the resolved mod or plugin. */
            readonly install: () => void;
            readonly clear: () => void;
        };
        readonly prism: {
            readonly text: string;
            readonly setText: (text: string) => void;
            /** Reads a list file in the browser into the text box. */
            readonly loadFile: (file: File) => Promise<void>;
            readonly previewing: boolean;
            readonly preview: () => Promise<void>;
            readonly error: string | null;
            /** Null until a preview has been made. */
            readonly rows: readonly PrismRow[] | null;
            readonly selectedCount: number;
            readonly total: number;
            readonly toggle: (line: number, ticked: boolean) => void;
            readonly selectAllCompatible: () => void;
            readonly installing: boolean;
            readonly install: () => Promise<void>;
            readonly clear: () => void;
        };
    };
    /** The batch install in progress or just finished; null otherwise. */
    readonly tray: ModsTray | null;
    readonly picker: (ModPicker & { readonly open: true }) | { readonly open: false };
    readonly actions: {
        readonly openInstall: (result: ModResultItem) => void;
        readonly openChange: (filename: string) => void;
        readonly closePicker: () => void;
        /** Closes the drawer, then installs the version, or switches the mod to it. */
        readonly chooseVersion: (versionId: string) => Promise<void>;
        /** Installs a required dependency; opens its versions when the dependency names none. */
        readonly installDependency: (dependency: ModDependencyItem) => Promise<void>;
        /** Shows an installed result's row in the Installed tab. */
        readonly manage: (title: string) => void;
        readonly update: (filename: string) => Promise<void>;
        readonly updateAll: () => Promise<void>;
        readonly toggle: (filename: string, enabled: boolean) => Promise<void>;
        /** Removes without a confirmation; ask the user first. */
        readonly remove: (filename: string) => Promise<void>;
        /** Forgets a file that is gone from disk. */
        readonly removeEntry: (filename: string) => Promise<void>;
        readonly restart: () => Promise<void>;
    };
}

declare module '../registry' {
    interface ViewModels {
        'page.server.mods': ModsPageModel;
        'server.mods': ServerModsModel;
    }
}
