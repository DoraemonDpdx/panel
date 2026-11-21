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

import { ArchiveRestore, ArrowRightLeft, Ban, Hammer, Wrench, type LucideIcon } from 'lucide-react';
import { Icon } from '@pterodactyl/sdk';
import type { ServerConflict as Conflict, ViewProps } from '@pterodactyl/sdk/theme';

/**
 * What is happening, why the pages are unavailable, and what the user can do. Plain words and a still icon: the
 * installer and the node do the work, so nothing here spins or pulses.
 */
const notices: Record<Conflict, { icon: LucideIcon; title: string; message: string; next: string }> = {
    installing: {
        icon: Hammer,
        title: 'Installing your server',
        message: 'The installer is setting this server up. Its pages unlock when it finishes.',
        next: 'This usually takes a few minutes. Check back shortly.',
    },
    suspended: {
        icon: Ban,
        title: 'Server suspended',
        message: 'This server is suspended, so it cannot be used or changed.',
        next: 'Contact support to find out why and how to lift it.',
    },
    maintenance: {
        icon: Wrench,
        title: 'Node under maintenance',
        message: 'The node this server runs on is down for maintenance.',
        next: 'Your files are safe. Check back once maintenance is over.',
    },
    transferring: {
        icon: ArrowRightLeft,
        title: 'Moving to a new node',
        message: 'This server is being transferred to another node.',
        next: 'Check back in a few minutes. Nothing is lost in the move.',
    },
    'restoring-backup': {
        icon: ArchiveRestore,
        title: 'Restoring from a backup',
        message: 'This server is being restored from a backup, so its files are being replaced.',
        next: 'Check back in a few minutes.',
    },
};

export function ServerConflict({ model, className }: ViewProps<'server.conflict'>) {
    if (!model.kind) {
        return null;
    }

    const { icon, title, message, next } = notices[model.kind];

    return (
        <section className={`srv-conflict mat ${className ?? ''}`} role='status' aria-labelledby='srv-conflict-title'>
            <span className='srv-conflict-icon' aria-hidden>
                <Icon icon={icon} />
            </span>
            <h2 id='srv-conflict-title'>{title}</h2>
            <p className='text-foreground'>{message}</p>
            <p className='text-muted-foreground'>{next}</p>
        </section>
    );
}

/* ― Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse ― */
