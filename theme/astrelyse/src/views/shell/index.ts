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

import type { ThemeDefinition } from '@pterodactyl/sdk/theme';
import { lazyView } from '@pterodactyl/sdk/theme';
import AuthLayout from './AuthLayout';
import ThinLayout from './ThinLayout';

/**
 * Shell stream: layout.app (top bar and menu), layout.auth, the thin layout.account (layout.admin lives in views/admin), the sign-in pages and the dashboard. Left to classic (its
 * skins carry the design): page.dashboard, page.account.*, account.*, app.search and activity.log.
 * Wrap every page and block in lazyView so its code loads when first shown; layout.auth stays eager.
 */
export const shellViews: NonNullable<ThemeDefinition['views']> = {
    'layout.app': lazyView(() => import('./AppLayout')),
    'layout.auth': AuthLayout,
    'layout.account': ThinLayout,
    'page.auth.login': lazyView(() => import('./AuthPages'), 'LoginPage'),
    'page.auth.password': lazyView(() => import('./AuthPages'), 'ForgotPasswordPage'),
    'page.auth.passwordReset': lazyView(() => import('./AuthPages'), 'ResetPasswordPage'),
    'page.auth.checkpoint': lazyView(() => import('./AuthPages'), 'CheckpointPage'),
    'dashboard.serverList': lazyView(() => import('./ServerList')),
    'dashboard.serverCard': lazyView(() => import('./ServerCard')),
    'dashboard.serverCard.identity': lazyView(() => import('./ServerCard'), 'ServerCardIdentity'),
    'dashboard.serverCard.address': lazyView(() => import('./ServerCard'), 'ServerCardAddress'),
    'dashboard.serverCard.metrics': lazyView(() => import('./ServerCard'), 'ServerCardMetrics'),
};

/* ― Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse ― */
