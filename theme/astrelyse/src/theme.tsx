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

import { defineTheme } from '@pterodactyl/sdk/theme';
import { startCursor } from './cursor';
import { startLens } from './lens';
import { skins } from './skins';
import { adminViews } from './views/admin';
import { consoleViews } from './views/console';
import { serverViews } from './views/server';
import { shellViews } from './views/shell';

// The panel loads this entry before its first render, on the sign-in pages too, so the light, the pointer glow and
// the refraction lens are running before any glass appears. It does nothing outside a browser.
startLens();
// The liquid glass pointer (fine pointers only); it follows the same "Refraction lens" setting.
startCursor();

/**
 * Astrelyse Liquid Glass. Skins restyle the UI kit; each stream registers its views in its own folder so the streams
 * never edit the same file. Contract: ../../PANEL_DESIGN.md.
 */
export default defineTheme({
    ui: skins,
    views: { ...shellViews, ...consoleViews, ...serverViews, ...adminViews },
});

/* ― Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse ― */
