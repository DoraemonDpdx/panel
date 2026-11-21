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

import { FolderOpen, TriangleAlert } from 'lucide-react';
import { cn, Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle, Spinner } from '@pterodactyl/sdk';
import type { FileManagerEntry, ViewProps } from '@pterodactyl/sdk/theme';
import { FileRow, RowActionsProvider } from './files/FileRows';

const entryKey = ({ kind, name }: FileManagerEntry) => `${kind === 'directory' ? 'dir' : 'file'}_${name}`;

/** The rows are plain fills (see FileRows): a folder can hold hundreds, and glass would blur every one of them. */
export default function FileList({ model, className }: ViewProps<'server.files.manager.list'>) {
    if (model.loading) {
        return (
            <div className={cn('fill grid min-h-48 place-items-center rounded-2xl', className)}>
                <Spinner size='large' centered />
            </div>
        );
    }

    if (!model.entries.length) {
        return (
            <Empty className={cn('fill min-h-48 rounded-2xl', className)}>
                <EmptyHeader>
                    <EmptyMedia variant='icon'>
                        <FolderOpen />
                    </EmptyMedia>
                    <EmptyTitle>This folder is empty</EmptyTitle>
                    <EmptyDescription>
                        {model.permissions.create
                            ? 'Upload files or create a new file or folder to get started.'
                            : 'There are no files in this folder.'}
                    </EmptyDescription>
                </EmptyHeader>
            </Empty>
        );
    }

    const selected = new Set(model.selection);

    return (
        <div className={className}>
            {model.truncated && (
                <p role='status' className='fill mb-1.5 flex items-center gap-2 rounded-2xl p-3 text-sm text-warning'>
                    <TriangleAlert className='size-4 shrink-0' aria-hidden />
                    This directory is too large to display in the browser, limiting output to the first 250 files.
                </p>
            )}
            <RowActionsProvider model={model}>
                {model.entries.map((entry) => (
                    <FileRow key={entryKey(entry)} entry={entry} selected={selected.has(entry.name)} />
                ))}
            </RowActionsProvider>
        </div>
    );
}

/* ― Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse ― */
