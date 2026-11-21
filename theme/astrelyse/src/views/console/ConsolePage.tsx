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

import { Alert, ServerContentBlock } from '@pterodactyl/sdk';
import { Slot, View, type ServerConsoleModel, type ViewProps } from '@pterodactyl/sdk/theme';

const notices = {
    maintenance: 'The node of this server is under maintenance, so the server cannot be controlled.',
    installing: 'This server is running its installation; most actions wait until it finishes.',
    transferring: 'This server is moving to another node, so every action is unavailable.',
} satisfies Record<NonNullable<ServerConsoleModel['notice']>, string>;

/**
 * The console without `server.power`: the layout's header already carries the name, the state and the power
 * controls. The page stays mounted while another server page shows, so it only titles the document while `active`.
 * The terminal and the stats sit side by side on wide screens; the graphs run beneath. The egg's prompts (EULA,
 * Java version, limits) stack in a corner over the console instead of blocking it.
 */
export default function ConsolePage({ model, active, className }: ViewProps<'page.server.console'>) {
    return (
        <ServerContentBlock title={active ? 'Console' : undefined} className={className}>
            {model.notice && (
                <Alert type='warning' className='mb-4'>
                    {notices[model.notice]}
                </Alert>
            )}
            <Slot name='server.console.before' data={model.server} />
            {model.description && <p className='mb-4 line-clamp-2 text-sm text-muted-foreground'>{model.description}</p>}
            <div className='grid gap-4 xl:grid-cols-[minmax(0,1fr)_21rem]'>
                <div className='relative min-w-0'>
                    <View name='server.terminal' className='min-w-0' />
                    <div
                        aria-live='polite'
                        className='ast-prompts pointer-events-none absolute right-4 bottom-20 z-20 flex w-80 max-w-[calc(100%-2rem)] flex-col gap-2'
                    >
                        {model.features.map((name) => (
                            <View key={name} name={name} />
                        ))}
                    </div>
                </div>
                <View name='server.stats' className='min-w-0 xl:self-start' />
            </div>
            <View name='server.graphs' className='mt-4' />
            <Slot name='server.console.after' data={model.server} />
        </ServerContentBlock>
    );
}

/* ― Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse ― */
