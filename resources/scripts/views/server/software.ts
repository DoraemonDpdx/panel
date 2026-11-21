import { useState } from 'react';
import { useModsPlatform } from '@/api/server/mods/queries';
import { sendPowerActionInput, useSendPowerAction } from '@/api/server/power/queries';
import { useCurrentServer } from '@/api/server/queries';
import type { ContentProvider } from '@/api/server/content/types';
import {
    isActiveOperation,
    softwareError,
    useClearServerFiles,
    useReinstallSoftware,
    useSoftware,
    useSoftwareOperation,
    type SoftwareState,
} from '@/api/server/software/queries';
import { usePermissions } from '@/plugins/usePermissions';
import { useServerStatus } from '@/state/server';
import { implementViews } from '../registry';
import { attempt } from './attempt';
import { useModpacksModel, useWorldsModel } from './softwareContent';
import { headerModel, levelHint, typeCards } from './softwareItems';
import { preselected, tabOf, useSoftwareSearch, type PreselectedItem } from './softwareSearch';
import { useTypeModel } from './softwareType';
import type { MaintenanceModel, ServerSoftwareModel, SoftwarePageModel, SoftwareTab } from './softwareTypes';

const noop = () => {};

const resolved = async () => {};

const bothProviders: readonly ContentProvider[] = ['modrinth', 'curseforge'];

const noState = { type: null, minecraft: null, loader: null, egg_managed: false } as const;

function useSoftwarePageModel(): SoftwarePageModel {
    return { loading: false, error: null, retry: noop, title: 'Software' };
}

function useMaintenanceModel(uuid: string, serverName: string, canStop: boolean): MaintenanceModel {
    const status = useServerStatus();
    const [keepWorlds, setKeepWorlds] = useState(true);
    const reinstall = useReinstallSoftware(uuid);
    const clear = useClearServerFiles(uuid);
    const { mutateAsync: power, isPending: stopping } = useSendPowerAction();

    return {
        reinstall: {
            pending: reinstall.isPending,
            run: async () => {
                await attempt(() => reinstall.mutateAsync(undefined));
            },
        },
        clear: {
            serverName,
            matches: (typed) => typed === serverName,
            serverRunning: status === 'running' || status === 'starting' || status === 'stopping',
            canStop,
            stopping,
            stop: async () => {
                await attempt(() => power(sendPowerActionInput(uuid, 'stop')));
            },
            keepWorlds,
            setKeepWorlds,
            pending: clear.isPending,
            run: async (typed) => {
                if (typed === serverName) {
                    await attempt(() => clear.mutateAsync({ keep_worlds: keepWorlds, confirm: typed }));
                }
            },
        },
    };
}

/** The latest operation, polled every two seconds while it runs. */
function useOperation(uuid: string, state: SoftwareState | undefined) {
    const latest = state?.operation ?? null;
    const polled = useSoftwareOperation(uuid, latest && isActiveOperation(latest) ? latest.id : null).data;
    const current = latest && polled && String(polled.id) === String(latest.id) ? polled : latest;

    return { operation: current, busy: isActiveOperation(current) };
}

interface ContentInput {
    readonly uuid: string;
    readonly uploadSizeMb: number;
    readonly tab: SoftwareTab;
    readonly linked: PreselectedItem | null;
    readonly state: SoftwareState | undefined;
    readonly canReadMods: boolean;
}

/** The modpack and world models, which share the sources the panel has keys for. */
function useContentModels({ uuid, uploadSizeMb, tab, linked, state, canReadMods }: ContentInput) {
    const platform = useModsPlatform(uuid, canReadMods);
    const providers = platform.data?.providers ?? bothProviders;
    const modpacks = useModpacksModel({
        uuid,
        uploadSizeMb,
        active: tab === 'modpacks' || linked?.kind === 'modpack',
        providers,
        linked,
        types: state?.types ?? [],
    });
    const worlds = useWorldsModel({
        uuid,
        uploadSizeMb,
        active: tab === 'worlds' || linked?.kind === 'world',
        missingKey: !providers.includes('curseforge'),
        linked,
    });

    return { modpacks, worlds };
}

const failureOf = (cause: unknown): ServerSoftwareModel['error'] => {
    const failure = softwareError(cause);

    return failure.kind === 'busy' ? null : { kind: failure.kind, message: failure.message };
};

const statusOf = (query: { data: SoftwareState | undefined; error: unknown }) => ({
    loading: query.data === undefined && !query.error,
    error: query.error ? failureOf(query.error) : null,
});

const visibleTab = (canManage: boolean, tab: SoftwareTab): SoftwareTab =>
    canManage || tab !== 'maintenance' ? tab : 'type';

const headerOf = (state: SoftwareState | undefined, operation: SoftwareState['operation']) =>
    headerModel(state?.current ?? noState, state?.types ?? [], state?.modpack ?? null, operation);

function useServerSoftwareModel(): ServerSoftwareModel {
    const server = useCurrentServer();
    const { uuid = '', identifier = '', name = '', upload_size: uploadSizeMb = 100 } = server?.attributes ?? {};
    const [canRead, canManage, canStop, canReadMods] = usePermissions([
        'software.read',
        'software.manage',
        'control.stop',
        'mods.read',
    ]);
    const search = useSoftwareSearch();
    const linked = preselected(search);
    const [tab, setTab] = useState<SoftwareTab>(tabOf(linked, search) ?? 'type');
    const query = useSoftware(uuid, canRead);
    const state = query.data;
    const { operation, busy } = useOperation(uuid, state);
    const content = useContentModels({ uuid, uploadSizeMb, tab, linked, state, canReadMods: canReadMods && canRead });

    return {
        ...statusOf(query),
        retry: () => void query.refetch(),
        canManage,
        canConvert: canManage && server?.meta?.is_server_owner === true,
        // Maintenance is all writes, so it does not exist without the permission.
        tab: visibleTab(canManage, tab),
        setTab,
        busy,
        header: headerOf(state, operation),
        consoleDestination: { to: '/server/$id', params: { id: identifier } },
        type: useTypeModel({ uuid, state, canManage, busy }),
        ...content,
        maintenance: useMaintenanceModel(uuid, name, canStop),
    };
}

const fixtureTypes = [
    { type: 'vanilla', label: 'Vanilla', kind: 'vanilla', icon: 'box' },
    { type: 'paper', label: 'Paper', kind: 'plugin', icon: 'file-text' },
    { type: 'purpur', label: 'Purpur', kind: 'plugin', icon: 'sparkles' },
    { type: 'folia', label: 'Folia', kind: 'plugin', icon: 'leaf' },
    { type: 'fabric', label: 'Fabric', kind: 'mod', icon: 'scroll' },
    { type: 'quilt', label: 'Quilt', kind: 'mod', icon: 'blocks' },
    { type: 'forge', label: 'Forge', kind: 'mod', icon: 'hammer' },
    { type: 'neoforge', label: 'NeoForge', kind: 'mod', icon: 'flame' },
] as const;

const softwareFixture = (options: Partial<ServerSoftwareModel> = {}): ServerSoftwareModel => ({
    loading: false,
    error: null,
    retry: noop,
    canManage: true,
    canConvert: true,
    tab: 'type',
    setTab: noop,
    busy: false,
    header: {
        typeLabel: 'Fabric',
        icon: 'scroll',
        version: 'Fabric 0.16.9 · Minecraft 1.21.1',
        modpack: null,
        operation: null,
    },
    consoleDestination: { to: '/server/$id', params: { id: 'test-server' } },
    type: {
        cards: typeCards(fixtureTypes, 'fabric'),
        selected: null,
        select: noop,
        needsConvert: false,
        convert: { pending: false, run: resolved },
        configure: null,
    },
    modpacks: {
        providers: bothProviders,
        provider: 'modrinth',
        setProvider: noop,
        query: '',
        setQuery: noop,
        sort: 'relevance',
        setSort: noop,
        results: [],
        total: 0,
        loading: false,
        loadingMore: false,
        error: null,
        unavailable: null,
        retry: noop,
        hasMore: false,
        loadMore: noop,
        emptyMessage: 'No modpacks found on Modrinth.',
        open: noop,
        drawer: null,
        importer: {
            accept: '.mrpack,.zip',
            pick: resolved,
            uploading: false,
            progress: null,
            uploaded: null,
            installing: false,
            confirm: resolved,
            cancel: noop,
            fresh: true,
            setFresh: noop,
        },
    },
    worlds: {
        providers: ['curseforge'],
        provider: 'curseforge',
        setProvider: noop,
        query: '',
        setQuery: noop,
        sort: 'relevance',
        setSort: noop,
        results: [],
        total: 0,
        loading: false,
        loadingMore: false,
        error: null,
        unavailable: null,
        retry: noop,
        hasMore: false,
        loadMore: noop,
        emptyMessage: 'No worlds found on CurseForge.',
        open: noop,
        options: {
            mode: 'replace',
            setMode: noop,
            backup: true,
            setBackup: noop,
            summary: 'The server will stop, save a backup copy of your current world and replace it.',
            destructive: false,
            levelHint,
        },
        drawer: null,
        importer: {
            accept: '.zip',
            pick: resolved,
            uploading: false,
            progress: null,
            uploaded: null,
            installing: false,
            confirm: resolved,
            cancel: noop,
        },
    },
    maintenance: {
        reinstall: { pending: false, run: resolved },
        clear: {
            serverName: 'Survival SMP',
            matches: (typed) => typed === 'Survival SMP',
            serverRunning: false,
            canStop: true,
            stopping: false,
            stop: resolved,
            keepWorlds: true,
            setKeepWorlds: noop,
            pending: false,
            run: resolved,
        },
    },
    ...options,
});

implementViews({
    'page.server.software': {
        use: useSoftwarePageModel,
        fixtures: {
            default: () => ({ loading: false, error: null, retry: noop, title: 'Software' }),
        },
    },
    'server.software': {
        use: useServerSoftwareModel,
        fixtures: {
            type: () => softwareFixture(),
            readOnly: () => softwareFixture({ canManage: false }),
            installing: () =>
                softwareFixture({
                    busy: true,
                    header: {
                        typeLabel: 'Fabric',
                        icon: 'scroll',
                        version: 'Fabric 0.16.9 · Minecraft 1.21.1',
                        modpack: null,
                        operation: {
                            id: '1',
                            status: 'running',
                            active: true,
                            failed: false,
                            succeeded: false,
                            label: 'Installing…',
                            at: null,
                            error: null,
                            note: null,
                        },
                    },
                }),
            maintenance: () => softwareFixture({ tab: 'maintenance' }),
            loading: () => softwareFixture({ loading: true }),
            unsupported: () =>
                softwareFixture({
                    error: { kind: 'unsupported', message: 'This server does not run Minecraft Java.' },
                }),
        },
    },
});
