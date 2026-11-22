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

import { CircleDot, Lock } from 'lucide-react';
import { cn } from '@pterodactyl/sdk';
import { View, type FileEditorModel, type ViewProps } from '@pterodactyl/sdk/theme';

/** What state the buffer is in, in words: colour and the icon only back the words up. */
function Status({ model }: { model: FileEditorModel }) {
    if (model.readOnly) {
        return (
            <p role='status' className='flex items-center gap-2 text-sm text-muted-foreground'>
                <Lock className='size-4' aria-hidden /> Read only
            </p>
        );
    }

    if (model.saving) {
        return (
            <p role='status' className='text-sm text-muted-foreground'>
                Saving…
            </p>
        );
    }

    return (
        <p role='status' className={cn('flex items-center gap-2 text-sm', model.dirty ? 'text-warning' : 'text-muted-foreground')}>
            {model.dirty && <CircleDot className='size-4' aria-hidden />}
            {model.dirty ? 'Unsaved changes' : 'No changes'}
        </p>
    );
}

/**
 * The editor in one material frame. The code sits on `--editor-background` in a box of a definite height (the editor
 * fills it), with the file's state, the language and Save beneath. Save is the one primary action.
 */
export default function FileEditor({ className, model }: ViewProps<'server.files.editor'>) {
    return (
        <section aria-label='File editor' className={cn('ast-editor mat min-w-0 rounded-3xl p-3 sm:p-4', className)}>
            <View name='server.files.editor.notice' model={model} />
            <View name='server.files.editor.canvas' model={model} />
            <div className='mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
                <Status model={model} />
                <div className='flex flex-col gap-3 sm:flex-row sm:items-center'>
                    <View name='server.files.editor.language' model={model} />
                    <View name='server.files.editor.actions' model={model} />
                </div>
            </div>
        </section>
    );
}

/* ― Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse ― */
