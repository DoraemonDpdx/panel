import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useCurrentUser, useHasAdminPermission } from '@/api/account/queries';
import {
    serverResourceUsageQueryOptions,
    serverResourceUsageRefetchInterval,
    useAccountServers,
    useServerResourceUsage,
    type ClientStatsAttributes,
} from '@/api/account/servers/queries';
import { useDashboardPreferences, useUpdateDashboardPreferences } from '@/api/account/dashboardPreferences';
import {
    sendPowerActionInput,
    sendPowerActionQuiet,
    useSendPowerAction,
    type ServerPowerSignal,
} from '@/api/server/power/queries';
import { selectServerPermissions } from '@/api/server/queries';
import type { Server } from '@/api/server/types';
import { relationshipData } from '@/api/relationships';
import { ip, mbToBytes } from '@/lib/formatters';
import { hasPermission } from '@/plugins/usePermissions';
import { getPageSearch, useDashboardSearch } from '@/router/pageSearch';
import { createTestServer, createTestServerCard } from './fixtures';
import { pageStatus, pageStatusFixtures, type PageStatusModel } from './pageStatus';
import { implementViews, modelFromInput } from './registry';
import {
    runState,
    serverConflict,
    statMetric,
    type ServerConflict,
    type ServerRunState,
    type ServerStatMetric,
} from './server/state';
import {
    canBulk,
    countByStatus,
    filterByStatus,
    groupServers,
    runBulk,
    togglePinned,
    type BulkResult,
    type BulkSignal,
    type DashboardGroup,
    type DashboardStatusFilter,
    type ListGroup,
    type Listable,
} from './dashboardList';
import { filterByWorkload, presentWorkloads, serverWorkload, type WorkloadProfile } from './workload';

/** Why a server's card shows a notice instead of its usage: a conflict, or Wings cannot be reached. */
export type ServerUnavailableReason = ServerConflict | 'connection-error' | 'unavailable';
export type ServerCardState =
    | { readonly kind: 'loading' }
    | { readonly kind: 'unavailable'; readonly reason: ServerUnavailableReason }
    | {
          readonly kind: 'ready';
          readonly power: ServerRunState;
          /** Percent of one core. */
          readonly cpu: ServerStatMetric;
          /** Bytes. */
          readonly memory: ServerStatMetric;
          /** Bytes. */
          readonly disk: ServerStatMetric;
      };
/** What the user may do with the server, by their subuser permissions. */
export interface ServerCardPermissions {
    readonly start: boolean;
    readonly stop: boolean;
    readonly restart: boolean;
    readonly console: boolean;
}
export interface ServerCardModel {
    readonly identifier: string;
    readonly uuid: string;
    readonly name: string;
    readonly description: string | null;
    /** What the server's egg runs. */
    readonly workload: WorkloadProfile;
    readonly address: string | null;
    /** The node's name. */
    readonly node: string;
    /** The slugs of the egg's tags. */
    readonly tags: readonly string[];
    readonly state: ServerCardState;
    readonly permissions: ServerCardPermissions;
    /** The user pinned the server. */
    readonly pinned: boolean;
    /** Changes whenever a fresh usage reading arrives, so a sparkline can tell a new sample from a re-render. */
    readonly sample: unknown;
    /** Send a power signal through the client API, with no console connection; the panel reports a failure. */
    readonly actions: {
        readonly start: () => void;
        readonly stop: () => void;
        readonly restart: () => void;
        readonly togglePin: () => void;
    };
    /** A power signal is on its way. */
    readonly sending: boolean;
}

/** Whose servers the dashboard lists; only root admins can list other users' servers. */
export type DashboardScope = 'mine' | 'others';
/** A server of the list: its card's model, with the server as the API returns it for the row slots and the card. */
export interface ServerListItem extends ServerCardModel {
    readonly server: Server;
}
export interface ServerListPagination {
    readonly total: number;
    readonly count: number;
    readonly perPage: number;
    readonly currentPage: number;
    readonly totalPages: number;
}
export interface ServerListTotals {
    /** Servers on every page, from the pagination; 0 until the first page loads. */
    readonly servers: number;
    /** Running servers on the loaded page only. */
    readonly runningOnPage: number;
    /** Offline servers on the loaded page only; unavailable and loading servers are neither. */
    readonly offlineOnPage: number;
}
/** `all`, or one workload profile of the list. */
export type WorkloadFilter = WorkloadProfile | 'all';
/** The outcome of a bulk power action, per server. */
export interface BulkState {
    readonly signal: BulkSignal | null;
    readonly running: boolean;
    readonly results: readonly BulkResult[];
}
export interface ServerListModel {
    /** The servers of the page that pass the type and status filters, pinned first. */
    readonly servers: readonly ServerListItem[];
    /** `servers` split by `group`; a single unlabelled group when not grouping. */
    readonly groups: readonly ListGroup<ServerListItem>[];
    readonly group: DashboardGroup;
    readonly statusFilter: DashboardStatusFilter;
    /** Servers of the page per status chip. */
    readonly statusCounts: Readonly<Record<DashboardStatusFilter, number>>;
    /** UUIDs of the selected servers. */
    readonly selection: ReadonlySet<string>;
    readonly bulk: BulkState;
    /** The account owns none of the servers on the page, so it only has subuser access. */
    readonly subuserOnly: boolean;
    /** The profiles present on the page, for the type filter row; a single one needs no filter. */
    readonly workloads: readonly WorkloadProfile[];
    readonly workloadFilter: WorkloadFilter;
    readonly totals: ServerListTotals;
    /** The page has not loaded yet. */
    readonly loading: boolean;
    readonly pagination: ServerListPagination | null;
    readonly scope: DashboardScope;
    readonly canViewOthers: boolean;
    readonly canCreateServers: boolean;
    readonly actions: {
        readonly setPage: (page: number) => void;
        readonly setScope: (scope: DashboardScope) => void;
        readonly setWorkloadFilter: (filter: WorkloadFilter) => void;
        readonly setGroup: (group: DashboardGroup) => void;
        readonly setStatusFilter: (filter: DashboardStatusFilter) => void;
        readonly toggleSelected: (uuid: string) => void;
        readonly selectAll: () => void;
        readonly clearSelection: () => void;
        /** Sends `signal` to every selected server that may take it, and records each server's result. */
        readonly runBulk: (signal: BulkSignal) => Promise<void>;
        readonly dismissBulk: () => void;
    };
}

declare module './registry' {
    interface ViewModels {
        'page.dashboard': PageStatusModel;
        'dashboard.serverList': ServerListModel;
        'dashboard.serverCard': ServerCardModel;
        'dashboard.serverCard.identity': ServerCardModel;
        'dashboard.serverCard.address': ServerCardModel;
        'dashboard.serverCard.metrics': ServerCardModel;
    }
    interface ViewInputs {
        'dashboard.serverCard': { readonly server: Server };
        'dashboard.serverCard.identity': { readonly model: ServerCardModel; readonly server: Server };
        'dashboard.serverCard.address': { readonly model: ServerCardModel; readonly server: Server };
        'dashboard.serverCard.metrics': { readonly model: ServerCardModel; readonly server: Server };
    }
}

function useServerListQuery() {
    const { page, type } = useDashboardSearch();
    const { rootAdmin } = useCurrentUser();
    const scope: DashboardScope = rootAdmin && type === 'admin' ? 'others' : 'mine';

    return { query: useAccountServers({ page, type: scope === 'others' ? 'admin' : undefined }), scope, rootAdmin };
}

const useDashboardModel = () => pageStatus(useServerListQuery().query);

const tracksResources = ({ attributes }: Server): boolean =>
    attributes.status !== 'suspended' && !attributes.is_node_under_maintenance && attributes.uuid.length > 0;

function resolveState(server: Server, stats: ClientStatsAttributes | undefined): ServerCardState {
    const { attributes } = server;

    if (stats?.is_suspended || attributes.status === 'suspended') {
        return { kind: 'unavailable', reason: attributes.status === 'suspended' ? 'suspended' : 'connection-error' };
    }

    if (attributes.is_node_under_maintenance) {
        return { kind: 'unavailable', reason: 'maintenance' };
    }

    if (stats) {
        const { limits } = attributes;

        return {
            kind: 'ready',
            power: runState(stats.current_state),
            cpu: statMetric(stats.resources.cpu_absolute, limits.cpu),
            memory: statMetric(stats.resources.memory_bytes, mbToBytes(limits.memory)),
            disk: statMetric(stats.resources.disk_bytes, mbToBytes(limits.disk)),
        };
    }

    if (attributes.is_transferring) {
        return { kind: 'unavailable', reason: 'transferring' };
    }

    if (attributes.status === 'installing') {
        return { kind: 'unavailable', reason: 'installing' };
    }

    if (attributes.status === 'restoring_backup') {
        return { kind: 'unavailable', reason: 'restoring-backup' };
    }

    return attributes.status ? { kind: 'unavailable', reason: 'unavailable' } : { kind: 'loading' };
}

function cardPermissions(server: Server, rootAdmin = false): ServerCardPermissions {
    // List responses carry no per-server meta; owners and root admins may use every power action.
    const granted =
        server.meta || !(server.attributes.server_owner || rootAdmin) ? selectServerPermissions(server) : ['*'];

    return {
        start: hasPermission(granted, 'control.start'),
        stop: hasPermission(granted, 'control.stop'),
        restart: hasPermission(granted, 'control.restart'),
        console: hasPermission(granted, 'control.console'),
    };
}

const primaryAddress = ({ attributes }: Server): string | null =>
    relationshipData(attributes.relationships?.allocations)
        .filter((allocation) => allocation.attributes.is_default)
        .map(({ attributes: allocation }) => `${allocation.ip_alias || ip(allocation.ip)}:${allocation.port}`)
        .join('') || null;

interface PowerSender {
    send(uuid: string, signal: ServerPowerSignal): void;
    /** Sends a signal and rejects on failure, with no toast, so a caller can report each server itself. */
    sendQuiet(uuid: string, signal: ServerPowerSignal): Promise<unknown>;
    /** The server a signal is on its way to. */
    readonly sending: string | null;
}

/** Sends power signals through the client API and refreshes the server's usage once Wings accepts one. */
function usePowerSender(): PowerSender {
    const queryClient = useQueryClient();
    const { mutate, isPending, variables } = useSendPowerAction();

    return useMemo(
        () => ({
            send: (uuid, signal) =>
                mutate(sendPowerActionInput(uuid, signal), {
                    onSuccess: () =>
                        void queryClient.invalidateQueries({
                            queryKey: serverResourceUsageQueryOptions(uuid).queryKey,
                        }),
                }),
            sendQuiet: async (uuid, signal) => {
                await sendPowerActionQuiet(uuid, signal);
                void queryClient.invalidateQueries({ queryKey: serverResourceUsageQueryOptions(uuid).queryKey });
            },
            sending: isPending ? (variables?.path.server_uuid ?? null) : null,
        }),
        [mutate, isPending, variables, queryClient]
    );
}

function cardModel(
    server: Server,
    stats: ClientStatsAttributes | undefined,
    power: PowerSender,
    rootAdmin: boolean,
    pinned = false,
    togglePin: () => void = () => {}
): ServerCardModel {
    const { identifier, uuid, name, description } = server.attributes;
    const send = (signal: ServerPowerSignal) => () => power.send(uuid, signal);

    return {
        identifier,
        uuid,
        name,
        description,
        workload: serverWorkload(server),
        address: primaryAddress(server),
        node: server.attributes.node,
        tags: server.attributes.egg_tags ?? [],
        state: resolveState(server, stats),
        permissions: cardPermissions(server, rootAdmin),
        pinned,
        sample: stats,
        actions: { start: send('start'), stop: send('stop'), restart: send('restart'), togglePin },
        sending: power.sending === uuid,
    };
}

const usageOf = (results: { data?: { attributes: ClientStatsAttributes } }[]) =>
    results.map((result) => result.data?.attributes);

const countPower = (items: readonly ServerListItem[], power: ServerRunState): number =>
    items.filter(({ state }) => state.kind === 'ready' && state.power === power).length;

/** The status chip a card belongs to; starting, stopping and loading servers are under `All` only. */
function listStatus({ state }: ServerCardModel): Listable['status'] {
    if (state.kind === 'unavailable') {
        return state.reason === 'suspended' ? 'suspended' : null;
    }

    return state.kind === 'ready' && (state.power === 'running' || state.power === 'offline') ? state.power : null;
}

const NO_SELECTION: ReadonlySet<string> = new Set();
const NO_BULK: BulkState = { signal: null, running: false, results: [] };

function useServerListModel(): ServerListModel {
    const navigate = useNavigate();
    const { query, scope, rootAdmin } = useServerListQuery();
    const canCreateServers = useHasAdminPermission('admin:servers.create');
    const servers = query.data;
    const power = usePowerSender();
    // The same cache entries as the cards' own queries, so a card and its row never poll twice.
    const usage = useQueries({
        queries: (servers?.data ?? []).map((server) =>
            Object.assign(serverResourceUsageQueryOptions(server.attributes.uuid), {
                enabled: tracksResources(server),
                refetchInterval: serverResourceUsageRefetchInterval,
            })
        ),
        combine: usageOf,
    });
    const type = scope === 'others' ? 'admin' : undefined;
    const [selectedFilter, setWorkloadFilter] = useState<WorkloadFilter>('all');
    const preferences = useDashboardPreferences();
    const { mutate: savePreferences } = useUpdateDashboardPreferences();
    const [selected, setSelected] = useState<ReadonlySet<string>>(NO_SELECTION);
    const [bulk, setBulk] = useState<BulkState>(NO_BULK);
    const dismissBulk = useCallback(() => setBulk(NO_BULK), []);

    useEffect(() => {
        if (servers && servers.meta.pagination.current_page > 1 && !servers.data.length) {
            void navigate({ to: '/', search: type ? { type } : {}, replace: true, viewTransition: false });
        }
    }, [navigate, type, servers]);

    return useMemo(() => {
        const pagination = servers?.meta.pagination;
        const items = (servers?.data ?? []).map((server, index) => {
            const { uuid } = server.attributes;
            const card = cardModel(server, usage[index], power, rootAdmin, preferences.pinned.includes(uuid), () =>
                savePreferences({ pinned: togglePinned(preferences.pinned, uuid) })
            );

            return Object.assign(card, { server, status: listStatus(card) });
        });

        const workloads = presentWorkloads(items.map((item) => item.workload));
        // A filter whose profile is no longer on the page (another page, another scope) shows everything.
        const workloadFilter = workloads.includes(selectedFilter as WorkloadProfile) ? selectedFilter : 'all';

        const typed = filterByWorkload(items, workloadFilter);
        const shown = filterByStatus(typed, preferences.status);
        const groups = groupServers(shown, preferences.group, preferences.pinned);
        const ordered = groups.length === 1 ? groups[0].items : groups.flatMap((entry) => entry.items);
        const shownIds = new Set(shown.map((item) => item.uuid));
        const selection = new Set([...selected].filter((uuid) => shownIds.has(uuid)));

        return {
            servers: ordered,
            groups,
            group: preferences.group,
            statusFilter: preferences.status,
            statusCounts: countByStatus(typed),
            selection,
            bulk,
            subuserOnly:
                scope === 'mine' && items.length > 0 && items.every((item) => !item.server.attributes.server_owner),
            workloads,
            workloadFilter,
            totals: {
                servers: pagination?.total ?? 0,
                runningOnPage: countPower(items, 'running'),
                offlineOnPage: countPower(items, 'offline'),
            },
            loading: !servers,
            pagination: pagination
                ? {
                      total: pagination.total,
                      count: pagination.count,
                      perPage: pagination.per_page,
                      currentPage: pagination.current_page,
                      totalPages: pagination.total_pages,
                  }
                : null,
            scope,
            canViewOthers: rootAdmin,
            canCreateServers,
            actions: {
                setWorkloadFilter,
                setGroup: (group: DashboardGroup) => savePreferences({ group }),
                setStatusFilter: (status: DashboardStatusFilter) => savePreferences({ status }),
                toggleSelected: (uuid: string) =>
                    setSelected((current) => {
                        const next = new Set(current);

                        if (!next.delete(uuid)) {
                            next.add(uuid);
                        }

                        return next;
                    }),
                selectAll: () => setSelected(new Set(shown.map((item) => item.uuid))),
                clearSelection: () => setSelected(NO_SELECTION),
                dismissBulk,
                runBulk: async (signal: BulkSignal) => {
                    const targets = shown
                        .filter((item) => selection.has(item.uuid))
                        .map((item) => ({ uuid: item.uuid, name: item.name, allowed: canBulk(signal, item) }));

                    setBulk({ signal, running: true, results: [] });

                    const results = await runBulk(
                        targets,
                        (uuid) => power.sendQuiet(uuid, signal),
                        (partial) => setBulk({ signal, running: true, results: partial })
                    );

                    setBulk({ signal, running: false, results });
                    setSelected(NO_SELECTION);
                },
                setPage: (page: number) =>
                    void navigate({
                        to: '/',
                        search: type ? { ...getPageSearch(page), type } : getPageSearch(page),
                        replace: true,
                        viewTransition: false,
                    }),
                setScope: (next: DashboardScope) =>
                    void navigate({
                        to: '/',
                        search: next === 'others' ? { type: 'admin' } : {},
                        replace: true,
                        viewTransition: false,
                    }),
            },
        };
    }, [
        servers,
        usage,
        power,
        scope,
        rootAdmin,
        canCreateServers,
        type,
        navigate,
        selectedFilter,
        preferences,
        savePreferences,
        selected,
        bulk,
        dismissBulk,
    ]);
}

function useServerCardModel({ server }: { readonly server: Server }): ServerCardModel {
    const stats = useServerResourceUsage(server.attributes.uuid, tracksResources(server)).data?.attributes;
    const power = usePowerSender();
    const rootAdmin = useCurrentUser().rootAdmin;
    const preferences = useDashboardPreferences();
    const { mutate: savePreferences } = useUpdateDashboardPreferences();
    const { uuid } = server.attributes;

    return useMemo(
        () =>
            cardModel(server, stats, power, rootAdmin, preferences.pinned.includes(uuid), () =>
                savePreferences({ pinned: togglePinned(preferences.pinned, uuid) })
            ),
        [server, stats, power, rootAdmin, preferences, uuid, savePreferences]
    );
}

/** The cards of the list fixtures' rows, so a card placed in a row shows that row's state. */
const listedCards = new Map<string, ServerCardModel>();

/** A card for a fixture server: its row's, else its conflict when it has one, else running. */
function cardFromServer(server: Server): ServerCardModel {
    const listed = listedCards.get(server.attributes.uuid);

    if (listed) {
        return listed;
    }

    const conflict = serverConflict(server);
    const card = createTestServerCard({
        identifier: server.attributes.identifier,
        uuid: server.attributes.uuid,
        name: server.attributes.name,
        description: server.attributes.description,
        workload: serverWorkload(server),
        permissions: cardPermissions(server),
    });

    return conflict ? { ...card, state: { kind: 'unavailable', reason: conflict } } : card;
}

const noop = () => {};

const offline: ServerCardState = {
    kind: 'ready',
    power: 'offline',
    cpu: statMetric(0, 100),
    memory: statMetric(0, 1024 ** 3),
    disk: statMetric(800 * 1024 ** 2, 2048 * 1024 ** 2),
};

const listFixture = (
    servers: readonly (readonly [Server, ServerCardState?])[],
    options: Partial<ServerListModel> = {}
): ServerListModel => {
    const items = servers.map(([server, state]) => {
        const derived = cardFromServer(server);
        const card = state ? { ...derived, state } : derived;

        listedCards.set(server.attributes.uuid, card);

        return { ...card, server };
    });

    return {
        servers: items,
        groups: [{ key: '__none__', label: '', items }],
        group: 'none',
        statusFilter: 'all',
        statusCounts: countByStatus(items.map((item) => ({ ...item, status: listStatus(item) }))),
        selection: new Set<string>(),
        bulk: NO_BULK,
        subuserOnly: false,
        workloads: presentWorkloads(items.map((item) => item.workload)),
        workloadFilter: 'all',
        totals: {
            servers: items.length,
            runningOnPage: countPower(items, 'running'),
            offlineOnPage: countPower(items, 'offline'),
        },
        loading: false,
        pagination: { total: items.length, count: items.length, perPage: 50, currentPage: 1, totalPages: 1 },
        scope: 'mine',
        canViewOthers: true,
        canCreateServers: true,
        actions: {
            setPage: noop,
            setScope: noop,
            setWorkloadFilter: noop,
            setGroup: noop,
            setStatusFilter: noop,
            toggleSelected: noop,
            selectAll: noop,
            clearSelection: noop,
            runBulk: () => Promise.resolve(),
            dismissBulk: noop,
        },
        ...options,
    };
};

implementViews({
    'page.dashboard': {
        use: useDashboardModel,
        fixtures: pageStatusFixtures,
    },
    'dashboard.serverList': {
        use: useServerListModel,
        fixtures: {
            servers: () =>
                listFixture([
                    [
                        createTestServer({
                            identifier: 'a1b2c3d4',
                            uuid: 'a1b2c3d4-0000-4000-8000-000000000001',
                            name: 'Survival',
                            workloadProfile: 'game',
                        }),
                    ],
                    [
                        createTestServer({
                            identifier: 'e5f6a7b8',
                            uuid: 'e5f6a7b8-0000-4000-8000-000000000002',
                            name: 'Creative',
                            workloadProfile: 'game',
                        }),
                        offline,
                    ],
                    [
                        createTestServer({
                            identifier: 'c9d0e1f2',
                            uuid: 'c9d0e1f2-0000-4000-8000-000000000003',
                            name: 'Lobby',
                            workloadProfile: 'bot',
                            status: 'suspended',
                        }),
                    ],
                ]),
            empty: () => listFixture([], { canViewOthers: false, canCreateServers: false }),
            loading: () => listFixture([], { loading: true, pagination: null }),
        },
    },
    'dashboard.serverCard': {
        use: useServerCardModel,
        fixtureInput: (card) => ({
            server: createTestServer({
                identifier: card.identifier,
                uuid: card.uuid,
                name: card.name,
                workloadProfile: card.workload,
            }),
        }),
        fixtureFromInput: ({ server }) => cardFromServer(server),
        fixtures: {
            running: () => createTestServerCard(),
            offline: () =>
                createTestServerCard({
                    state: {
                        kind: 'ready',
                        power: 'offline',
                        cpu: statMetric(0, 0),
                        memory: statMetric(0, 0),
                        disk: statMetric(512 * 1024 ** 2, 0),
                    },
                }),
            suspended: () => createTestServerCard({ state: { kind: 'unavailable', reason: 'suspended' } }),
            loading: () => createTestServerCard({ address: null, state: { kind: 'loading' } }),
        },
    },
    'dashboard.serverCard.identity': { use: modelFromInput },
    'dashboard.serverCard.address': { use: modelFromInput },
    'dashboard.serverCard.metrics': { use: modelFromInput },
});
