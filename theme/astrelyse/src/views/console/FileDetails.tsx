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

import { FileArchive, FileInput, FileText, Folder } from 'lucide-react';
import { bytesToString, formatDate, fromNow, Icon } from '@pterodactyl/sdk';
import { cn, type ViewProps } from '@pterodactyl/sdk/theme';

const icons = { file: FileText, directory: Folder, archive: FileArchive, symlink: FileInput };

const HOUR = 60 * 60 * 1000;

/** The cells of one row: icon, name, size, modified. The row around it (a plain fill) belongs to the list. */
export default function FileDetails({ className, model }: ViewProps<'server.files.details'>) {
    const hours = Math.trunc((Date.parse(model.modifiedAt) - Date.now()) / HOUR);

    return (
        <div className={cn('flex min-w-0 flex-1 items-center', className)}>
            <div className='mr-3 ml-9 flex-none pl-2 text-muted-foreground'>
                <Icon icon={icons[model.kind]} className={model.kind === 'directory' ? 'text-ast-lav' : undefined} />
            </div>
            <div className='flex-1 truncate text-foreground'>{model.name}</div>
            {model.kind !== 'directory' && (
                <div className='mr-4 hidden w-1/6 text-right font-mono text-xs text-muted-foreground sm:block'>
                    {bytesToString(model.size)}
                </div>
            )}
            <div className='mr-4 hidden w-1/5 text-right text-xs text-muted-foreground md:block' title={model.modifiedAt}>
                {Math.abs(hours) > 48 ? formatDate(model.modifiedAt, 'MMM Do, YYYY h:mmA') : fromNow(model.modifiedAt)}
            </div>
        </div>
    );
}

/* ― Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse ― */
