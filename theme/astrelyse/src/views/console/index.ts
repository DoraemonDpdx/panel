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
 * Console stream: layout.server, page.server.console, server.power, server.terminal, server.stats, server.graphs and the file manager and editor views.
 * Left classic on purpose: server.feature.* (dialogs, skinned by the UI kit) and server.files.editor.language (a Select).
 * This stream owns this folder and registers its views here; theme.tsx spreads the three registries.
 * Wrap every page and block in lazyView(() => import('./…')) so its code loads when first shown.
 */
export const consoleViews: NonNullable<ThemeDefinition['views']> = {
    'layout.server': lazyView(() => import('./ServerLayout')),
    'server.power': lazyView(() => import('./Power')),
    'page.server.console': lazyView(() => import('./ConsolePage')),
    'server.terminal': lazyView(() => import('./Terminal')),
    'server.stats': lazyView(() => import('./Stats')),
    'server.graphs': lazyView(() => import('./Graphs')),
    'page.server.files': lazyView(() => import('./FilesPage')),
    'server.files.manager': lazyView(() => import('./FileManager')),
    'server.files.manager.toolbar': lazyView(() => import('./FileToolbar')),
    'server.files.manager.list': lazyView(() => import('./FileList')),
    'server.files.manager.selection': lazyView(() => import('./FileSelection')),
    'server.files.details': lazyView(() => import('./FileDetails')),
    'page.server.files.editor': lazyView(() => import('./EditorPage')),
    'server.files.editor': lazyView(() => import('./FileEditor')),
    'server.files.editor.notice': lazyView(() => import('./FileEditorPieces'), 'EditorNotice'),
    'server.files.editor.canvas': lazyView(() => import('./FileEditorPieces'), 'EditorCanvas'),
    'server.files.editor.actions': lazyView(() => import('./FileEditorPieces'), 'EditorActions'),
};

/* ― Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse ― */
