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

import { useEffect, useRef, useState } from 'react';
import { CloudUpload, X } from 'lucide-react';
import { Button, Code, Dialog, Portal, Tooltip } from '@pterodactyl/sdk';
import type { FileManagerModel } from '@pterodactyl/sdk/theme';

const isFileOrDirectory = (event: DragEvent): boolean =>
    event.dataTransfer?.types.some((value) => value.toLowerCase() === 'files') ?? false;

/** Shows the drop target while files are dragged over the window. */
function useDropOverlay(): [boolean, (open: boolean) => void] {
    const [open, setOpen] = useState(false);

    useEffect(() => {
        const enter = (event: DragEvent) => {
            event.preventDefault();
            event.stopPropagation();
            if (isFileOrDirectory(event)) {
                setOpen(true);
            }
        };

        const hide = () => setOpen(false);

        window.addEventListener('dragenter', enter, { capture: true });
        window.addEventListener('dragexit', hide, { capture: true });
        window.addEventListener('keydown', hide);

        return () => {
            window.removeEventListener('dragenter', enter, true);
            window.removeEventListener('dragexit', hide, true);
            window.removeEventListener('keydown', hide);
        };
    }, []);

    return [open, setOpen];
}

export function UploadButton({ model }: { model: FileManagerModel }) {
    const input = useRef<HTMLInputElement>(null);
    const [dropping, setDropping] = useDropOverlay();
    // Failures have already been reported with error toasts.
    const upload = (files: FileList) => void model.actions.upload([...files]).catch(() => {});

    return (
        <>
            <Portal>
                {dropping && (
                    <div
                        className='fixed z-50 overflow-auto flex w-full inset-0 bg-background/70'
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => {
                            event.preventDefault();
                            event.stopPropagation();

                            setDropping(false);
                            if (!event.dataTransfer?.files.length) {
                                return;
                            }

                            upload(event.dataTransfer.files);
                        }}
                    >
                        <div className='w-full flex items-center justify-center pointer-events-none'>
                            <div className='mat mat-float mx-10 flex w-full max-w-sm items-center space-x-4 rounded-3xl p-6'>
                                <CloudUpload className='w-10 h-10 shrink-0' />
                                <p className='font-header flex-1 text-lg text-foreground text-center'>
                                    Drag and drop files to upload.
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </Portal>
            <input
                type='file'
                ref={input}
                className='hidden'
                aria-label='Upload files'
                onChange={(event) => {
                    if (!event.currentTarget.files) {
                        return;
                    }

                    upload(event.currentTarget.files);
                    event.currentTarget.value = '';
                }}
                multiple
            />
            {/* The one primary action of the file manager. */}
            <Button size='small' color='green' onClick={() => input.current?.click()}>
                <CloudUpload className='size-4' aria-hidden /> Upload
            </Button>
        </>
    );
}

const svgProps = { cx: 16, cy: 16, r: 14, strokeWidth: 3, fill: 'none', stroke: 'currentColor' };

const Progress = ({ progress, className }: { progress: number; className?: string }) => (
    <svg viewBox='0 0 32 32' className={className}>
        <circle {...svgProps} className='opacity-25' />
        <circle
            {...svgProps}
            stroke='currentColor'
            strokeDasharray={28 * Math.PI}
            className='-rotate-90 origin-[50%_50%] transition-[stroke-dashoffset] duration-300'
            style={{ strokeDashoffset: ((100 - progress) / 100) * 28 * Math.PI }}
        />
    </svg>
);

const percent = (loaded: number, total: number) => (total > 0 ? (loaded / total) * 100 : 0);

function UploadList({ model, onClose }: { model: FileManagerModel; onClose: () => void }) {
    return (
        <div className='space-y-2 mt-6'>
            {model.uploads.map((file) => (
                <div key={file.id} className='fill flex items-center space-x-3 rounded-2xl p-3'>
                    <Tooltip content={`${Math.floor(percent(file.loaded, file.total))}%`} placement='left'>
                        <div className='shrink-0'>
                            <Progress progress={percent(file.loaded, file.total)} className='w-6 h-6' />
                        </div>
                    </Tooltip>
                    <Code className='flex-1 truncate'>{file.name}</Code>
                    <button
                        type='button'
                        aria-label={`Cancel upload of ${file.name}`}
                        onClick={() => model.actions.cancelUpload(file.id)}
                        className='text-muted-foreground transition-colors duration-[120ms] hover:text-foreground'
                    >
                        <X className='w-5 h-5' />
                    </button>
                </div>
            ))}
            <Dialog.Footer>
                <Button.Danger isSecondary onClick={model.actions.clearUploads}>
                    Cancel Uploads
                </Button.Danger>
                <Button.Text onClick={onClose}>Close</Button.Text>
            </Dialog.Footer>
        </div>
    );
}

export function UploadStatus({ model }: { model: FileManagerModel }) {
    const count = model.uploads.length;

    if (count === 0) {
        return null;
    }

    const uploaded = model.uploads.reduce((sum, file) => sum + file.loaded, 0);
    const total = model.uploads.reduce((sum, file) => sum + file.total, 0);

    return (
        <Dialog.Trigger
            trigger={({ onClick }) => (
                <Tooltip content={`${count} files are uploading, click to view`}>
                    <button type='button' className='flex size-10 items-center justify-center rounded-full' onClick={onClick}>
                        <Progress progress={percent(uploaded, total)} className='w-8 h-8' />
                        <CloudUpload className='absolute mx-auto h-3' aria-hidden />
                    </button>
                </Tooltip>
            )}
        >
            {({ open, onClose }) => (
                <Dialog
                    open={open}
                    onClose={onClose}
                    title='File Uploads'
                    description='The following files are being uploaded to your server.'
                >
                    <UploadList model={model} onClose={onClose} />
                </Dialog>
            )}
        </Dialog.Trigger>
    );
}

/* ― Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse ― */
