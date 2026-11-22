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

import { useRef, type KeyboardEvent } from 'react';
import { ChevronsDown, ChevronsRight, CornerDownLeft } from 'lucide-react';
import { Button, SpinnerOverlay } from '@pterodactyl/sdk';
import { cn, type ServerConsoleCommand, type ViewProps } from '@pterodactyl/sdk/theme';
import ConsoleToolbar from './ConsoleToolbar';
import LogViewer from './LogViewer';
import SavedCommands from './SavedCommands';

function onCommandKey(command: ServerConsoleCommand, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowUp') {
        // Keeps the cursor at the end of the recalled command.
        event.preventDefault();
        command.previous();
    } else if (event.key === 'ArrowDown') {
        command.next();
    } else if (event.key === 'Enter') {
        command.submit();
    }
}

/**
 * The console in a material card: the tools above, the output on `--terminal-background` (a near-solid ink, so console
 * text never sits on clear glass), the saved commands, then the command line. The canvas stays mounted under the
 * structured view so its history survives; the viewer covers it.
 */
export default function Terminal({ model, className }: ViewProps<'server.terminal'>) {
    const { command, viewer } = model;
    const input = useRef<HTMLInputElement>(null);

    return (
        <section aria-label='Console' className={cn('ast-console mat flex flex-col gap-2 rounded-3xl p-2', className)}>
            <ConsoleToolbar toolbar={model.toolbar} />
            <div className='ast-terminal relative h-[30rem] max-h-[70vh] min-h-[16rem] overflow-hidden rounded-2xl bg-terminal'>
                <div className={cn('absolute inset-0 p-3 font-mono text-sm caret-transparent', viewer && 'hidden')}>
                    <model.Terminal className='h-full w-full' />
                </div>
                {viewer && <LogViewer viewer={viewer} className='absolute inset-0' />}
                <SpinnerOverlay visible={model.loading} size='large' />
                {model.failed && (
                    <div
                        role='alert'
                        className='absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-terminal p-4 text-center text-sm text-foreground'
                    >
                        <p>The console could not be loaded.</p>
                        <Button size='small' color='grey' onClick={model.retry}>
                            Try again
                        </Button>
                    </div>
                )}
                {!viewer && model.scrolledUp && (
                    <button
                        type='button'
                        onClick={model.scrollToBottom}
                        className='ast-latest absolute right-5 bottom-3 z-10 inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-foreground'
                    >
                        <ChevronsDown className='size-4' aria-hidden /> Latest output
                    </button>
                )}
            </div>
            <SavedCommands saved={model.saved} />
            {command.allowed ? (
                <div className={cn('ast-command fill flex h-12 items-center gap-2 rounded-2xl pr-2 pl-4', command.disabled && 'opacity-60')}>
                    <ChevronsRight className='size-4 shrink-0 text-ast-lav' aria-hidden />
                    <input
                        ref={input}
                        type='text'
                        aria-label='Console command'
                        placeholder={command.disabled ? 'Console disconnected' : 'Type a command…'}
                        disabled={command.disabled}
                        value={command.value}
                        onChange={(event) => command.setValue(event.currentTarget.value)}
                        onKeyDown={(event) => onCommandKey(command, event)}
                        autoCapitalize='none'
                        autoCorrect='off'
                        autoComplete='off'
                        spellCheck={false}
                        className='h-full min-w-0 flex-1 border-0 bg-transparent p-0 font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-0 focus-visible:outline-none'
                    />
                    <button
                        type='button'
                        aria-label='Send command'
                        disabled={command.disabled || command.value.trim() === ''}
                        onClick={() => {
                            command.submit();
                            input.current?.focus();
                        }}
                        className='ast-send inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:not-disabled:text-foreground disabled:opacity-40'
                    >
                        <CornerDownLeft className='size-4' aria-hidden />
                    </button>
                </div>
            ) : (
                <p className='px-3 pb-1 text-xs text-muted-foreground'>You can read the console but not send commands.</p>
            )}
        </section>
    );
}

/* ― Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse ― */
