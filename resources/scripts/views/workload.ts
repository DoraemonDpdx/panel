import type { Server } from '@/api/server/types';

/** What a server's egg runs; the client UI shows only the tabs and widgets that fit it. */
export const WORKLOAD_PROFILES = ['game', 'bot', 'web', 'database', 'lavalink', 'generic'] as const;
export type WorkloadProfile = (typeof WORKLOAD_PROFILES)[number];

export const WORKLOAD_LABELS = {
    game: 'Game',
    bot: 'Bot',
    web: 'Web',
    database: 'Database',
    lavalink: 'Lavalink',
    generic: 'Other',
} as const satisfies Record<WorkloadProfile, string>;

/**
 * Which workloads something applies to. Leave it out to apply to every workload. `generic` servers
 * always get everything, so a tab can never vanish for an egg nobody has classified.
 */
export type WorkloadScope = readonly WorkloadProfile[] | undefined;

/** The server's workload; an older API response or an unknown value is `generic`. */
export function serverWorkload(server: Server | undefined): WorkloadProfile {
    return WORKLOAD_PROFILES.find((profile) => profile === server?.attributes.workload_profile) ?? 'generic';
}

export function appliesToWorkload(scope: WorkloadScope, workload: WorkloadProfile): boolean {
    return scope === undefined || workload === 'generic' || scope.includes(workload);
}

/** The profiles in use among `workloads`, in the order of `WORKLOAD_PROFILES`. */
export function presentWorkloads(workloads: readonly WorkloadProfile[]): WorkloadProfile[] {
    const present = new Set(workloads);

    return WORKLOAD_PROFILES.filter((profile) => present.has(profile));
}

/** `filter` of `all` keeps everything. */
export function filterByWorkload<T extends { readonly workload: WorkloadProfile }>(
    items: readonly T[],
    filter: WorkloadProfile | 'all'
): T[] {
    return filter === 'all' ? [...items] : items.filter((item) => item.workload === filter);
}
