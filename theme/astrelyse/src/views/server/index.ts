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

import { lazyView, type ThemeDefinition } from '@pterodactyl/sdk/theme';

/**
 * Server stream: databases, schedules, users, backups, network, startup, settings, activity and server.conflict views.
 * This stream owns this folder and registers its views here; theme.tsx spreads the three registries.
 * Wrap every page and block in lazyView(() => import('./…')) so its code loads when first shown.
 */
export const serverViews: NonNullable<ThemeDefinition['views']> = {
    'page.server.databases': lazyView(() => import('./pages'), 'DatabasesPage'),
    'page.server.backups': lazyView(() => import('./pages'), 'BackupsPage'),
    'page.server.schedules': lazyView(() => import('./pages'), 'SchedulesPage'),
    'page.server.schedules.detail': lazyView(() => import('./pages'), 'ScheduleDetailPage'),
    'page.server.users': lazyView(() => import('./pages'), 'UsersPage'),
    'page.server.users.create': lazyView(() => import('./pages'), 'CreateSubuserPage'),
    'page.server.network': lazyView(() => import('./pages'), 'NetworkPage'),
    'page.server.startup': lazyView(() => import('./pages'), 'StartupPage'),
    'page.server.settings': lazyView(() => import('./pages'), 'SettingsPage'),
    'page.server.activity': lazyView(() => import('./pages'), 'ServerActivityPage'),
    'server.sftp': lazyView(() => import('./settings'), 'ServerSftp'),
    'server.debug': lazyView(() => import('./settings'), 'ServerDebug'),
    'server.rename': lazyView(() => import('./settings'), 'ServerRename'),
    'server.ports': lazyView(() => import('./ports'), 'ServerPorts'),
    'server.reinstall': lazyView(() => import('./settings'), 'ServerReinstall'),
    'server.startup.command': lazyView(() => import('./startup'), 'StartupCommand'),
    'server.startup.image': lazyView(() => import('./startup'), 'StartupImage'),
    'server.startup.variables': lazyView(() => import('./startup'), 'StartupVariables'),
    'server.conflict': lazyView(() => import('./conflict'), 'ServerConflict'),
};

/* ― Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse ― */
