import { WORKLOAD_LABELS, type WorkloadProfile } from './workload';

export type DashboardGroup = 'none' | 'node' | 'game' | 'tag';
export type DashboardStatusFilter = 'all' | 'running' | 'offline' | 'suspended';

export const DASHBOARD_GROUPS: readonly DashboardGroup[] = ['none', 'node', 'game', 'tag'];
export const DASHBOARD_STATUS_FILTERS: readonly DashboardStatusFilter[] = ['all', 'running', 'offline', 'suspended'];

export const GROUP_LABELS = {
    none: 'No grouping',
    node: 'Node',
    game: 'Game',
    tag: 'Tag',
} as const satisfies Record<DashboardGroup, string>;

export const STATUS_FILTER_LABELS = {
    all: 'All',
    running: 'Running',
    offline: 'Offline',
    suspended: 'Suspended',
} as const satisfies Record<DashboardStatusFilter, string>;

/** What a user chose on the dashboard; stored on the backend per user. */
export interface DashboardPreferences {
    /** UUIDs of the pinned servers. */
    readonly pinned: readonly string[];
    readonly group: DashboardGroup;
    readonly status: DashboardStatusFilter;
}

export const DEFAULT_DASHBOARD_PREFERENCES: DashboardPreferences = {
    pinned: [],
    group: 'none',
    status: 'all',
};

const oneOf = <T extends string>(options: readonly T[], value: string | undefined, fallback: T): T =>
    options.find((option) => option === value) ?? fallback;

/** What the backend returns: the strings are checked against the known options before use. */
export interface RawDashboardPreferences {
    pinned?: readonly string[];
    group?: string;
    status?: string;
}

/** Anything the backend returned, made safe: unknown values fall back to the defaults. */
export function normalizePreferences(raw: RawDashboardPreferences | undefined): DashboardPreferences {
    const { pinned, group, status } = raw ?? {};

    return {
        pinned: pinned ? [...pinned] : [],
        group: oneOf(DASHBOARD_GROUPS, group, DEFAULT_DASHBOARD_PREFERENCES.group),
        status: oneOf(DASHBOARD_STATUS_FILTERS, status, DEFAULT_DASHBOARD_PREFERENCES.status),
    };
}

/** The part of a server the list needs to filter, group and order it. */
export interface Listable {
    readonly uuid: string;
    readonly name: string;
    readonly workload: WorkloadProfile;
    readonly node: string;
    readonly tags: readonly string[];
    /** `running`, `offline` and `suspended` as the status filter knows them; `null` for the rest (starting, loading...). */
    readonly status: Exclude<DashboardStatusFilter, 'all'> | null;
}

export function filterByStatus<T extends Listable>(items: readonly T[], filter: DashboardStatusFilter): T[] {
    return filter === 'all' ? [...items] : items.filter((item) => item.status === filter);
}

/** Counts per status filter, for the chips. */
export function countByStatus(items: readonly Listable[]) {
    const counts = { all: items.length, running: 0, offline: 0, suspended: 0 };

    for (const { status } of items) {
        if (status) {
            counts[status] += 1;
        }
    }

    return counts;
}

/** Pinned servers first; each half keeps its incoming order. */
export function pinFirst<T extends { readonly uuid: string }>(items: readonly T[], pinned: readonly string[]): T[] {
    const set = new Set(pinned);

    return [...items.filter((item) => set.has(item.uuid)), ...items.filter((item) => !set.has(item.uuid))];
}

export interface ListGroup<T> {
    readonly key: string;
    readonly label: string;
    readonly items: T[];
}

const titleCase = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);
const UNGROUPED = '__none__';
const OTHER = '__other__';

/** The keys of the groups `item` belongs to: a server with several tags appears under each. */
function groupKeys(item: Listable, group: DashboardGroup): { key: string; label: string }[] {
    switch (group) {
        case 'node':
            return [{ key: item.node, label: item.node }];
        case 'game':
            return [{ key: item.workload, label: WORKLOAD_LABELS[item.workload] }];
        case 'tag':
            return item.tags.length > 0
                ? item.tags.map((tag) => ({ key: tag, label: titleCase(tag) }))
                : [{ key: OTHER, label: 'Untagged' }];
        case 'none':
            return [{ key: UNGROUPED, label: '' }];
    }
}

/**
 * Splits `items` into groups, pinned servers first inside each. Groups are alphabetical by label with
 * the untagged group last. Grouping by `none` yields one group with an empty label.
 */
export function groupServers<T extends Listable>(
    items: readonly T[],
    group: DashboardGroup,
    pinned: readonly string[]
): ListGroup<T>[] {
    const groups = new Map<string, ListGroup<T>>();

    for (const item of items) {
        for (const { key, label } of groupKeys(item, group)) {
            const existing = groups.get(key);

            if (existing) {
                existing.items.push(item);
            } else {
                groups.set(key, { key, label, items: [item] });
            }
        }
    }

    const rank = (key: string) => (key === OTHER ? 1 : 0);

    return [...groups.values()]
        .map((entry): ListGroup<T> => Object.assign(entry, { items: pinFirst(entry.items, pinned) }))
        .sort((a, b) => rank(a.key) - rank(b.key) || a.label.localeCompare(b.label));
}

/** Pins `uuid` when it is not pinned, else unpins it. */
export const togglePinned = (pinned: readonly string[], uuid: string): string[] =>
    pinned.includes(uuid) ? pinned.filter((entry) => entry !== uuid) : [...pinned, uuid];

export type BulkSignal = 'start' | 'stop' | 'restart';

/** What a bulk action may do to a server: the user needs the permission, and the server must be reachable. */
export function canBulk(
    signal: BulkSignal,
    item: { readonly permissions: Readonly<Record<BulkSignal, boolean>>; readonly status: Listable['status'] }
): boolean {
    if (!item.permissions[signal] || item.status === 'suspended') {
        return false;
    }

    // A running server cannot start; an offline one cannot stop or restart.
    if (signal === 'start') {
        return item.status !== 'running';
    }

    return item.status === 'running';
}

export interface BulkResult {
    readonly uuid: string;
    readonly name: string;
    readonly ok: boolean;
    /** Why it failed, or why the server was skipped. */
    readonly message?: string;
}

export interface BulkTarget {
    readonly uuid: string;
    readonly name: string;
    readonly allowed: boolean;
}

/**
 * Runs `send` for every selected server that `allowed` it, one at a time so Wings is not flooded, and
 * reports each server on its own: one failure never stops the others.
 */
export async function runBulk(
    targets: readonly BulkTarget[],
    send: (uuid: string) => Promise<unknown>,
    onProgress?: (results: readonly BulkResult[]) => void
): Promise<BulkResult[]> {
    const results: BulkResult[] = [];

    for (const { uuid, name, allowed } of targets) {
        if (allowed) {
            try {
                // One at a time on purpose, so Wings is not flooded.
                // oxlint-disable-next-line no-await-in-loop
                await send(uuid);
                results.push({ uuid, name, ok: true });
            } catch (error) {
                results.push({
                    uuid,
                    name,
                    ok: false,
                    message: error instanceof Error && error.message ? error.message : 'The request failed.',
                });
            }
        } else {
            results.push({ uuid, name, ok: false, message: 'Skipped: not allowed in its current state.' });
        }

        onProgress?.([...results]);
    }

    return results;
}
