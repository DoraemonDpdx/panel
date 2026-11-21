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

import { Button, cn, Dialog, Portal, SpinnerOverlay } from '@pterodactyl/sdk';
import { Slot, type FileManagerModel, type ViewProps } from '@pterodactyl/sdk/theme';
import { RenameDialog } from './files/FileDialogs';
import { usePending } from './files/usePending';

function Bar({ model, className }: { model: FileManagerModel; className?: string }) {
    const [pending, run] = usePending();
    const { selection, actions } = model;

    return (
        <>
            <SpinnerOverlay visible={pending} size='large' fixed />
            <Portal>
                {/* Fixed to the window, so it appears over the list without moving a single row. */}
                <div className='pointer-events-none fixed bottom-6 z-50 flex w-full justify-center px-4'>
                    {selection.length > 0 && (
                        <div
                            role='region'
                            aria-label='Selected files'
                            className={cn(
                                'ast-selection mat mat-float pointer-events-auto flex max-w-full flex-wrap items-center gap-2 rounded-3xl p-2 pl-4',
                                className
                            )}
                        >
                            <span role='status' className='mr-1 text-sm font-medium text-foreground tabular-nums'>
                                {selection.length} selected
                            </span>
                            <Slot name='server.files.selectionActions' data={model.slot} />
                            <Dialog.Trigger
                                trigger={({ onClick }) => (
                                    <Button size='small' color='grey' onClick={onClick}>
                                        Move
                                    </Button>
                                )}
                            >
                                {({ open, onClose }) =>
                                    open && (
                                        <RenameDialog
                                            model={model}
                                            files={[...selection]}
                                            open={open}
                                            move
                                            onClose={onClose}
                                        />
                                    )
                                }
                            </Dialog.Trigger>
                            <Button size='small' color='grey' onClick={() => run(actions.archive(selection))}>
                                Archive
                            </Button>
                            <Dialog.ConfirmTrigger
                                title='Delete files'
                                confirm='Delete'
                                trigger={({ onClick }) => (
                                    <Button size='small' color='red' isSecondary onClick={onClick}>
                                        Delete
                                    </Button>
                                )}
                                onConfirmed={(_event, close) => {
                                    close();
                                    run(actions.remove(selection));
                                }}
                            >
                                <p className='mb-2'>
                                    Are you sure you want to delete&nbsp;
                                    <span className='font-semibold text-foreground'>{selection.length} files</span>?
                                    This is a permanent action and the files cannot be recovered.
                                </p>
                                <ul className='mt-2 mb-0 list-outside list-disc pl-6'>
                                    {selection.slice(0, 15).map((file) => (
                                        <li key={file}>{file}</li>
                                    ))}
                                    {selection.length > 15 && <li>and {selection.length - 15} others</li>}
                                </ul>
                            </Dialog.ConfirmTrigger>
                            <Button size='small' color='grey' isSecondary onClick={() => actions.select([])}>
                                Clear
                            </Button>
                        </div>
                    )}
                </div>
            </Portal>
        </>
    );
}

/** The bar of mass actions. It shows while something is selected and renders nothing in an empty folder. */
export default function FileSelection({ model, className }: ViewProps<'server.files.manager.selection'>) {
    return model.entries.length > 0 ? <Bar model={model} className={className} /> : null;
}

/* ― Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse ― */
