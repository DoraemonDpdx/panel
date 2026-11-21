import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useCurrentUser } from '@/api/account/queries';
import { accountServersQueryOptions } from '@/api/account/servers/queries';
import { createServerBackupInput, useCreateServerBackup } from '@/api/server/backups/queries';
import { sendPowerActionInput, useSendPowerAction } from '@/api/server/power/queries';
import { selectServerPermissions, useCurrentServer } from '@/api/server/queries';
import { hasPermission } from '@/plugins/usePermissions';
import { usePanelNavigate, type PanelDestination } from '@/sdk/navigation';
import { useNavigation } from '@/views/navigation';
import { runPaletteAction } from './actions';
import type { PaletteAction, PaletteItem } from './search';

const POWER = [
    { signal: 'start', label: 'Start', permission: 'control.start' },
    { signal: 'stop', label: 'Stop', permission: 'control.stop' },
    { signal: 'restart', label: 'Restart', permission: 'control.restart' },
] as const;

/** Everything the palette can offer right now, and the function that runs a chosen item. */
export function usePaletteItems(open: boolean) {
    const { uuid: userId } = useCurrentUser();
    const navigate = usePanelNavigate();
    const current = useCurrentServer();
    const serverNav = useNavigation('server');
    const accountNav = useNavigation('account');
    const { data: servers } = useQuery({ ...accountServersQueryOptions(), enabled: open });
    const power = useSendPowerAction();
    const backup = useCreateServerBackup();

    const items = useMemo<PaletteItem[]>(() => {
        const list: PaletteItem[] = [];
        const currentUuid = current?.attributes.uuid;
        const known = servers?.data ?? [];

        for (const { attributes } of known) {
            list.push({
                id: `server:${attributes.uuid}`,
                kind: 'server',
                label: attributes.name,
                hint: attributes.node,
                keywords: attributes.identifier,
                action: {
                    type: 'navigate',
                    destination: { to: '/server/$id', params: { id: attributes.identifier } },
                },
            });
        }

        const page = (id: string, label: string, destination: PanelDestination, hint?: string): PaletteItem => ({
            id,
            kind: 'page',
            label,
            hint,
            action: { type: 'navigate', destination },
        });

        list.push(page('page:dashboard', 'Dashboard', { to: '/' }));

        // Tabs of the current server only, already filtered by its workload profile.
        if (current) {
            for (const item of serverNav.items) {
                list.push(page(`page:server:${item.id}`, item.label, item.destination, current.attributes.name));
            }
        }

        for (const item of accountNav.items) {
            list.push(page(`page:account:${item.id}`, item.label, item.destination, 'Account'));
        }

        const serverActions = (uuid: string, name: string, permissions: readonly string[]) => {
            const idle = uuid === currentUuid;
            const make = (id: string, label: string, action: PaletteAction): PaletteItem => ({
                id,
                kind: 'action',
                label,
                hint: name,
                keywords: label.toLowerCase(),
                showWhenIdle: idle,
                action,
            });

            for (const { signal, label, permission } of POWER) {
                if (hasPermission(permissions, permission)) {
                    list.push(
                        make(`action:${signal}:${uuid}`, `${label} server`, { type: 'power', uuid, signal, name })
                    );
                }
            }

            if (hasPermission(permissions, 'backup.create')) {
                list.push(make(`action:backup:${uuid}`, 'Back up server', { type: 'backup', uuid, name }));
            }
        };

        if (current) {
            serverActions(current.attributes.uuid, current.attributes.name, selectServerPermissions(current));
        }

        for (const server of known) {
            if (server.attributes.uuid !== currentUuid) {
                serverActions(
                    server.attributes.uuid,
                    server.attributes.name,
                    server.meta?.is_server_owner
                        ? ['*']
                        : ((server.meta as { user_permissions?: string[] } | undefined)?.user_permissions ?? [])
                );
            }
        }

        return list;
    }, [servers, current, serverNav.items, accountNav.items]);

    const run = (item: PaletteItem) =>
        runPaletteAction(item.action, {
            navigate,
            sendPower: (uuid, signal) => power.mutate({ ...sendPowerActionInput(uuid, signal) }),
            createBackup: (uuid) => backup.mutate(createServerBackupInput(uuid, { isLocked: false })),
            notify: (message) => toast.success(message),
        });

    return { userId, items, run };
}
