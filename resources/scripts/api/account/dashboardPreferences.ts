import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { client } from '@/api/generated/client.gen';
import { notifyHttpError } from '@/plugins/notifications';
import {
    DEFAULT_DASHBOARD_PREFERENCES,
    normalizePreferences,
    type DashboardPreferences,
    type RawDashboardPreferences,
} from '@/views/dashboardList';

const URL = '/api/client/account/dashboard-preferences';

export const dashboardPreferencesQueryKey = ['account', 'dashboard-preferences'] as const;

interface PreferencesResponse {
    attributes?: RawDashboardPreferences;
}

export const dashboardPreferencesQueryOptions = () =>
    queryOptions({
        queryKey: dashboardPreferencesQueryKey,
        queryFn: async ({ signal }): Promise<DashboardPreferences> => {
            const { data } = await client.get<PreferencesResponse>({ url: URL, signal });

            return normalizePreferences((data as PreferencesResponse | undefined)?.attributes);
        },
        staleTime: Infinity,
    });

/** The saved preferences; the defaults until they load, so the dashboard never waits on them. */
export const useDashboardPreferences = (): DashboardPreferences =>
    useQuery(dashboardPreferencesQueryOptions()).data ?? DEFAULT_DASHBOARD_PREFERENCES;

/** Saves a change optimistically: the dashboard updates at once and rolls back if the request fails. */
export const useUpdateDashboardPreferences = () => {
    const queryClient = useQueryClient();

    return useMutation({
        // TODO: use the generated mutation once `npm run api:refresh` can run (the checkout has unresolved merge conflicts).
        // oxlint-disable-next-line rules/generated-api-mutations
        mutationFn: async (patch: Partial<DashboardPreferences>) => {
            const { data } = await client.put<PreferencesResponse>({
                url: URL,
                body: patch,
                headers: { 'Content-Type': 'application/json' },
            });

            return normalizePreferences((data as PreferencesResponse | undefined)?.attributes);
        },
        onMutate: async (patch) => {
            await queryClient.cancelQueries({ queryKey: dashboardPreferencesQueryKey });
            const previous = queryClient.getQueryData<DashboardPreferences>(dashboardPreferencesQueryKey);

            queryClient.setQueryData<DashboardPreferences>(dashboardPreferencesQueryKey, {
                ...(previous ?? DEFAULT_DASHBOARD_PREFERENCES),
                ...patch,
            });

            return { previous };
        },
        onError: (error, _patch, context) => {
            queryClient.setQueryData(dashboardPreferencesQueryKey, context?.previous);
            notifyHttpError(error, 'Unable to save dashboard preferences');
        },
    });
};
