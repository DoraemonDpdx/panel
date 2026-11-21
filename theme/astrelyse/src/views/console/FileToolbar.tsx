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

import { FilePlus } from 'lucide-react';
import { Button, Checkbox, ErrorBoundary } from '@pterodactyl/sdk';
import { Slot, cn, type ViewProps } from '@pterodactyl/sdk/theme';
import Breadcrumbs from './files/Breadcrumbs';
import { NewDirectoryButton } from './files/FileDialogs';
import { UploadButton, UploadStatus } from './files/Uploads';

/**
 * The path on the left, the actions on the right. Upload is the one primary action; New folder and New file are clear
 * glass. The row never changes height when an upload starts: its status is one more small control in the cluster.
 */
export default function FileToolbar({ model, className }: ViewProps<'server.files.manager.toolbar'>) {
    const { entries, selection } = model;

    return (
        <ErrorBoundary>
            <div className={cn('ast-files-toolbar mb-3 flex flex-wrap items-center justify-between gap-3', className)}>
                <Breadcrumbs crumbs={model.breadcrumbs}>
                    <Checkbox
                        className='mx-2'
                        aria-label='Select all files'
                        checked={entries.length > 0 && selection.length === entries.length}
                        indeterminate={selection.length > 0 && selection.length < entries.length}
                        onChange={(checked) => model.actions.select(checked ? entries.map((entry) => entry.name) : [])}
                    />
                </Breadcrumbs>
                {model.permissions.create && (
                    <div role='group' aria-label='File actions' className='flex flex-wrap items-center gap-2'>
                        <UploadStatus model={model} />
                        <NewDirectoryButton model={model} />
                        {/* Failures have already been reported by the engine. */}
                        <Button size='small' color='grey' onClick={() => void model.actions.newFile().catch(() => {})}>
                            <FilePlus className='size-4' aria-hidden /> New file
                        </Button>
                        {model.permissions.update && <UploadButton model={model} />}
                    </div>
                )}
            </div>
            <Slot name='server.files.toolbar' data={model.slot} />
        </ErrorBoundary>
    );
}

/* ― Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse ― */
