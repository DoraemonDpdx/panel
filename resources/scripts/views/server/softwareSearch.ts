import { useSearch } from '@tanstack/react-router';
import type { ContentProvider } from '@/api/server/content/types';
import { isFiniteNumber, isString } from '@/lib/objects';
import type { SoftwareTab } from './softwareTypes';

/**
 * What the Mods page links here with: `?modpack=<project>` or `?world=<project>`, with the source as `provider`
 * (or as a `modrinth:<project>` prefix), and optionally `version`, `title` and `icon` for the drawer's header.
 */
export interface SoftwareSearch {
    modpack?: string;
    world?: string;
    provider?: ContentProvider;
    version?: string;
    title?: string;
    icon?: string;
    /** `modpacks` or `worlds`, to open that tab. */
    tab?: 'modpacks' | 'worlds';
}

type RawValue = string | number | boolean | null | undefined;

export interface RawSoftwareSearch {
    modpack?: RawValue;
    world?: RawValue;
    provider?: RawValue;
    version?: RawValue;
    title?: RawValue;
    icon?: RawValue;
    tab?: RawValue;
    import?: RawValue;
}

/** The text of a search value; the router parses `123` into a number. */
const text = (value: RawValue): string | undefined => {
    if (isString(value)) {
        return value.trim() || undefined;
    }

    return isFiniteNumber(value) ? String(value) : undefined;
};

const providerOf = (value: RawValue): ContentProvider | undefined =>
    value === 'modrinth' || value === 'curseforge' ? value : undefined;

const split = (value: string | undefined): { provider?: ContentProvider; id: string } | undefined => {
    if (value === undefined) {
        return undefined;
    }

    const [head, ...rest] = value.split(':');
    const provider = providerOf(head);

    return provider && rest.length > 0 ? { provider, id: rest.join(':') } : { id: value };
};

export const parseSoftwareSearch = (search: RawSoftwareSearch): SoftwareSearch => {
    const result: SoftwareSearch = {};
    const modpack = split(text(search.modpack));
    const world = split(text(search.world));
    const provider = providerOf(search.provider) ?? modpack?.provider ?? world?.provider;
    const version = text(search.version);
    const title = text(search.title);
    const icon = text(search.icon);

    if (modpack) {
        result.modpack = modpack.id;
    } else if (world) {
        result.world = world.id;
    }

    if (provider) {
        result.provider = provider;
    }

    if (version) {
        result.version = version;
    }

    if (title) {
        result.title = title;
    }

    const tab = text(search.tab);

    if (tab === 'modpacks' || tab === 'worlds') {
        result.tab = tab;
    } else if (text(search.import) === 'mrpack') {
        result.tab = 'modpacks';
    }

    if (icon?.startsWith('https://')) {
        result.icon = icon;
    }

    return result;
};

export interface PreselectedItem {
    readonly kind: 'modpack' | 'world';
    readonly provider: ContentProvider;
    readonly projectId: string;
    readonly versionId: string | null;
    readonly title: string | null;
    readonly iconUrl: string | null;
}

/** The item a link names, or null. Worlds come from CurseForge, and modpacks default to Modrinth. */
export const preselected = (search: SoftwareSearch): PreselectedItem | null => {
    const projectId = search.modpack ?? search.world;

    if (projectId === undefined) {
        return null;
    }

    const kind = search.modpack === undefined ? 'world' : 'modpack';

    return {
        kind,
        provider: kind === 'world' ? 'curseforge' : (search.provider ?? 'modrinth'),
        projectId,
        versionId: search.version ?? null,
        title: search.title ?? null,
        iconUrl: search.icon ?? null,
    };
};

export const tabOf = (item: PreselectedItem | null, search?: SoftwareSearch): SoftwareTab | null => {
    if (item === null) {
        return search?.tab ?? null;
    }

    return item.kind === 'modpack' ? 'modpacks' : 'worlds';
};

export const useSoftwareSearch = (): SoftwareSearch => parseSoftwareSearch(useSearch({ strict: false }));
