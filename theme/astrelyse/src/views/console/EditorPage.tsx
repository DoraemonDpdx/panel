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

import { ErrorBoundary, PageContentBlock, ServerError, Spinner } from '@pterodactyl/sdk';
import { View, type ViewProps } from '@pterodactyl/sdk/theme';
import Breadcrumbs from './files/Breadcrumbs';

/** The editor page: the path above, the editor frame below. A failed load replaces both with the engine's error. */
export default function EditorPage({ model, className }: ViewProps<'page.server.files.editor'>) {
    if (model.error !== null) {
        return <ServerError message={model.error} onBack={model.back} className={className} />;
    }

    return (
        <PageContentBlock className={className}>
            <ErrorBoundary>
                <div className='mb-3'>
                    <Breadcrumbs crumbs={model.breadcrumbs} file={model.file} />
                </div>
            </ErrorBoundary>
            {model.loading ? (
                <div className='mat grid min-h-64 place-items-center rounded-3xl' aria-busy>
                    <Spinner size='large' centered />
                </div>
            ) : (
                <View name='server.files.editor' />
            )}
        </PageContentBlock>
    );
}

/* ― Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse ― */
