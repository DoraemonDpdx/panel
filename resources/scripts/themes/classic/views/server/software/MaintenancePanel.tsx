import { useState } from 'react';
import { Alert, Button, Card, Input, Label, Switch } from '@/sdk';
import type { ServerSoftwareModel } from '@/sdk/theme';
import { ConfirmDialog } from './shared';

function ReinstallCard({ model }: { model: ServerSoftwareModel }) {
    const { reinstall } = model.maintenance;
    const [confirming, setConfirming] = useState(false);

    return (
        <Card title='Reinstall current software'>
            <p className='mb-3 text-sm text-muted-foreground'>
                Runs the installer again with the same software to repair it. Your files are kept.
            </p>
            <Button isSecondary color='grey' disabled={model.busy} onClick={() => setConfirming(true)}>
                Reinstall
            </Button>
            {confirming && (
                <ConfirmDialog
                    title='Reinstall the current software?'
                    confirm='Reinstall'
                    pending={reinstall.pending}
                    onClose={() => setConfirming(false)}
                    onConfirm={() => void reinstall.run().finally(() => setConfirming(false))}
                >
                    <p>The server will stop and run its installer again. Your files are kept.</p>
                </ConfirmDialog>
            )}
        </Card>
    );
}

function ClearDialog({ model, close }: { model: ServerSoftwareModel; close: () => void }) {
    const { clear } = model.maintenance;
    const [typed, setTyped] = useState('');

    return (
        <ConfirmDialog
            title='Clear server files?'
            confirm='Clear server files'
            danger
            pending={clear.pending}
            disabled={!clear.matches(typed)}
            onClose={close}
            onConfirm={() => void clear.run(typed).finally(close)}
        >
            <p>
                This deletes {clear.keepWorlds ? 'everything except your worlds' : 'every file, including your worlds'}.
                It can&apos;t be undone.
            </p>
            <div className='flex flex-col gap-1'>
                <Label htmlFor='software-clear-name'>
                    Type <span className='font-medium'>{clear.serverName}</span> to confirm
                </Label>
                <Input
                    id='software-clear-name'
                    autoComplete='off'
                    value={typed}
                    onChange={(event) => setTyped(event.currentTarget.value)}
                />
            </div>
        </ConfirmDialog>
    );
}

function ClearCard({ model }: { model: ServerSoftwareModel }) {
    const { clear } = model.maintenance;
    const [open, setOpen] = useState(false);

    return (
        <Card title='Clear server files'>
            <div className='flex flex-col gap-3'>
                <p className='text-sm text-muted-foreground'>
                    Deletes the server&apos;s files so you can start again. The software stays selected.
                </p>
                <Switch
                    checked={clear.keepWorlds}
                    onChange={clear.setKeepWorlds}
                    label='Keep worlds'
                    description='Worlds and server.properties are not deleted.'
                />
                {clear.serverRunning && (
                    <div className='flex flex-wrap items-start gap-2'>
                        <Alert type='warning' className='min-w-0 flex-1'>
                            Stop the server first. Its files can&apos;t be cleared while it is running.
                        </Alert>
                        {clear.canStop && (
                            <Button
                                size='xsmall'
                                isSecondary
                                color='grey'
                                isLoading={clear.stopping}
                                onClick={() => void clear.stop()}
                            >
                                Stop
                            </Button>
                        )}
                    </div>
                )}
                <div>
                    <Button.Danger disabled={clear.serverRunning || model.busy} onClick={() => setOpen(true)}>
                        Clear server files…
                    </Button.Danger>
                </div>
            </div>
            {open && <ClearDialog model={model} close={() => setOpen(false)} />}
        </Card>
    );
}

export default function MaintenancePanel({ model }: { model: ServerSoftwareModel }) {
    return (
        <div className='flex flex-col gap-4'>
            <ReinstallCard model={model} />
            <ClearCard model={model} />
        </div>
    );
}
