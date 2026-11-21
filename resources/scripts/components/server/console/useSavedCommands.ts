import { useMemo } from 'react';
import { useCurrentServerUuid } from '@/api/server/queries';
import {
    useSavedCommandMutations,
    useSavedCommandsQuery,
    type SavedCommand,
    type SavedCommandInput,
} from '@/api/server/savedCommands';
import { SocketRequest } from '@/components/server/events';
import type { Websocket } from '@/plugins/Websocket';
import { usePermissions } from '@/plugins/usePermissions';

export interface ServerSavedCommands {
    /** The user has the console permission, so the pinned commands are theirs to use and manage. */
    readonly allowed: boolean;
    readonly loading: boolean;
    /** Pinned commands in display order. */
    readonly commands: readonly SavedCommand[];
    /** The websocket is down, so nothing can be sent. */
    readonly disabled: boolean;
    /** Sends a pinned command to the console; the caller asks first when `confirm` is set. */
    readonly run: (command: SavedCommand) => void;
    readonly manage: {
        readonly pending: boolean;
        readonly add: (input: SavedCommandInput) => Promise<unknown>;
        readonly edit: (id: number, input: SavedCommandInput) => Promise<unknown>;
        readonly remove: (id: number) => Promise<unknown>;
        /** Moves a command one place earlier (-1) or later (1). */
        readonly move: (id: number, direction: -1 | 1) => Promise<unknown>;
    };
}

/** The commands pinned to the server, shared with everyone who has the console permission. */
export function useSavedCommands(socket: Websocket | null, connected: boolean): ServerSavedCommands {
    const [allowed] = usePermissions(['control.console']);
    const uuid = useCurrentServerUuid() ?? '';
    const { data, isLoading } = useSavedCommandsQuery(uuid, allowed);
    const mutations = useSavedCommandMutations(uuid);
    const commands = data ?? [];

    return useMemo(
        () => ({
            allowed,
            loading: isLoading,
            commands,
            disabled: !socket || !connected,
            run: (command) => socket?.send(SocketRequest.SEND_COMMAND, command.command),
            manage: {
                pending: mutations.pending,
                add: mutations.create,
                edit: mutations.update,
                remove: mutations.remove,
                move: (id, direction) => {
                    const ids = commands.map((command) => command.id);
                    const from = ids.indexOf(id);
                    const to = from + direction;

                    if (from === -1 || to < 0 || to >= ids.length) {
                        return Promise.resolve();
                    }

                    ids.splice(to, 0, ...ids.splice(from, 1));

                    return mutations.reorder(ids);
                },
            },
        }),
        // `commands` is derived from `data`, so it is stable between fetches.
        // oxlint-disable-next-line react-hooks/exhaustive-deps
        [allowed, isLoading, data, socket, connected, mutations]
    );
}
