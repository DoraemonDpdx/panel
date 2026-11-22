/* oxlint-disable no-restricted-properties, rules/generated-api-mutations -- The Software endpoints are not in the generated client until `npm run sdk:generate` runs after the backend lands. */
import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'sonner';
import http, { httpErrorToHuman } from '@/api/http';
import { isObject, isString } from '@/lib/objects';
import { notifyServerError } from '@/plugins/notifications';
import {
    isActiveOperation,
    type InstallOperation,
    type SoftwareCatalog,
    type SoftwareCurrent,
    type SoftwareError,
    type SoftwareInstallBody,
    type SoftwareState,
} from './types';

export * from './types';

/** How often a running operation is asked for. */
export const OPERATION_POLL_MS = 2000;

const base = (uuid: string) => `/api/client/servers/${uuid}/software`;

export const softwareQueryKey = (uuid: string) => ['server', uuid, 'software'] as const;
export const softwareStateQueryKey = (uuid: string) => [...softwareQueryKey(uuid), 'state'] as const;
export const softwareCatalogQueryKey = (uuid: string, type: string, snapshots: boolean, minecraft: string | null) =>
    [...softwareQueryKey(uuid), 'catalog', type, snapshots, minecraft ?? ''] as const;
export const softwareOperationQueryKey = (uuid: string, id: number | string) =>
    [...softwareQueryKey(uuid), 'operation', String(id)] as const;

/** A resource body is either the resource or `{attributes: resource}`; the contract allows both. */
export const unwrap = <T extends object>(body: T | { attributes: T }): T =>
    'attributes' in body && isObject(body.attributes) ? body.attributes : (body as T);

const bodyCode = (cause: unknown): string | undefined => {
    if (!axios.isAxiosError(cause)) {
        return undefined;
    }

    const data: unknown = cause.response?.data;

    return isObject(data) && 'error' in data && isString(data.error) ? data.error : undefined;
};

const MESSAGES = {
    not_astrelyse_egg: 'This server does not use the Astrelyse Minecraft egg yet. Convert it first.',
    software_unsupported: 'This server does not run Minecraft Java.',
    server_not_offline: 'Stop the server first.',
    cannot_convert: "This server's egg can't be converted automatically.",
} as const;

const messages = new Map<string, string>(Object.entries(MESSAGES));

/** A friendly message for the API's coded refusals, else the API's own words. */
export const codedMessage = (cause: unknown): string => {
    const code = bodyCode(cause);
    const status = axios.isAxiosError(cause) ? cause.response?.status : undefined;

    if (status === 403) {
        return 'Only the server owner can do this.';
    }

    if (status === 422 && code === undefined) {
        return 'The name you typed does not match the server name.';
    }

    return (code ? messages.get(code) : undefined) ?? httpErrorToHuman(cause);
};

export const softwareError = (cause: unknown): SoftwareError => {
    const code = bodyCode(cause);
    const status = axios.isAxiosError(cause) ? cause.response?.status : undefined;
    const message = codedMessage(cause);

    if (code === 'software_unsupported') {
        return { kind: 'unsupported', message };
    }

    return { kind: status === 409 ? 'busy' : 'other', message };
};

export const fetchSoftware = async (uuid: string): Promise<SoftwareState> => {
    const state = unwrap<Partial<SoftwareState>>((await http.get(base(uuid))).data);
    const current = state.current as SoftwareCurrent | undefined;

    return {
        current: current ?? { type: null, minecraft: null, loader: null, egg_managed: false },
        types: state.types ?? [],
        operation: state.operation ?? null,
        modpack: state.modpack ?? null,
    };
};

export const fetchSoftwareCatalog = async (
    uuid: string,
    type: string,
    includeSnapshots: boolean,
    minecraft: string | null
): Promise<SoftwareCatalog> => {
    const body = unwrap<Partial<SoftwareCatalog>>(
        (
            await http.get(`${base(uuid)}/catalog`, {
                params: {
                    type,
                    include_snapshots: includeSnapshots ? 1 : undefined,
                    minecraft: minecraft ?? undefined,
                },
            })
        ).data
    );

    return { minecraft: body.minecraft ?? [], loaders: body.loaders ?? {} };
};

export const fetchSoftwareOperation = async (uuid: string, id: number | string): Promise<InstallOperation> =>
    unwrap<InstallOperation>((await http.get(`${base(uuid)}/operations/${id}`)).data);

export const useSoftware = (uuid: string, enabled = true) =>
    useQuery({
        queryKey: softwareStateQueryKey(uuid),
        queryFn: () => fetchSoftware(uuid),
        enabled: enabled && uuid.length > 0,
        retry: false,
    });

/** `minecraft` asks for the builds of one version, which Paper, Purpur and Folia list only then. */
export const useSoftwareCatalog = (
    uuid: string,
    type: string | null,
    includeSnapshots: boolean,
    minecraft: string | null = null
) =>
    useQuery({
        queryKey: softwareCatalogQueryKey(uuid, type ?? '', includeSnapshots, minecraft),
        queryFn: () => fetchSoftwareCatalog(uuid, type ?? '', includeSnapshots, minecraft),
        enabled: uuid.length > 0 && type !== null,
        staleTime: 5 * 60_000,
        retry: false,
    });

/** Polls an operation every two seconds while it runs; `id` is null when nothing is running. */
export const useSoftwareOperation = (uuid: string, id: number | string | null) => {
    const queryClient = useQueryClient();
    const query = useQuery({
        queryKey: softwareOperationQueryKey(uuid, id ?? ''),
        queryFn: () => fetchSoftwareOperation(uuid, id ?? ''),
        enabled: uuid.length > 0 && id !== null,
        refetchInterval: (current) =>
            current.state.data && !isActiveOperation(current.state.data) ? false : OPERATION_POLL_MS,
        retry: false,
    });
    const settled = useRef<string | null>(null);
    const data = query.data;

    // The operation finished: the server's software, and its latest operation, are new.
    useEffect(() => {
        if (!data || isActiveOperation(data) || settled.current === String(data.id)) {
            return;
        }

        settled.current = String(data.id);
        queryClient.setQueryData<SoftwareState>(softwareStateQueryKey(uuid), (state) =>
            state ? { ...state, operation: data } : state
        );
        void queryClient.invalidateQueries({ queryKey: softwareStateQueryKey(uuid) });

        if (data.status === 'succeeded') {
            toast.success('Install finished.');
        } else {
            toast.error(data.error ?? 'The install failed.');
        }
    }, [data, queryClient, uuid]);

    return query;
};

/** Shows an operation the API just started as the latest one, so the page starts polling it. */
export const seedOperation = (queryClient: QueryClient, uuid: string, operation: InstallOperation) => {
    queryClient.setQueryData(softwareOperationQueryKey(uuid, operation.id), operation);
    queryClient.setQueryData<SoftwareState>(softwareStateQueryKey(uuid), (state) =>
        state ? { ...state, operation } : state
    );
    void queryClient.invalidateQueries({ queryKey: softwareStateQueryKey(uuid) });
};

/** A POST that starts an operation (202). */
export const useStartOperation = <TInput>(
    uuid: string,
    run: (input: TInput) => Promise<InstallOperation | { attributes: InstallOperation }>,
    failure: string,
    describe: (cause: unknown) => string = codedMessage
) => {
    const queryClient = useQueryClient();
    const mutation = useMutation({
        mutationFn: async (input: TInput) => unwrap<InstallOperation>(await run(input)),
        onSuccess: (operation) => seedOperation(queryClient, uuid, operation),
        onError: (error) => notifyServerError(failure, { description: describe(error) }),
    });

    return { mutateAsync: (input: TInput) => mutation.mutateAsync(input), isPending: mutation.isPending };
};

export const useInstallSoftware = (uuid: string) =>
    useStartOperation(
        uuid,
        async (body: SoftwareInstallBody) => (await http.post(`${base(uuid)}/install`, body)).data,
        'Unable to install'
    );

export const useReinstallSoftware = (uuid: string) =>
    useStartOperation(uuid, async () => (await http.post(`${base(uuid)}/reinstall`)).data, 'Unable to reinstall');

export const useClearServerFiles = (uuid: string) =>
    useStartOperation(
        uuid,
        async (body: { keep_worlds: boolean; confirm: string }) => (await http.post(`${base(uuid)}/clear`, body)).data,
        'Unable to clear the server'
    );

export const useConvertSoftware = (uuid: string) => {
    const queryClient = useQueryClient();
    const mutation = useMutation({
        mutationFn: async () => unwrap<SoftwareCurrent>((await http.post(`${base(uuid)}/convert`)).data),
        onSuccess: (current) => {
            queryClient.setQueryData<SoftwareState>(softwareStateQueryKey(uuid), (state) =>
                state ? { ...state, current } : state
            );
            void queryClient.invalidateQueries({ queryKey: softwareStateQueryKey(uuid) });
            toast.success('The server now uses the Astrelyse Minecraft egg.');
        },
        onError: (error) => notifyServerError('Unable to convert', { description: codedMessage(error) }),
    });

    return { mutateAsync: () => mutation.mutateAsync(), isPending: mutation.isPending };
};
