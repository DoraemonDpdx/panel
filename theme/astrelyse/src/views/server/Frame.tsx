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

import type { ReactNode } from 'react';
import { PageHeading, ServerContentBlock, ServerError, Spinner } from '@pterodactyl/sdk';
import type { PageStatusModel } from '@pterodactyl/sdk/theme';

/** A page's error with a retry, or a spinner while its data loads, in place of the page. Nothing else animates. */
export function Status({ model, className, children }: { model: PageStatusModel; className?: string; children: ReactNode }) {
    if (model.error !== null) {
        return <ServerError message={model.error} onRetry={model.retry} className={className} />;
    }

    if (model.loading) {
        return (
            <div className={className} aria-busy='true'>
                <Spinner size='large' centered />
            </div>
        );
    }

    return children;
}

/**
 * The frame every server page shares: the document title, one heading with a line saying what the page is for, then
 * the page's blocks stacked with one rhythm. A block places its own primary action (New database, New backup, …) in
 * the toolbar directly under the heading, so it is always in the same place, top right of its list.
 */
export function Frame({
    title,
    description,
    heading = title,
    className,
    children,
}: {
    title: string;
    description?: string;
    heading?: string | null;
    className?: string;
    children: ReactNode;
}) {
    return (
        <ServerContentBlock title={title} className={className}>
            {heading && <PageHeading title={heading} description={description} className='srv-heading' />}
            <div className='srv-stack'>{children}</div>
        </ServerContentBlock>
    );
}

/* ― Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse ― */
