/* oxlint-disable no-restricted-properties -- The Content endpoints are not in the generated client until `npm run sdk:generate` runs after the backend lands. */
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import http from '@/api/http';
import { isObject, isString } from '@/lib/objects';
import { codedMessage, unwrap, useStartOperation } from '../software/queries';
import type {
    ContentError,
    ContentProvider,
    ContentSearchPage,
    ContentSearchParams,
    ContentVersion,
    ModpackImportInput,
    ModpackInstallInput,
    ModpackPreview,
    WorldImportInput,
    WorldInstallInput,
} from './types';

export * from './types';

export const CONTENT_PAGE_SIZE = 20;

const base = (uuid: string) => `/api/client/servers/${uuid}/content`;

export const contentQueryKey = (uuid: string) => ['server', uuid, 'content'] as const;
export const modpackSearchQueryKey = (uuid: string, params: ContentSearchParams) =>
    [...contentQueryKey(uuid), 'modpacks', 'search', params] as const;
export const modpackVersionsQueryKey = (uuid: string, provider: ContentProvider, projectId: string) =>
    [...contentQueryKey(uuid), 'modpacks', 'versions', provider, projectId] as const;
export const modpackPreviewQueryKey = (uuid: string, provider: ContentProvider, projectId: string, versionId: string) =>
    [...contentQueryKey(uuid), 'modpacks', 'preview', provider, projectId, versionId] as const;
export const worldSearchQueryKey = (uuid: string, params: ContentSearchParams) =>
    [...contentQueryKey(uuid), 'worlds', 'search', params] as const;
export const worldVersionsQueryKey = (uuid: string, projectId: string) =>
    [...contentQueryKey(uuid), 'worlds', 'versions', projectId] as const;

const bodyCode = (cause: unknown): string | undefined => {
    const data: unknown = axios.isAxiosError(cause) ? cause.response?.data : undefined;

    return isObject(data) && 'error' in data && isString(data.error) ? data.error : undefined;
};

/** The API's coded refusals, told apart; anything else keeps its own message. */
export const contentError = (cause: unknown): ContentError => {
    const code = bodyCode(cause);

    if (code === 'provider_unavailable') {
        return { kind: 'provider_unavailable', message: 'This source is not available on this panel.' };
    }

    if (code === 'client_only') {
        return { kind: 'client_only', message: "That content is client-only, so it can't be installed on a server." };
    }

    if (code === 'not_a_world') {
        return { kind: 'not_a_world', message: "That file isn't a Minecraft world: it has no level.dat." };
    }

    return { kind: 'other', message: codedMessage(cause) };
};

const describe = (cause: unknown) => contentError(cause).message;

const fetchSearch = async (uuid: string, kind: 'modpacks' | 'worlds', params: ContentSearchParams, offset: number) => {
    const page = (
        await http.get<ContentSearchPage>(`${base(uuid)}/${kind}/search`, {
            params: {
                provider: params.provider,
                query: params.query || undefined,
                sort: params.sort,
                offset,
                limit: CONTENT_PAGE_SIZE,
            },
        })
    ).data;

    return page;
};

const useSearch = (uuid: string, kind: 'modpacks' | 'worlds', params: ContentSearchParams, enabled: boolean) =>
    useInfiniteQuery({
        queryKey: kind === 'modpacks' ? modpackSearchQueryKey(uuid, params) : worldSearchQueryKey(uuid, params),
        queryFn: ({ pageParam }) => fetchSearch(uuid, kind, params, pageParam),
        initialPageParam: 0,
        getNextPageParam: (last, pages) => {
            const loaded = pages.reduce((count, page) => count + page.data.length, 0);

            return last.data.length > 0 && loaded < last.meta.total ? loaded : undefined;
        },
        enabled: enabled && uuid.length > 0,
        retry: false,
    });

export const useModpackSearch = (uuid: string, params: ContentSearchParams, enabled = true) =>
    useSearch(uuid, 'modpacks', params, enabled);

export const useWorldSearch = (uuid: string, params: ContentSearchParams, enabled = true) =>
    useSearch(uuid, 'worlds', params, enabled);

export const useModpackVersions = (uuid: string, provider: ContentProvider, projectId: string | null) =>
    useQuery({
        queryKey: modpackVersionsQueryKey(uuid, provider, projectId ?? ''),
        queryFn: async () =>
            (
                await http.get<{ data: ContentVersion[] }>(
                    `${base(uuid)}/modpacks/${provider}/${encodeURIComponent(projectId ?? '')}/versions`
                )
            ).data.data,
        enabled: uuid.length > 0 && projectId !== null,
        retry: false,
    });

/** A world's files; worlds come from CurseForge only. */
export const useWorldVersions = (uuid: string, projectId: string | null) =>
    useQuery({
        queryKey: worldVersionsQueryKey(uuid, projectId ?? ''),
        queryFn: async () =>
            (
                await http.get<{ data: ContentVersion[] }>(
                    `${base(uuid)}/worlds/curseforge/${encodeURIComponent(projectId ?? '')}/versions`
                )
            ).data.data,
        enabled: uuid.length > 0 && projectId !== null,
        retry: false,
    });

/** What installing the version would do; a POST that changes nothing. */
export const useModpackPreview = (
    uuid: string,
    provider: ContentProvider,
    projectId: string | null,
    versionId: string | null
) =>
    useQuery({
        queryKey: modpackPreviewQueryKey(uuid, provider, projectId ?? '', versionId ?? ''),
        queryFn: async () =>
            unwrap<ModpackPreview>(
                (
                    await http.post(`${base(uuid)}/modpacks/preview`, {
                        provider,
                        project_id: projectId,
                        version_id: versionId,
                    })
                ).data
            ),
        enabled: uuid.length > 0 && projectId !== null && versionId !== null,
        staleTime: 60_000,
        retry: false,
    });

export const useInstallModpack = (uuid: string) => {
    const queryClient = useQueryClient();
    const mutation = useStartOperation(
        uuid,
        async ({ provider, projectId, versionId, wipe }: ModpackInstallInput) =>
            (
                await http.post(`${base(uuid)}/modpacks/install`, {
                    provider,
                    project_id: projectId,
                    version_id: versionId,
                    wipe,
                })
            ).data,
        'Unable to install the modpack',
        describe
    );

    return {
        ...mutation,
        // The Installed tab of Mods lists what the pack installed.
        mutateAsync: async (input: ModpackInstallInput) => {
            const result = await mutation.mutateAsync(input);

            void queryClient.invalidateQueries({ queryKey: ['server', uuid, 'mods'] });

            return result;
        },
    };
};

export const useImportModpack = (uuid: string) =>
    useStartOperation(
        uuid,
        async ({ path, wipe }: ModpackImportInput) =>
            (await http.post(`${base(uuid)}/modpacks/import-local`, { path, wipe })).data,
        'Unable to import the modpack',
        describe
    );

export const useInstallWorld = (uuid: string) =>
    useStartOperation(
        uuid,
        async ({ projectId, fileId, mode, backup }: WorldInstallInput) =>
            (
                await http.post(`${base(uuid)}/worlds/install`, {
                    provider: 'curseforge',
                    project_id: projectId,
                    file_id: fileId,
                    mode,
                    backup,
                })
            ).data,
        'Unable to install the world',
        describe
    );

export const useImportWorld = (uuid: string) =>
    useStartOperation(
        uuid,
        async ({ path, mode, backup }: WorldImportInput) =>
            (await http.post(`${base(uuid)}/worlds/import-local`, { path, mode, backup })).data,
        'Unable to import the world',
        describe
    );
