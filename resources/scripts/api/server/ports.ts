import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
    clientGetPortsAndEnvironmentOptions,
    clientReassignAutomaticPortsMutation,
    clientRegenerateTheEnvironmentFileMutation,
    clientPreviewTheEnvironmentFileMutation,
    clientUpdatePortsAndEnvironmentMutation,
} from '@/api/generated/@tanstack/react-query.gen';
import type { ClientServerPortsResource } from '@/api/generated';
import { isObject } from '@/lib/objects';
import { notifyHttpError } from '@/plugins/notifications';

export type PortStatus = 'free' | 'in_use' | 'conflict' | 'unassigned';
export type EnvFormat = 'dotenv' | 'json' | 'yaml';
export type EnvMode = 'managed' | 'separate' | 'off';
export type ConflictPolicy = 'panel' | 'user' | 'warn';

export interface PortAllocation {
    id: number;
    ip: string;
    ip_alias: string | null;
    port: number;
}

export interface PortRole {
    role: string;
    required: boolean;
    allocation: PortAllocation | null;
    auto: boolean;
    status: PortStatus;
    reason: string | null;
}

export interface ExtraVariable {
    key: string;
    /** Null for a secret, whose value never leaves the panel. */
    value: string | null;
    secret: boolean;
}

export interface EnvSettings {
    file_name: string;
    format: EnvFormat;
    mode: EnvMode;
    conflict_policy: ConflictPolicy;
    extra: ExtraVariable[];
}

export interface ServerPorts {
    roles: PortRole[];
    free_allocations: PortAllocation[];
    settings: EnvSettings;
    restart_required: boolean;
    allocation_limit: number;
    allocation_count: number;
    can_add_role: boolean;
    variables: Record<string, string>;
}

export interface PortsWrite {
    written: boolean;
    error: string | null;
    conflicts: string[];
}

export interface PortsPreview {
    path: string;
    mode: EnvMode;
    format: EnvFormat;
    content: string;
    conflicts: string[];
    writes_file: boolean;
}

export interface RoleChange {
    role: string;
    auto: boolean;
    allocation_id?: number | null;
}

export interface PortsUpdate {
    roles?: RoleChange[];
    remove_roles?: string[];
    settings?: Partial<Omit<EnvSettings, 'extra'>> & { extra?: ExtraVariable[] };
}

export const serverPortsQueryKey = (uuid: string) => ['server', uuid, 'ports'] as const;

const path = (uuid: string) => ({ server_uuid: uuid });

/** The generated types describe the documentation example, so the real shape is read at this boundary. */
const readPorts = (data: { attributes: unknown }): ServerPorts => data.attributes as ServerPorts;

const readWrite = (data: ClientServerPortsResource): PortsWrite | null => {
    const meta: unknown = Reflect.get(data, 'meta');
    const write: unknown = isObject(meta) ? Reflect.get(meta, 'write') : null;

    return isObject(write) ? (write as PortsWrite) : null;
};

export const useServerPortsQuery = (uuid: string) =>
    useQuery({
        ...clientGetPortsAndEnvironmentOptions({ path: path(uuid) }),
        select: readPorts,
        enabled: uuid.length > 0,
    });

const reportWrite = (write: PortsWrite | null) => {
    if (write?.error) {
        toast.warning('Saved, but the environment file could not be written', { description: write.error });
    } else if (write?.written) {
        toast.success('Environment file updated');
    }
};

const useStoreResult = (uuid: string) => {
    const queryClient = useQueryClient();

    return (data: ClientServerPortsResource) => {
        void queryClient.invalidateQueries({
            queryKey: clientGetPortsAndEnvironmentOptions({ path: path(uuid) }).queryKey,
        });
        reportWrite(readWrite(data));
    };
};

export const useUpdateServerPorts = (uuid: string) => {
    const done = useStoreResult(uuid);
    const mutation = useMutation({
        ...clientUpdatePortsAndEnvironmentMutation(),
        onSuccess: done,
        onError: (error) => notifyHttpError(error, 'Unable to save ports and environment'),
    });

    const { mutateAsync } = mutation;

    // Stable between renders: views key effects and memos on it.
    return {
        mutateAsync: useCallback((body: PortsUpdate) => mutateAsync({ path: path(uuid), body }), [mutateAsync, uuid]),
    };
};

export const useReassignServerPorts = (uuid: string) => {
    const done = useStoreResult(uuid);
    const mutation = useMutation({
        ...clientReassignAutomaticPortsMutation(),
        onSuccess: done,
        onError: (error) => notifyHttpError(error, 'Unable to reassign ports'),
    });

    const { mutateAsync } = mutation;

    return { mutateAsync: useCallback(() => mutateAsync({ path: path(uuid) }), [mutateAsync, uuid]) };
};

export const useRegenerateServerPorts = (uuid: string) => {
    const queryClient = useQueryClient();
    const mutation = useMutation({
        ...clientRegenerateTheEnvironmentFileMutation(),
        onSuccess: (data) => {
            toast.success(data.attributes.written ? 'Environment file updated' : 'Nothing was written in this mode');
            void queryClient.invalidateQueries({
                queryKey: clientGetPortsAndEnvironmentOptions({ path: path(uuid) }).queryKey,
            });
        },
        onError: (error) => notifyHttpError(error, 'Unable to regenerate the environment file'),
    });

    const { mutateAsync } = mutation;

    return { mutateAsync: useCallback(() => mutateAsync({ path: path(uuid) }), [mutateAsync, uuid]) };
};

export const usePreviewServerPorts = (uuid: string) => {
    const { mutateAsync } = useMutation({ ...clientPreviewTheEnvironmentFileMutation() });

    return {
        mutateAsync: useCallback(
            async (body: PortsUpdate['settings']): Promise<PortsPreview> =>
                (await mutateAsync({ path: path(uuid), body })).attributes as PortsPreview,
            [mutateAsync, uuid]
        ),
    };
};
