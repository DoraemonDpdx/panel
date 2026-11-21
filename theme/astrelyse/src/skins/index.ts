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

import type { ThemeSkins } from '@pterodactyl/sdk/theme';
import { buttonSkins } from './buttons';
import { dataSkins } from './data';
import { feedbackSkins } from './feedback';
import { formSkins } from './forms';
import { overlaySkins } from './overlays';
import { surfaceSkins } from './surfaces';
import { workspaceSkins } from './workspace';

/**
 * Every primitive this theme skins. The UI kit stream owns this folder: one file per classic skin file
 * (buttons, surfaces, forms, overlays, data, feedback), each exporting a `…Skins` object spread in here.
 * `npx pterodactyl-theme skins <Primitive>` copies classic's recipe to start from.
 */
export const skins: ThemeSkins = {
    ...buttonSkins,
    ...surfaceSkins,
    ...formSkins,
    ...overlaySkins,
    ...dataSkins,
    ...feedbackSkins,
    ...workspaceSkins,
};

/* ― Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse ― */
