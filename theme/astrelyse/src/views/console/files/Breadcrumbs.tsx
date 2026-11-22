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

import { Fragment, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { PanelLink } from '@pterodactyl/sdk';
import type { FileBreadcrumb } from '@pterodactyl/sdk/theme';

const linkClass =
    'rounded-lg px-1.5 py-1 text-foreground no-underline transition-colors duration-[120ms] hover:bg-white/10';

interface Props {
    crumbs: readonly FileBreadcrumb[];
    /** The open file, after the crumbs. */
    file?: string | null;
    /** Shown before the path, such as the select-all checkbox. */
    children?: ReactNode;
}

const Sep = () => <ChevronRight aria-hidden className='size-3.5 shrink-0 text-muted-foreground' />;

/** The path above a listing or the editor. It scrolls sideways instead of wrapping, so the toolbar never changes height. */
export default function Breadcrumbs({ crumbs, file, children }: Props) {
    return (
        <nav aria-label='Path' className='flex min-w-0 items-center gap-1 text-sm text-muted-foreground'>
            {children}
            <ol className='ast-scroll flex min-w-0 items-center gap-0.5 overflow-x-auto whitespace-nowrap font-mono text-[13px]'>
                <li className='px-1.5 py-1'>home</li>
                {crumbs.map(({ name, path, destination }) => (
                    <Fragment key={path}>
                        <li aria-hidden className='flex'>
                            <Sep />
                        </li>
                        <li>
                            {destination ? (
                                <PanelLink destination={destination} className={linkClass}>
                                    {name}
                                </PanelLink>
                            ) : (
                                <span aria-current='page' className='px-1.5 py-1 text-foreground'>
                                    {name}
                                </span>
                            )}
                        </li>
                    </Fragment>
                ))}
                {file && (
                    <>
                        <li aria-hidden className='flex'>
                            <Sep />
                        </li>
                        <li aria-current='page' className='px-1.5 py-1 text-foreground'>
                            {file}
                        </li>
                    </>
                )}
            </ol>
        </nav>
    );
}

/* ― Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse ― */
