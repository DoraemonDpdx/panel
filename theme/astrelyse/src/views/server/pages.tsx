/*
 * ==========================================================================
 *  ____  ____  ____  __  __
 * |  _ \|  _ \|  _ \ \ \/ /
 * | | | | |_) | | | | \  /
 * | |_| |  __/| |_| | /  \
 * |____/|_|   |____/ /_/\_\
 *
 * BUILT BY  DPDX DEVELOPMENT  ·  BENGALURU, INDIA  ·  dpdx.in
 * BUILT FOR ASTRELYSE
 * ==========================================================================
 *
 * PROPRIETARY & CONFIDENTIAL. This file belongs to DPDX. A customer who receives
 * it inside a site, panel theme or bot built and shipped by DPDX may run it as
 * delivered, but does not own it, and no right to copy, modify, resell or reuse
 * it elsewhere is granted without prior written authorisation from DPDX.
 */

import { ArrowLeft } from 'lucide-react';
import { Icon, PanelLink, Spinner } from '@pterodactyl/sdk';
import { Slot, View, type ViewProps } from '@pterodactyl/sdk/theme';
import { Frame, Status } from './Frame';

/*
 * The ten server pages. Classic draws a page as a bare title plus its blocks; here each gets a heading and a line of
 * purpose, and the blocks are stacked with one rhythm. The blocks themselves are untouched unless server/blocks says
 * otherwise. Engine slots (server.<page>.before/after) are rendered by the engine around the page, so nothing here
 * can drop them.
 */

export function DatabasesPage({ model, className }: ViewProps<'page.server.databases'>) {
    return (
        <Status model={model} className={className}>
            <Frame title='Databases' description='MySQL databases your server and its plugins can connect to.' className={className}>
                <View name='server.databases' />
            </Frame>
        </Status>
    );
}

export function BackupsPage({ model, className }: ViewProps<'page.server.backups'>) {
    return (
        <Status model={model} className={className}>
            <Frame title='Backups' description='Snapshots of this server’s files. Restore one to roll back.' className={className}>
                <View name='server.backups' />
            </Frame>
        </Status>
    );
}

export function SchedulesPage({ model, className }: ViewProps<'page.server.schedules'>) {
    return (
        <Status model={model} className={className}>
            <Frame title='Schedules' description='Run commands, power actions and backups on a timer.' className={className}>
                <View name='server.schedules' />
            </Frame>
        </Status>
    );
}

/** The schedule is its own header (name, state, cron, actions), so this page adds no heading above it. */
export function ScheduleDetailPage({ model, className }: ViewProps<'page.server.schedules.detail'>) {
    return (
        <Status model={model} className={className}>
            <Frame title='Schedules' heading={null} className={className}>
                <View name='server.schedule' className='srv-schedule'>
                    <View name='server.schedule.tasks' className='rounded-t-none' />
                </View>
            </Frame>
        </Status>
    );
}

export function UsersPage({ model, className }: ViewProps<'page.server.users'>) {
    return (
        <Status model={model} className={className}>
            <Frame title='Users' description='People you have given access to this server, and what they can do.' className={className}>
                <View name='server.subusers' />
            </Frame>
        </Status>
    );
}

/** The form carries its own title and Save button, so the page only adds the way back. */
export function CreateSubuserPage({ model, className }: ViewProps<'page.server.users.create'>) {
    return (
        <Frame title='Create Subuser' heading={null} className={className}>
            <PanelLink
                destination={{ to: '/server/$id/users', params: { id: model.serverId } }}
                className='srv-back'
            >
                <Icon icon={ArrowLeft} />
                Back to users
            </PanelLink>
            {model.loading ? (
                <div aria-busy='true'>
                    <Spinner size='large' centered />
                </div>
            ) : (
                <View name='server.subuserForm' className='srv-perms' />
            )}
        </Frame>
    );
}

export function NetworkPage({ model, className }: ViewProps<'page.server.network'>) {
    return (
        <Status model={model} className={className}>
            <Frame title='Network' description='The addresses and ports this server listens on.' className={className}>
                <View name='server.allocations' />
            </Frame>
        </Status>
    );
}

/** Command and image side by side, the variables below. `server.startup.form` is this page's own slot. */
export function StartupPage({ model, className }: ViewProps<'page.server.startup'>) {
    return (
        <Status model={model} className={className}>
            <Frame title='Startup Settings' heading='Startup' description='How the server starts, and the variables it starts with.' className={className}>
                {model.slot && <Slot name='server.startup.form' data={model.slot} />}
                <div className='srv-startup'>
                    <View name='server.startup.command' />
                    <View name='server.startup.image' />
                </div>
                <View name='server.startup.variables' />
            </Frame>
        </Status>
    );
}

/** Five separate cards: details, connection, debug, ports and environment and, last and set apart, reinstall. */
export function SettingsPage({ className }: ViewProps<'page.server.settings'>) {
    return (
        <Frame title='Settings' description='Rename the server, connect over SFTP, or start over.' className={className}>
            <div className='srv-settings'>
                <div className='srv-col'>
                    <View name='server.rename' />
                    <View name='server.debug' />
                </div>
                <div className='srv-col'>
                    <View name='server.sftp' />
                    <View name='server.ports' />
                    <View name='server.reinstall' />
                </div>
            </div>
        </Frame>
    );
}

export function ServerActivityPage({ className }: ViewProps<'page.server.activity'>) {
    return (
        <Frame title='Activity Log' heading='Activity' description='Who did what on this server, newest first.' className={className}>
            <View name='activity.log' scope='server' />
        </Frame>
    );
}

/* ― Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse ― */
