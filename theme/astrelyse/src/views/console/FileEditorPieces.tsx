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

import { Info } from 'lucide-react';
import { Button, cn, SpinnerOverlay } from '@pterodactyl/sdk';
import type { ViewProps } from '@pterodactyl/sdk/theme';

const code = 'rounded-md bg-white/10 px-1 py-px font-mono';

/** A note above a `.pteroignore`, in a plain fill. */
export function EditorNotice({ model, className }: ViewProps<'server.files.editor.notice'>) {
    return model.name.endsWith('.pteroignore') ? (
        <div className={cn('fill mb-3 flex gap-3 rounded-2xl p-4', className)}>
            <Info className='mt-0.5 size-4 shrink-0 text-ast-lav' aria-hidden />
            <p className='text-sm text-muted-foreground'>
                You&apos;re editing a <code className={code}>.pteroignore</code> file. Any files or directories listed
                in here will be excluded from backups. Wildcards are supported by using an asterisk (
                <code className={code}>*</code>). You can negate a prior rule by prepending an exclamation point (
                <code className={code}>!</code>).
            </p>
        </div>
    ) : null;
}

/** The editor gets a box of a definite height and the editor ink; it never sits on clear glass. */
export function EditorCanvas({ model, className }: ViewProps<'server.files.editor.canvas'>) {
    return (
        <div
            aria-busy={model.saving}
            className={cn(
                'ast-editor-canvas relative h-[32rem] max-h-[70vh] min-h-[20rem] overflow-hidden rounded-2xl bg-(--editor-background)',
                className
            )}
        >
            <model.Editor className='h-full w-full' />
            <SpinnerOverlay visible={model.saving} />
        </div>
    );
}

/** Save, the one primary action of the page. It shows its pending state the moment it is pressed. */
export function EditorActions({ model, className }: ViewProps<'server.files.editor.actions'>) {
    return model.readOnly ? null : (
        <Button
            size='small'
            color='green'
            className={cn('w-full sm:w-auto', className)}
            disabled={model.saving}
            isLoading={model.saving}
            onClick={() => void model.save()}
        >
            {model.isNew ? 'Create file' : 'Save changes'}
        </Button>
    );
}

/* ― Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse ― */
