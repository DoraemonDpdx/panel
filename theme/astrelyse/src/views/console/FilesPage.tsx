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

import { ServerContentBlock, ServerError } from '@pterodactyl/sdk';
import { Slot, View, type ViewProps } from '@pterodactyl/sdk/theme';

/**
 * The file manager page. The manager keeps its toolbar up and shows its own placeholder while each directory
 * lists, so only a failure replaces the page.
 */
export default function FilesPage({ model, className }: ViewProps<'page.server.files'>) {
    if (model.error !== null) {
        return <ServerError message={model.error} onRetry={model.retry} className={className} />;
    }

    return (
        <ServerContentBlock title='File Manager' className={className}>
            <Slot name='server.files.before' />
            <View name='server.files.manager' />
            <Slot name='server.files.after' />
        </ServerContentBlock>
    );
}

/* ― Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse ― */
