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

import { cn } from '@pterodactyl/sdk';
import { View, type ViewProps } from '@pterodactyl/sdk/theme';

/**
 * The file manager in one material frame: path and actions on top, the rows beneath as plain fills. The pieces are
 * views of their own, so they are placed here exactly as classic places them. The bottom margin keeps the last rows
 * clear of the selection bar, which is always the same size so nothing shifts when it appears.
 */
export default function FileManager({ className, model }: ViewProps<'server.files.manager'>) {
    return (
        <section
            aria-label='File manager'
            aria-busy={model.loading || model.refreshing}
            className={cn('ast-files mat mb-20 min-w-0 rounded-3xl p-3 sm:p-4', className)}
        >
            <View name='server.files.manager.toolbar' model={model} />
            <View name='server.files.manager.list' model={model} />
            <View name='server.files.manager.selection' model={model} />
        </section>
    );
}

/* ― Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse ― */
