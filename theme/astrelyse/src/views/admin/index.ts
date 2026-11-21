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
import AdminLayout from './AdminLayout';

/**
 * Admin stream: `layout.admin` only. The admin pages themselves are upstream's and are not views; they are reached
 * through this layout's wrapper, the UI kit skins and `styles/admin.css`. Eager, because it is a thin layout.
 */
export const adminViews: NonNullable<ThemeDefinition['views']> = {
    'layout.admin': AdminLayout,
};

/* ― Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse ― */
