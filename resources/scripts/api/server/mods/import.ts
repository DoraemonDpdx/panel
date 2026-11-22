/* oxlint-disable no-restricted-properties, rules/generated-api-mutations -- The content endpoints are not in the generated client until `npm run sdk:generate` runs after the backend lands. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import http from '@/api/http';
import { installedModsQueryKey, modsSearchQueryKey } from './queries';
import type { InstallOperation, PrismInstallItem, PrismItem, ResolvedLink } from './types';

/** Hooks for the Import tab. The endpoints live under `/content`, the operation under `/software`. */
const contentBase = (uuid: string) => `/api/client/servers/${uuid}/content`;
const operationPath = (uuid: string, id: number | string) =>
    `/api/client/servers/${uuid}/software/operations/${encodeURIComponent(String(id))}`;

export const OPERATION_POLL_MS = 2000;

/** The API wraps a resource as `{attributes}` in places and returns it bare in others; both are read. */
const unwrap = <T>(body: { attributes?: T } | T): T => (body as { attributes?: T }).attributes ?? (body as T);

export const operationQueryKey = (uuid: string, id: number | string | null) =>
    ['server', uuid, 'software', 'operations', id] as const;

export const useResolveLink = (uuid: string) =>
    useMutation({
        mutationFn: async (url: string): Promise<ResolvedLink> =>
            unwrap(
                (await http.post<{ attributes: ResolvedLink } | ResolvedLink>(`${contentBase(uuid)}/resolve`, { url }))
                    .data
            ),
    });

export const usePrismPreview = (uuid: string) =>
    useMutation({
        mutationFn: async (text: string): Promise<PrismItem[]> => {
            const body = (
                await http.post<{ data?: PrismItem[]; items?: PrismItem[] } | PrismItem[]>(
                    `${contentBase(uuid)}/import/prism/preview`,
                    { text }
                )
            ).data;

            if (Array.isArray(body)) {
                return body;
            }

            return body.data ?? body.items ?? [];
        },
    });

export const usePrismInstall = (uuid: string) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (items: PrismInstallItem[]): Promise<InstallOperation> =>
            unwrap(
                (
                    await http.post<{ attributes: InstallOperation } | InstallOperation>(
                        `${contentBase(uuid)}/import/prism/install`,
                        { items }
                    )
                ).data
            ),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: installedModsQueryKey(uuid) }),
    });
};

const running = (operation: InstallOperation | undefined) =>
    operation === undefined || operation.status === 'pending' || operation.status === 'running';

/** Polls an operation every 2 seconds until it succeeds or fails, then refreshes what it installed. */
export const useInstallOperation = (uuid: string, id: number | string | null) => {
    const queryClient = useQueryClient();

    return useQuery({
        queryKey: operationQueryKey(uuid, id),
        queryFn: async (): Promise<InstallOperation> => {
            const operation = unwrap(
                (await http.get<{ attributes: InstallOperation } | InstallOperation>(operationPath(uuid, id ?? '')))
                    .data
            );

            if (!running(operation)) {
                void queryClient.invalidateQueries({ queryKey: installedModsQueryKey(uuid) });
                void queryClient.invalidateQueries({ queryKey: modsSearchQueryKey(uuid) });
            }

            return operation;
        },
        enabled: uuid.length > 0 && id !== null,
        // A few failed polls in a row (a restarting node) are tolerated; after that the tray says it lost track.
        refetchInterval: (query) =>
            running(query.state.data) && query.state.errorUpdateCount < 5 ? OPERATION_POLL_MS : false,
        retry: false,
    });
};
