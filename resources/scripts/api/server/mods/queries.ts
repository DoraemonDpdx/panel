/* oxlint-disable no-restricted-properties, rules/generated-api-mutations -- The Mods endpoints are not in the generated client until `npm run sdk:generate` runs after the backend lands. */
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios, { type AxiosError } from 'axios';
import { toast } from 'sonner';
import http, { httpErrorToHuman } from '@/api/http';
import { isString } from '@/lib/objects';
import { notifyHttpError } from '@/plugins/notifications';
import {
    MOD_LOADERS,
    type InstalledList,
    type ModCategory,
    type ModProject,
    type InstalledMod,
    type ModDependency,
    type ModPlatform,
    type ModProjectType,
    type ModProviderName,
    type ModSearchMeta,
    type ModSearchPage,
    type ModSearchParams,
    type ModSearchResult,
    type ModSide,
    type ModSort,
    type ModVersion,
    type ModVersionParams,
    type ModsError,
    type ModsErrorKind,
} from './types';

// The shapes live in `types.ts` so the SDK's published view types do not pull in the query library.
export { MOD_LOADERS };
export type {
    InstalledList,
    ModCategory,
    ModProject,
    ModSide,
    InstalledMod,
    ModDependency,
    ModPlatform,
    ModProjectType,
    ModProviderName,
    ModSearchMeta,
    ModSearchPage,
    ModSearchParams,
    ModSearchResult,
    ModSort,
    ModVersion,
    ModVersionParams,
    ModsError,
    ModsErrorKind,
};

export const SEARCH_PAGE_SIZE = 20;

interface ErrorBody {
    error?: unknown;
    page_url?: unknown;
}

const bodyString = (data: ErrorBody | undefined, key: keyof ErrorBody): string | undefined => {
    const value = data?.[key];

    return isString(value) ? value : undefined;
};

const outage = (cause: AxiosError): ModsError => {
    const detail = cause.response ? httpErrorToHuman(cause) : '';

    return {
        kind: 'unavailable',
        message: detail && !detail.startsWith('Request failed') ? detail : 'The mod source could not be reached.',
    };
};

/** The API's coded refusals: 409 `mods_unsupported` and `provider_unavailable`, and 422 `not_distributable`. */
const codedError = (status: number | undefined, data: ErrorBody | undefined): ModsError | null => {
    const code = bodyString(data, 'error');

    if (status === 409 && code === 'mods_unsupported') {
        return { kind: 'unsupported', message: 'This server does not support mods or plugins.' };
    }

    if (status === 409 && code === 'provider_unavailable') {
        return { kind: 'other', message: 'This source is not available on this panel.' };
    }

    if (status === 422 && code === 'not_distributable') {
        return {
            kind: 'not_distributable',
            message: 'This file cannot be installed from the panel.',
            pageUrl: bodyString(data, 'page_url'),
        };
    }

    return null;
};

/** The coded refusals and source outages (5xx or no response) are told apart; anything else keeps the API's message. */
export const modsError = (cause: unknown): ModsError => {
    if (axios.isAxiosError(cause)) {
        const coded = codedError(cause.response?.status, cause.response?.data as ErrorBody | undefined);

        if (coded) {
            return coded;
        }

        if (cause.response === undefined || cause.response.status >= 500) {
            return outage(cause);
        }
    }

    return { kind: 'other', message: httpErrorToHuman(cause) };
};

const base = (uuid: string) => `/api/client/servers/${uuid}/mods`;

export const modsQueryKey = (uuid: string) => ['server', uuid, 'mods'] as const;
export const modsPlatformQueryKey = (uuid: string) => [...modsQueryKey(uuid), 'platform'] as const;
export const modsSearchQueryKey = (uuid: string, params?: ModSearchParams) =>
    params ? ([...modsQueryKey(uuid), 'search', params] as const) : ([...modsQueryKey(uuid), 'search'] as const);
export const modVersionsQueryKey = (uuid: string, projectId: string, params: ModVersionParams) =>
    [...modsQueryKey(uuid), 'versions', projectId, params] as const;
export const installedModsQueryKey = (uuid: string) => [...modsQueryKey(uuid), 'installed'] as const;

/** The loader is never sent: the panel matches the server's detected loader itself. */
const filters = (provider: ModProviderName, gameVersion: string | null) => ({
    provider,
    game_version: gameVersion ?? undefined,
});

export const fetchModsPlatform = async (uuid: string): Promise<ModPlatform> =>
    (await http.get<{ attributes: ModPlatform }>(`${base(uuid)}/platform`)).data.attributes;

export const fetchModSearch = async (uuid: string, params: ModSearchParams, offset: number): Promise<ModSearchPage> =>
    (
        await http.get<ModSearchPage>(`${base(uuid)}/search`, {
            params: {
                query: params.query || undefined,
                ...filters(params.provider, params.gameVersion),
                category: params.category ?? undefined,
                sort: params.sort,
                offset,
                limit: SEARCH_PAGE_SIZE,
            },
        })
    ).data;

export const fetchModVersions = async (
    uuid: string,
    projectId: string,
    params: ModVersionParams
): Promise<ModVersion[]> =>
    (
        await http.get<{ data: ModVersion[] }>(`${base(uuid)}/projects/${encodeURIComponent(projectId)}/versions`, {
            params: filters(params.provider, params.gameVersion),
        })
    ).data.data;

export const modProjectQueryKey = (uuid: string, provider: ModProviderName, projectId: string) =>
    [...modsQueryKey(uuid), 'project', provider, projectId] as const;
export const modCategoriesQueryKey = (uuid: string, provider: ModProviderName) =>
    [...modsQueryKey(uuid), 'categories', provider] as const;

export const fetchModProject = async (
    uuid: string,
    provider: ModProviderName,
    projectId: string
): Promise<ModProject> =>
    (
        await http.get<{ attributes: ModProject }>(`${base(uuid)}/projects/${encodeURIComponent(projectId)}`, {
            params: { provider },
        })
    ).data.attributes;

export const fetchModCategories = async (uuid: string, provider: ModProviderName): Promise<ModCategory[]> => {
    const body = (await http.get<{ data?: ModCategory[] }>(`${base(uuid)}/categories`, { params: { provider } })).data;

    return Array.isArray(body.data) ? body.data : [];
};

export const fetchInstalledMods = async (uuid: string): Promise<InstalledList> => {
    const body = (
        await http.get<{ data: InstalledMod[]; meta?: { disk_unavailable?: boolean } }>(`${base(uuid)}/installed`)
    ).data;

    return { data: body.data, diskUnavailable: body.meta?.disk_unavailable === true };
};

export const useModsPlatform = (uuid: string, enabled = true) =>
    useQuery({
        queryKey: modsPlatformQueryKey(uuid),
        queryFn: () => fetchModsPlatform(uuid),
        enabled: enabled && uuid.length > 0,
        staleTime: 5 * 60_000,
        retry: false,
    });

export const useModSearch = (uuid: string, params: ModSearchParams, enabled = true) =>
    useInfiniteQuery({
        queryKey: modsSearchQueryKey(uuid, params),
        queryFn: ({ pageParam }) => fetchModSearch(uuid, params, pageParam),
        initialPageParam: 0,
        getNextPageParam: (last, pages) => {
            const loaded = pages.reduce((count, page) => count + page.data.length, 0);

            return last.data.length > 0 && loaded < last.meta.total ? loaded : undefined;
        },
        enabled: enabled && uuid.length > 0,
        retry: false,
    });

export const useModVersions = (uuid: string, projectId: string | null, params: ModVersionParams) =>
    useQuery({
        queryKey: modVersionsQueryKey(uuid, projectId ?? '', params),
        queryFn: () => fetchModVersions(uuid, projectId ?? '', params),
        enabled: uuid.length > 0 && projectId !== null,
        retry: false,
    });

/** The project's detail; a failure leaves the drawer on what the search row already said. */
export const useModProject = (uuid: string, provider: ModProviderName, projectId: string | null) =>
    useQuery({
        queryKey: modProjectQueryKey(uuid, provider, projectId ?? ''),
        queryFn: () => fetchModProject(uuid, provider, projectId ?? ''),
        enabled: uuid.length > 0 && projectId !== null,
        staleTime: 5 * 60_000,
        retry: false,
    });

export const useModCategories = (uuid: string, provider: ModProviderName, enabled = true) =>
    useQuery({
        queryKey: modCategoriesQueryKey(uuid, provider),
        queryFn: () => fetchModCategories(uuid, provider),
        enabled: enabled && uuid.length > 0,
        staleTime: 60 * 60_000,
        retry: false,
    });

export const useInstalledMods = (uuid: string, enabled = true) =>
    useQuery({
        queryKey: installedModsQueryKey(uuid),
        queryFn: () => fetchInstalledMods(uuid),
        enabled: enabled && uuid.length > 0,
        retry: false,
    });

const refreshInstalled = (queryClient: ReturnType<typeof useQueryClient>, uuid: string) =>
    Promise.all([
        queryClient.invalidateQueries({ queryKey: installedModsQueryKey(uuid) }),
        // The installed badge on each result.
        queryClient.invalidateQueries({ queryKey: modsSearchQueryKey(uuid) }),
    ]);

export interface InstallModInput {
    provider: ModProviderName;
    projectId: string;
    versionId: string;
    title?: string;
}

export const useInstallMod = (uuid: string) => {
    const queryClient = useQueryClient();
    const mutation = useMutation({
        mutationFn: async ({ provider, projectId, versionId }: InstallModInput) =>
            (
                await http.post<{ attributes: InstalledMod }>(`${base(uuid)}/install`, {
                    provider,
                    project_id: projectId,
                    version_id: versionId,
                })
            ).data.attributes,
        onSuccess: () => refreshInstalled(queryClient, uuid),
        // A file that may not be distributed is not an error: the drawer links to its page.
        onError: (error) => {
            if (modsError(error).kind !== 'not_distributable') {
                notifyHttpError(error, 'Unable to install');
            }
        },
    });

    return {
        mutateAsync: (input: InstallModInput) => mutation.mutateAsync(input),
        isPending: mutation.isPending,
        pendingVersion: mutation.isPending ? mutation.variables.versionId : null,
    };
};

const useInstalledMutation = <TInput, TResult>(
    uuid: string,
    run: (input: TInput) => Promise<TResult>,
    failure: string,
    success?: string
) => {
    const queryClient = useQueryClient();
    const mutation = useMutation({
        mutationFn: run,
        onSuccess: async () => {
            await refreshInstalled(queryClient, uuid);
            if (success) {
                toast.success(success);
            }
        },
        onError: (error) => notifyHttpError(error, failure),
    });

    return { mutateAsync: (input: TInput) => mutation.mutateAsync(input) };
};

export const useRemoveMod = (uuid: string) =>
    useInstalledMutation(
        uuid,
        async (filename: string) => {
            await http.post(`${base(uuid)}/installed/delete`, { filename });
        },
        'Unable to remove'
    );

/** Removes the panel's record of a file that is gone from disk. */
export const useRemoveModEntry = (uuid: string) =>
    useInstalledMutation(
        uuid,
        async (id: number) => {
            await http.delete(`${base(uuid)}/installed/${id}`);
        },
        'Unable to remove the entry'
    );

export const useToggleMod = (uuid: string) =>
    useInstalledMutation(
        uuid,
        async ({ filename, enabled }: { filename: string; enabled: boolean }) =>
            (await http.post<{ attributes: InstalledMod }>(`${base(uuid)}/installed/toggle`, { filename, enabled }))
                .data.attributes,
        'Unable to change the file'
    );

export const useChangeModVersion = (uuid: string) =>
    useInstalledMutation(
        uuid,
        async ({ id, versionId, provider }: { id: number; versionId: string; provider: ModProviderName }) =>
            (
                await http.post<{ attributes: InstalledMod }>(`${base(uuid)}/installed/${id}/version`, {
                    version_id: versionId,
                    provider,
                })
            ).data.attributes,
        'Unable to change the version'
    );
