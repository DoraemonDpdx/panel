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

import { useState } from 'react';
import { ArrowDown, ArrowUp, Pencil, Plus, Settings2, Trash2 } from 'lucide-react';
import { Button, Dialog, Icon } from '@pterodactyl/sdk';
import type { SavedCommand, ServerSavedCommands } from '@pterodactyl/sdk/theme';

const fieldClass =
    'fill h-10 w-full rounded-xl border-0 px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ast-lav';

interface Draft {
    readonly id: number | null;
    readonly label: string;
    readonly command: string;
    readonly confirm: boolean;
}

const emptyDraft: Draft = { id: null, label: '', command: '', confirm: false };

const rowButton = 'text-muted-foreground hover:text-foreground disabled:opacity-40';

function ManageDialog({ saved, open, onClose }: { readonly saved: ServerSavedCommands; readonly open: boolean; readonly onClose: () => void }) {
    const [draft, setDraft] = useState<Draft>(emptyDraft);
    const { manage } = saved;
    const valid = draft.label.trim().length > 0 && draft.command.trim().length > 0;

    const save = async () => {
        const input = { label: draft.label.trim(), command: draft.command.trim(), confirm: draft.confirm };

        // A failure has already been reported.
        await (draft.id === null ? manage.add(input) : manage.edit(draft.id, input)).catch(() => {});
        setDraft(emptyDraft);
    };

    return (
        <Dialog open={open} title='Saved commands' onClose={onClose}>
            <p className='text-sm text-muted-foreground'>
                Pinned commands are shared with everyone who can use this server&apos;s console.
            </p>
            <ul className='mt-4 flex flex-col gap-1.5'>
                {saved.commands.map((command, index) => (
                    <li key={command.id} className='fill flex items-center gap-2 rounded-xl px-3 py-2 text-sm'>
                        <span className='min-w-0 flex-1 truncate'>
                            <span className='text-foreground'>{command.label}</span>{' '}
                            <code className='font-mono text-xs text-muted-foreground'>{command.command}</code>
                            {command.confirm && <span className='ml-2 text-xs text-muted-foreground'>asks first</span>}
                        </span>
                        <button
                            type='button'
                            aria-label={`Move ${command.label} up`}
                            disabled={index === 0 || manage.pending}
                            onClick={() => void manage.move(command.id, -1).catch(() => {})}
                            className={rowButton}
                        >
                            <Icon icon={ArrowUp} size={14} />
                        </button>
                        <button
                            type='button'
                            aria-label={`Move ${command.label} down`}
                            disabled={index === saved.commands.length - 1 || manage.pending}
                            onClick={() => void manage.move(command.id, 1).catch(() => {})}
                            className={rowButton}
                        >
                            <Icon icon={ArrowDown} size={14} />
                        </button>
                        <button
                            type='button'
                            aria-label={`Edit ${command.label}`}
                            onClick={() =>
                                setDraft({
                                    id: command.id,
                                    label: command.label,
                                    command: command.command,
                                    confirm: command.confirm,
                                })
                            }
                            className={rowButton}
                        >
                            <Icon icon={Pencil} size={14} />
                        </button>
                        <button
                            type='button'
                            aria-label={`Delete ${command.label}`}
                            disabled={manage.pending}
                            onClick={() => void manage.remove(command.id).catch(() => {})}
                            className='text-muted-foreground hover:text-destructive disabled:opacity-40'
                        >
                            <Icon icon={Trash2} size={14} />
                        </button>
                    </li>
                ))}
                {saved.commands.length === 0 && <li className='text-sm text-muted-foreground'>Nothing pinned yet.</li>}
            </ul>
            <form
                className='mt-4 flex flex-col gap-2'
                onSubmit={(event) => {
                    event.preventDefault();

                    if (valid) {
                        void save();
                    }
                }}
            >
                <input
                    className={fieldClass}
                    aria-label='Button label'
                    placeholder='Button label, such as Save world'
                    maxLength={64}
                    value={draft.label}
                    onChange={(event) => setDraft({ ...draft, label: event.currentTarget.value })}
                />
                <input
                    className={`${fieldClass} font-mono`}
                    aria-label='Command'
                    placeholder='Command, such as save-all'
                    maxLength={1024}
                    value={draft.command}
                    onChange={(event) => setDraft({ ...draft, command: event.currentTarget.value })}
                />
                <label className='flex items-center gap-2 text-sm'>
                    <input
                        type='checkbox'
                        checked={draft.confirm}
                        onChange={(event) => setDraft({ ...draft, confirm: event.currentTarget.checked })}
                    />
                    Ask before sending
                </label>
                <div className='flex justify-end gap-2'>
                    {draft.id !== null && (
                        <Button.Text type='button' onClick={() => setDraft(emptyDraft)}>
                            Cancel edit
                        </Button.Text>
                    )}
                    <Button type='submit' disabled={!valid || manage.pending}>
                        {draft.id === null ? 'Pin command' : 'Save changes'}
                    </Button>
                </div>
            </form>
        </Dialog>
    );
}

/** One-click capsules for the commands pinned to the server; a command that asks first confirms in a dialog. */
export default function SavedCommands({ saved }: { readonly saved: ServerSavedCommands }) {
    const [pending, setPending] = useState<SavedCommand | null>(null);
    const [managing, setManaging] = useState(false);

    if (!saved.allowed) {
        return null;
    }

    const press = (command: SavedCommand) => (command.confirm ? setPending(command) : saved.run(command));

    return (
        <div className='ast-saved flex flex-wrap items-center gap-1.5 px-1' role='group' aria-label='Saved commands'>
            {saved.commands.map((command) => (
                <button
                    key={command.id}
                    type='button'
                    title={command.command}
                    disabled={saved.disabled}
                    onClick={() => press(command)}
                    className='ast-tool ast-tool-chip h-8 px-3.5'
                >
                    {command.label}
                </button>
            ))}
            <button
                type='button'
                aria-label={saved.commands.length === 0 ? 'Pin a command' : 'Manage saved commands'}
                onClick={() => setManaging(true)}
                className='ast-tool h-8 gap-1.5 px-2.5'
            >
                <Icon icon={saved.commands.length === 0 ? Plus : Settings2} size={14} />
                {saved.commands.length === 0 && 'Pin a command'}
            </button>
            <Dialog.Confirm
                open={pending !== null}
                title={pending ? `Send "${pending.label}"?` : ''}
                confirm='Send'
                onClose={() => setPending(null)}
                onConfirmed={() => {
                    if (pending) {
                        saved.run(pending);
                    }

                    setPending(null);
                }}
            >
                <p>
                    This sends <code className='font-mono'>{pending?.command}</code> to the console.
                </p>
            </Dialog.Confirm>
            <ManageDialog saved={saved} open={managing} onClose={() => setManaging(false)} />
        </div>
    );
}

/* ― Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse ― */
