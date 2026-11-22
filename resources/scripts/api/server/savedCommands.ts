import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    clientCreateASavedCommandMutation,
    clientDeleteASavedCommandMutation,
    clientListSavedCommandsOptions,
    clientReorderSavedCommandsMutation,
    clientUpdateASavedCommandMutation,
} from '@/api/generated/@tanstack/react-query.gen';
import type { ClientServerSavedCommandAttributes } from '@/api/generated';
import { notifyHttpError } from '@/plugins/notifications';

export type SavedCommand = ClientServerSavedCommandAttributes;

export interface SavedCommandInput {
    label: string;
    command: string;
    confirm: boolean;
}

const path = (uuid: string) => ({ server_uuid: uuid });

/** The pinned commands of a server, in display order. Needs the console permission. */
export const useSavedCommandsQuery = (uuid: string, enabled: boolean) =>
    useQuery({
        ...clientListSavedCommandsOptions({ path: path(uuid) }),
        select: (data): SavedCommand[] => data.data.map((resource) => resource.attributes),
        enabled: enabled && uuid.length > 0,
    });

/** Create, update, delete and reorder; each refreshes the list. */
export const useSavedCommandMutations = (uuid: string) => {
    const queryClient = useQueryClient();
    const refresh = () =>
        queryClient.invalidateQueries({ queryKey: clientListSavedCommandsOptions({ path: path(uuid) }).queryKey });

    const create = useMutation({
        ...clientCreateASavedCommandMutation(),
        onSuccess: refresh,
        onError: (error) => notifyHttpError(error, 'Unable to save the command'),
    });
    const update = useMutation({
        ...clientUpdateASavedCommandMutation(),
        onSuccess: refresh,
        onError: (error) => notifyHttpError(error, 'Unable to save the command'),
    });
    const remove = useMutation({
        ...clientDeleteASavedCommandMutation(),
        onSuccess: refresh,
        onError: (error) => notifyHttpError(error, 'Unable to save the command'),
    });
    const reorder = useMutation({
        ...clientReorderSavedCommandsMutation(),
        onSuccess: refresh,
        onError: (error) => notifyHttpError(error, 'Unable to save the command'),
    });

    return {
        pending: create.isPending || update.isPending || remove.isPending || reorder.isPending,
        create: (body: SavedCommandInput) => create.mutateAsync({ path: path(uuid), body }),
        update: (id: number, body: SavedCommandInput) =>
            update.mutateAsync({ path: { ...path(uuid), savedCommand: id }, body }),
        remove: (id: number) => remove.mutateAsync({ path: { ...path(uuid), savedCommand: id } }),
        reorder: (ids: number[]) => reorder.mutateAsync({ path: path(uuid), body: { ids } }),
    };
};
