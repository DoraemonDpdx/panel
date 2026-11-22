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

import { useCallback, useState } from 'react';

/** Whether any tracked action is still running; rejections are swallowed, the panel having reported them. */
export function usePending(): [boolean, (action: Promise<unknown>) => void] {
    const [count, setCount] = useState(0);
    const track = useCallback((action: Promise<unknown>) => {
        setCount((current) => current + 1);
        void action.catch(() => {}).finally(() => setCount((current) => current - 1));
    }, []);

    return [count > 0, track];
}

/* ― Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse ― */
