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

import { CircleDashed, TriangleAlert } from 'lucide-react';
import { StatusDot } from '@pterodactyl/sdk';
import { cn } from '@pterodactyl/sdk/theme';
import type { ServerConflict, ServerRunState } from '@pterodactyl/sdk/theme';

const conflicts: Record<ServerConflict, string> = {
    installing: 'Installing',
    suspended: 'Suspended',
    maintenance: 'Maintenance',
    transferring: 'Transferring',
    'restoring-backup': 'Restoring backup',
};

interface Props {
    readonly state: ServerRunState | null;
    readonly conflict?: ServerConflict | null;
    readonly className?: string;
}

/**
 * The server's live state as a small static glass chip. It is not interactive, so it has no glow. A run state is the
 * panel's StatusDot (a flat dot, or the Spinner while starting or stopping) with its word beside it; a conflict or an
 * unknown state keeps its own icon. Colour only backs the word up.
 */
export default function StateChip({ state, conflict = null, className }: Props) {
    return (
        <span
            role='status'
            data-state={conflict ?? state ?? 'unknown'}
            className={cn(
                'lq inline-flex h-8 shrink-0 items-center gap-2 rounded-full px-3.5 text-xs font-medium text-foreground',
                className
            )}
        >
            {conflict ? (
                <>
                    <TriangleAlert aria-hidden className='size-4 text-warning' />
                    <span>{conflicts[conflict]}</span>
                </>
            ) : state ? (
                <StatusDot status={state} showLabel />
            ) : (
                <>
                    <CircleDashed aria-hidden className='size-4 text-muted-foreground' />
                    <span>Connecting</span>
                </>
            )}
        </span>
    );
}

/* ― Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse ― */
