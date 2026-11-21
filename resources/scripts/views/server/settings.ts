import { useCallback, useMemo } from 'react';
import { useCurrentUser } from '@/api/account/queries';
import {
    usePreviewServerPorts,
    useReassignServerPorts,
    useRegenerateServerPorts,
    useServerPortsQuery,
    useUpdateServerPorts,
    type ConflictPolicy,
    type EnvFormat,
    type EnvMode,
    type EnvSettings,
    type ExtraVariable,
    type PortRole,
    type ServerPorts,
    type PortStatus,
    type PortsPreview,
} from '@/api/server/ports';
import { sendPowerActionInput, useSendPowerAction } from '@/api/server/power/queries';
import { useReinstallServer, useRenameServer } from '@/api/server/queries';
import { canReinstallServer, SKIPPED_INSTALL_SCRIPT_MESSAGE } from '@/lib/serverStatus';
import { usePermissions } from '@/plugins/usePermissions';
import { useServerStatus } from '@/state/server';
import { ip } from '@/lib/formatters';
import { implementViews } from '../registry';
import { attempt } from './attempt';
import { useLoadedServer } from './loadedServer';

export type ServerSettingsPageModel = Readonly<Record<never, never>>;

export interface ServerSftpModel {
    /** The viewer may use SFTP; the block renders nothing otherwise. */
    readonly allowed: boolean;
    readonly ip: string;
    readonly port: number;
    /** The SFTP username, which signs in with the viewer's panel password. */
    readonly username: string;
}

export interface ServerDebugModel {
    /** The name of the node running the server. */
    readonly node: string;
    readonly uuid: string;
}

export interface ServerDetailsValues {
    readonly name: string;
    readonly description: string;
}
export interface ServerRenameModel {
    readonly allowed: boolean;
    /** The details as saved, which the form starts from. */
    readonly values: ServerDetailsValues;
    readonly validateName: (name: string) => string | undefined;
    /** Resolves whether the details were saved; a failure has already been reported. */
    readonly save: (values: ServerDetailsValues) => Promise<boolean>;
}

export interface ServerReinstallModel {
    readonly allowed: boolean;
    /** Why the server cannot be reinstalled, or null when it can. */
    readonly unavailable: string | null;
    /** Resolves whether the reinstall started; a failure has already been reported. */
    readonly reinstall: () => Promise<boolean>;
}

export interface PortRoleRow {
    readonly role: string;
    readonly required: boolean;
    /** `ip:port`, or null while no port is bound. */
    readonly address: string | null;
    readonly allocationId: number | null;
    readonly auto: boolean;
    readonly status: PortStatus;
    /** Why the port cannot be used, shown beside its status. */
    readonly reason: string | null;
}

export interface PortAllocationOption {
    readonly id: number;
    readonly address: string;
}

export interface EnvFileSettings {
    readonly fileName: string;
    readonly format: EnvFormat;
    readonly mode: EnvMode;
    readonly conflictPolicy: ConflictPolicy;
    /** A secret has a null value: it is never sent back to the browser. */
    readonly extra: readonly ExtraVariable[];
}

export interface ServerPortsModel {
    readonly loading: boolean;
    /** The viewer holds `settings.ports`; without it the card is read-only. */
    readonly allowed: boolean;
    /** Only a root administrator may reassign automatic ports; everyone else gets no button. */
    readonly canReassign: boolean;
    readonly roles: readonly PortRoleRow[];
    /** The server's allocations that no role uses yet, for a manual choice. */
    readonly freeAllocations: readonly PortAllocationOption[];
    readonly settings: EnvFileSettings;
    /** A change has not reached the running process. */
    readonly restartRequired: boolean;
    /** The server is running, so a restart is the way to apply a change. */
    readonly running: boolean;
    /** There is a free allocation, or room under the limit to take one. */
    readonly canAddRole: boolean;
    readonly allocationCount: number;
    readonly allocationLimit: number;
    /** Every injected variable, `PORT` and the roles among them. */
    readonly variables: Readonly<Record<string, string>>;
    /** Every action resolves whether it worked; a failure has already been reported. */
    readonly actions: {
        readonly addRole: (role: string, allocationId: number | null) => Promise<boolean>;
        readonly setRole: (role: string, allocationId: number | null) => Promise<boolean>;
        readonly removeRole: (role: string) => Promise<boolean>;
        readonly reassign: () => Promise<boolean>;
        readonly saveSettings: (settings: EnvFileSettings) => Promise<boolean>;
        readonly regenerate: () => Promise<boolean>;
        readonly restart: () => Promise<boolean>;
        /** What the file would hold for unsaved settings, or null when it cannot be previewed. */
        readonly preview: (settings: EnvFileSettings) => Promise<PortsPreview | null>;
    };
}

declare module '../registry' {
    interface ViewModels {
        'server.ports': ServerPortsModel;
        'page.server.settings': ServerSettingsPageModel;
        'server.sftp': ServerSftpModel;
        'server.debug': ServerDebugModel;
        'server.rename': ServerRenameModel;
        'server.reinstall': ServerReinstallModel;
    }
}

const settingsPageModel: ServerSettingsPageModel = Object.freeze({});

function useSftpModel(): ServerSftpModel {
    const { username } = useCurrentUser();
    const { identifier, sftp_details: sftp } = useLoadedServer().attributes;
    const [allowed] = usePermissions('file.sftp');

    return useMemo(
        () => ({ allowed, ip: sftp.ip, port: sftp.port, username: `${username}.${identifier}` }),
        [allowed, sftp, username, identifier]
    );
}

function useDebugModel(): ServerDebugModel {
    const { node, uuid } = useLoadedServer().attributes;

    return useMemo(() => ({ node, uuid }), [node, uuid]);
}

const validateName = (name: string): string | undefined => (name.length >= 1 ? undefined : 'Required');

function useRenameModel(): ServerRenameModel {
    const { identifier, uuid, name, description } = useLoadedServer().attributes;
    const [allowed] = usePermissions('settings.rename');
    const { mutateAsync } = useRenameServer(identifier);
    const save = useCallback(
        (values: ServerDetailsValues) =>
            attempt(() =>
                mutateAsync({
                    path: { server_uuid: uuid },
                    body: { name: values.name, description: values.description },
                })
            ),
        [mutateAsync, uuid]
    );

    return useMemo(
        () => ({ allowed, values: { name, description: description ?? '' }, validateName, save }),
        [allowed, name, description, save]
    );
}

function useReinstallModel(): ServerReinstallModel {
    const { uuid, status, skip_scripts: skipScripts } = useLoadedServer().attributes;
    const [allowed] = usePermissions('settings.reinstall');
    const { mutateAsync } = useReinstallServer();
    const reinstall = useCallback(
        () => attempt(() => mutateAsync({ path: { server_uuid: uuid } })),
        [mutateAsync, uuid]
    );
    const unavailable = canReinstallServer(status, skipScripts) ? null : SKIPPED_INSTALL_SCRIPT_MESSAGE;

    return useMemo(() => ({ allowed, unavailable, reinstall }), [allowed, unavailable, reinstall]);
}

const defaultSettings: EnvFileSettings = {
    fileName: '.env',
    format: 'dotenv',
    mode: 'managed',
    conflictPolicy: 'warn',
    extra: [],
};

const noRoles: never[] = [];

const settingsBody = (settings: EnvFileSettings) => ({
    file_name: settings.fileName,
    format: settings.format,
    mode: settings.mode,
    conflict_policy: settings.conflictPolicy,
    extra: settings.extra.map((variable) => ({ ...variable })),
});

const roleRow = (row: PortRole): PortRoleRow => ({
    role: row.role,
    required: row.required,
    address: row.allocation ? `${row.allocation.ip_alias || ip(row.allocation.ip)}:${row.allocation.port}` : null,
    allocationId: row.allocation?.id ?? null,
    auto: row.auto,
    status: row.status,
    reason: row.reason,
});

const savedSettings = (settings: EnvSettings): EnvFileSettings => ({
    fileName: settings.file_name,
    format: settings.format,
    mode: settings.mode,
    conflictPolicy: settings.conflict_policy,
    extra: settings.extra,
});

const portsSummary = (ports: ServerPorts | undefined) => ({
    restartRequired: ports?.restart_required ?? false,
    canAddRole: ports?.can_add_role ?? false,
    allocationCount: ports?.allocation_count ?? 0,
    allocationLimit: ports?.allocation_limit ?? 0,
    variables: ports?.variables ?? {},
});

function useServerPortsModel(): ServerPortsModel {
    const { uuid } = useLoadedServer().attributes;
    const [allowed] = usePermissions('settings.ports');
    const { rootAdmin } = useCurrentUser();
    const state = useServerStatus();
    const query = useServerPortsQuery(uuid);
    const { mutateAsync: update } = useUpdateServerPorts(uuid);
    const { mutateAsync: reassign } = useReassignServerPorts(uuid);
    const { mutateAsync: regenerate } = useRegenerateServerPorts(uuid);
    const { mutateAsync: previewPorts } = usePreviewServerPorts(uuid);
    const { mutateAsync: power } = useSendPowerAction();
    const ports = query.data;

    return useMemo(() => {
        const run = (change: Parameters<typeof update>[0]) => attempt(() => update(change));

        return {
            loading: ports === undefined,
            allowed,
            canReassign: allowed && rootAdmin,
            roles: ports ? ports.roles.map(roleRow) : noRoles,
            freeAllocations: (ports?.free_allocations ?? noRoles).map((allocation) => ({
                id: allocation.id,
                address: `${allocation.ip_alias || ip(allocation.ip)}:${allocation.port}`,
            })),
            settings: ports ? savedSettings(ports.settings) : defaultSettings,
            ...portsSummary(ports),
            running: state === 'running' || state === 'starting',
            actions: {
                addRole: (role, allocationId) =>
                    run({ roles: [{ role, auto: allocationId === null, allocation_id: allocationId }] }),
                setRole: (role, allocationId) =>
                    run({ roles: [{ role, auto: allocationId === null, allocation_id: allocationId }] }),
                removeRole: (role) => run({ remove_roles: [role] }),
                reassign: () => attempt(() => reassign()),
                saveSettings: (settings) => run({ settings: settingsBody(settings) }),
                regenerate: () => attempt(() => regenerate()),
                restart: () => attempt(() => power(sendPowerActionInput(uuid, 'restart'))),
                preview: async (settings) => {
                    try {
                        return await previewPorts(settingsBody(settings));
                    } catch {
                        return null;
                    }
                },
            },
        };
    }, [ports, allowed, rootAdmin, state, update, reassign, regenerate, previewPorts, power, uuid]);
}

const succeeded = async () => true;

const portsFixture = (options: Partial<ServerPortsModel> = {}): ServerPortsModel => ({
    loading: false,
    allowed: true,
    canReassign: true,
    roles: [
        {
            role: 'PORT',
            required: true,
            address: '203.0.113.10:25565',
            allocationId: 1,
            auto: true,
            status: 'free',
            reason: null,
        },
        {
            role: 'QUERY_PORT',
            required: false,
            address: '203.0.113.10:25566',
            allocationId: 2,
            auto: true,
            status: 'free',
            reason: null,
        },
        {
            role: 'RCON_PORT',
            required: false,
            address: '203.0.113.10:25575',
            allocationId: 3,
            auto: false,
            status: 'conflict',
            reason: 'The port is already in use by another server on the node.',
        },
    ],
    freeAllocations: [{ id: 4, address: '203.0.113.10:25580' }],
    settings: defaultSettings,
    restartRequired: false,
    running: false,
    canAddRole: true,
    allocationCount: 3,
    allocationLimit: 5,
    variables: { PORT: '25565', QUERY_PORT: '25566', RCON_PORT: '25575' },
    actions: {
        addRole: succeeded,
        setRole: succeeded,
        removeRole: succeeded,
        reassign: succeeded,
        saveSettings: succeeded,
        regenerate: succeeded,
        restart: succeeded,
        preview: async () => ({
            path: '.env',
            mode: 'managed',
            format: 'dotenv',
            content: '# >>> astrelyse ports\nSERVER_PORT=25565\nPORT=25565\n# <<< astrelyse ports\n',
            conflicts: [],
            writes_file: true,
        }),
    },
    ...options,
});

const sftpFixture = (options: Partial<ServerSftpModel> = {}): ServerSftpModel => ({
    allowed: true,
    ip: '203.0.113.10',
    port: 2022,
    username: 'alex.a1b2c3d4',
    ...options,
});

const renameFixture = (options: Partial<ServerRenameModel> = {}): ServerRenameModel => ({
    allowed: true,
    values: { name: 'Survival', description: 'The main survival world.' },
    validateName,
    save: succeeded,
    ...options,
});

implementViews({
    'page.server.settings': {
        use: () => settingsPageModel,
        fixtures: { default: () => settingsPageModel },
    },
    'server.sftp': {
        use: useSftpModel,
        fixtures: {
            default: () => sftpFixture(),
            ipv6: () => sftpFixture({ ip: '2001:db8::10' }),
            denied: () => sftpFixture({ allowed: false }),
        },
    },
    'server.debug': {
        use: useDebugModel,
        fixtures: { default: () => ({ node: 'Node 1', uuid: '11111111-1111-4111-8111-111111111111' }) },
    },
    'server.rename': {
        use: useRenameModel,
        fixtures: {
            default: () => renameFixture(),
            empty: () => renameFixture({ values: { name: 'Survival', description: '' } }),
            denied: () => renameFixture({ allowed: false }),
        },
    },
    'server.ports': {
        use: useServerPortsModel,
        fixtures: {
            default: () => portsFixture(),
            restartRequired: () => portsFixture({ restartRequired: true, running: true }),
            readOnly: () => portsFixture({ allowed: false }),
            loading: () => portsFixture({ loading: true, roles: [] }),
            full: () => portsFixture({ canAddRole: false }),
        },
    },
    'server.reinstall': {
        use: useReinstallModel,
        fixtures: {
            default: () => ({ allowed: true, unavailable: null, reinstall: succeeded }),
            skipped: () => ({ allowed: true, unavailable: SKIPPED_INSTALL_SCRIPT_MESSAGE, reinstall: succeeded }),
            denied: () => ({ allowed: false, unavailable: null, reinstall: succeeded }),
        },
    },
});
