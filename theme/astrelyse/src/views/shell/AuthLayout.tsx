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

import { AuthFrame } from '@pterodactyl/sdk';
import type { ViewProps } from '@pterodactyl/sdk/theme';

/** The sign-in pages sit in the website's own backdrop and shell, shared by every theme. */
export default function AuthLayout({ className, children }: ViewProps<'layout.auth'>) {
    return <AuthFrame className={className}>{children}</AuthFrame>;
}

/* ― Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse ― */
