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

import { useCallback, type PointerEvent } from 'react';
import { Main, type ViewProps } from '@pterodactyl/sdk/theme';

/**
 * The admin pages are not views, so this layout is the only handle a theme has on them: it marks the area, and
 * `styles/admin.css` styles everything under `[data-ast-area='admin']`. The shell draws the navigation, so this only
 * places the page.
 *
 * Overview tiles are plain links that upstream gives no hook. The pointer glow is written onto them here, straight
 * from the event, exactly as lens.ts does for `.lq-touch`. It is caused by the pointer and never runs on its own.
 */
const TILE = "a[class~='bg-card']";

export default function AdminLayout({ children }: ViewProps<'layout.admin'>) {
    const glow = useCallback((event: PointerEvent<HTMLDivElement>) => {
        const tile = event.target instanceof Element ? event.target.closest<HTMLElement>(TILE) : null;

        if (!tile) {
            return;
        }

        const box = tile.getBoundingClientRect();

        tile.style.setProperty('--px', `${event.clientX - box.left}px`);
        tile.style.setProperty('--py', `${event.clientY - box.top}px`);
    }, []);

    return (
        <Main>
            <div data-ast-area='admin' onPointerMove={glow}>
                {children}
            </div>
        </Main>
    );
}

/* ― Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse ― */
