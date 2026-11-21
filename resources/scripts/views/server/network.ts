import { useMemo } from 'react';
import {
    createServerAllocationInput,
    deleteServerAllocationInput,
    setPrimaryAllocationInput,
    updateAllocationNotesInput,
    useCreateServerAllocation,
    useDeleteServerAllocation,
    useServerAllocations,
    useSetPrimaryAllocation,
    useUpdateAllocationNotes,
    type ServerAllocation,
} from '@/api/server/network/queries';
import { useServerPortsQuery } from '@/api/server/ports';
import { useCurrentServer } from '@/api/server/queries';
import { ip } from '@/lib/formatters';
import { usePermissions } from '@/plugins/usePermissions';
import { implementViews } from '../registry';
import { pageStatus, pageStatusFixtures, type PageStatusModel } from '../pageStatus';

export interface ServerAllocationItem {
    readonly id: number;
    readonly ip: string;
    readonly alias: string | null;
    /** The alias, or the IP in brackets when it is IPv6. */
    readonly address: string;
    readonly port: number;
    readonly notes: string | null;
    /** The port roles bound to this allocation, such as `PORT`; empty when none. */
    readonly roles: readonly string[];
    /** The allocation the server binds to; it cannot be removed. */
    readonly primary: boolean;
}
export interface ServerAllocationsModel {
    readonly allocations: readonly ServerAllocationItem[];
    /** The list has not loaded yet. */
    readonly loading: boolean;
    /** How many allocations the server may have; at 0 they are managed by an administrator. */
    readonly limit: number;
    readonly permissions: { readonly create: boolean; readonly update: boolean; readonly delete: boolean };
    /** The user may add allocations and the server has a limit to add them under. */
    readonly canManage: boolean;
    /** `canManage`, with room left under the limit. */
    readonly canCreate: boolean;
    /** Core has already shown a toast for a rejection. */
    readonly actions: {
        /** Assigns another allocation from the node. */
        readonly create: () => Promise<void>;
        readonly setPrimary: (id: number) => Promise<void>;
        readonly setNotes: (id: number, notes: string) => Promise<void>;
        /** Remove without a confirmation; ask the user first. */
        readonly remove: (id: number) => Promise<void>;
    };
}

declare module '../registry' {
    interface ViewModels {
        'page.server.network': PageStatusModel;
        'server.allocations': ServerAllocationsModel;
    }
}

const noAllocations: ServerAllocation[] = [];

const allocationItem = ({ attributes }: ServerAllocation, roles: readonly string[]): ServerAllocationItem => ({
    id: attributes.id,
    ip: attributes.ip,
    alias: attributes.ip_alias,
    address: attributes.ip_alias || ip(attributes.ip),
    port: attributes.port,
    notes: attributes.notes,
    roles,
    primary: attributes.is_default,
});

function useAllocationsQuery() {
    const server = useCurrentServer();

    return { server, query: useServerAllocations(server?.attributes.uuid ?? '') };
}

const useNetworkPageModel = () => pageStatus(useAllocationsQuery().query);

function useServerAllocationsModel(): ServerAllocationsModel {
    const { server, query } = useAllocationsQuery();
    const uuid = server?.attributes.uuid ?? '';
    const limit = server?.attributes.feature_limits.allocations ?? 0;
    const [create, update, remove] = usePermissions(['allocation.create', 'allocation.update', 'allocation.delete']);
    const { mutateAsync: createAllocation } = useCreateServerAllocation();
    const { mutateAsync: setPrimary } = useSetPrimaryAllocation();
    const { mutateAsync: setNotes } = useUpdateAllocationNotes();
    const { mutateAsync: deleteAllocation } = useDeleteServerAllocation();
    const ports = useServerPortsQuery(uuid).data;
    const listed = query.data?.data ?? noAllocations;
    const loading = query.data === undefined;

    return useMemo(() => {
        const rolesByAllocation = new Map<number, string[]>();

        for (const role of ports?.roles ?? []) {
            if (role.allocation) {
                rolesByAllocation.set(role.allocation.id, [
                    ...(rolesByAllocation.get(role.allocation.id) ?? []),
                    role.role,
                ]);
            }
        }

        const allocations = listed.map((item) => allocationItem(item, rolesByAllocation.get(item.attributes.id) ?? []));
        const canManage = create && limit > 0;

        return {
            allocations,
            loading,
            limit,
            permissions: { create, update, delete: remove },
            canManage,
            canCreate: canManage && limit > allocations.length,
            actions: {
                create: async () => {
                    await createAllocation(createServerAllocationInput(uuid));
                },
                setPrimary: async (id) => {
                    await setPrimary(setPrimaryAllocationInput(uuid, id));
                },
                setNotes: async (id, notes) => {
                    await setNotes(updateAllocationNotesInput(uuid, id, notes));
                },
                remove: async (id) => {
                    await deleteAllocation(deleteServerAllocationInput(uuid, id));
                },
            },
        };
    }, [
        listed,
        loading,
        limit,
        create,
        update,
        remove,
        createAllocation,
        setPrimary,
        setNotes,
        deleteAllocation,
        ports,
        uuid,
    ]);
}

const resolved = async () => {};

const allocation = (id: number, port: number, options: Partial<ServerAllocationItem> = {}): ServerAllocationItem => ({
    id,
    ip: '203.0.113.10',
    alias: null,
    address: '203.0.113.10',
    port,
    notes: null,
    roles: [],
    primary: false,
    ...options,
});

const allocationsFixture = (options: Partial<ServerAllocationsModel> = {}): ServerAllocationsModel => ({
    allocations: [
        allocation(1, 25565, { primary: true, notes: 'Game port', roles: ['PORT'] }),
        allocation(2, 25575, { notes: 'RCON', roles: ['RCON_PORT'] }),
        allocation(3, 8123, { alias: 'play.example.com', address: 'play.example.com' }),
    ],
    loading: false,
    limit: 5,
    permissions: { create: true, update: true, delete: true },
    canManage: true,
    canCreate: true,
    actions: { create: resolved, setPrimary: resolved, setNotes: resolved, remove: resolved },
    ...options,
});

implementViews({
    'page.server.network': {
        use: useNetworkPageModel,
        fixtures: pageStatusFixtures,
    },
    'server.allocations': {
        use: useServerAllocationsModel,
        fixtures: {
            allocations: () => allocationsFixture(),
            full: () => allocationsFixture({ limit: 3, canCreate: false }),
            unmanaged: () => allocationsFixture({ limit: 0, canManage: false, canCreate: false }),
            readOnly: () =>
                allocationsFixture({
                    permissions: { create: false, update: false, delete: false },
                    canManage: false,
                    canCreate: false,
                }),
            empty: () => allocationsFixture({ allocations: [] }),
            loading: () => allocationsFixture({ allocations: [], loading: true }),
        },
    },
});
