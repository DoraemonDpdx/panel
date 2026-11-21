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

import { Copy } from 'lucide-react';
import { CopyOnClick } from '@pterodactyl/sdk';
import { Main, View, cn, type ViewProps } from '@pterodactyl/sdk/theme';
import StateChip from './StateChip';

/**
 * A server's frame: only the server header (name, identifier, live state, power) above the page. The app layout's menu
 * holds the server's pages and renders the `server.navigation.*` slots (PANEL_DESIGN 7), so none is drawn here.
 */
export default function ServerLayout({ model, className, children }: ViewProps<'layout.server'>) {
    const initials = model.name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((word) => word[0])
        .join('')
        .toUpperCase();

    return (
        <div className={cn('ast-server', className)}>
            <header className='page-width ast-server-head mb-6 flex flex-wrap items-center gap-x-5 gap-y-4'>
                <span className='ast-server-av' aria-hidden>
                    {initials || '?'}
                </span>
                <div className='min-w-0 flex-1 basis-64'>
                    <h1 className='truncate font-header text-3xl leading-tight font-normal tracking-tight text-foreground'>
                        {model.name}
                    </h1>
                    <div className='mt-1.5 flex items-center gap-2'>
                        <CopyOnClick text={model.identifier}>
                            <button type='button' className='ast-id' title='Copy server identifier'>
                                <Copy className='size-3' aria-hidden />
                                <span className='truncate font-mono'>{model.identifier}</span>
                            </button>
                        </CopyOnClick>
                    </div>
                </div>
                <StateChip state={model.state} conflict={model.conflict} />
                {/* No power controls while the server installs, transfers or is suspended. */}
                {model.conflict === null && <View name='server.power' />}
            </header>
            <Main>{children}</Main>
        </div>
    );
}

/* ― Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse ― */
