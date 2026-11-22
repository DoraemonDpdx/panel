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
import { ChevronDown, Play, RotateCcw, Square, Timer, X, Zap } from 'lucide-react';
import {
    Button,
    buttonClassName,
    Dialog,
    DropdownMenu,
    DropdownMenuItem,
    Spinner,
    useDelayedRestart,
    type DelayedRestart,
} from '@pterodactyl/sdk';
import { Slot, cn, type ServerPowerModel, type ViewProps } from '@pterodactyl/sdk/theme';

type Signal = 'start' | 'restart';

/** Longest a pressed button waits for the server to report back before it hands control to the user again. */
const GIVE_UP_MS = 10_000;

/** The delays offered for a restart that warns the players first, in seconds. */
const RESTART_DELAYS = [10, 30, 60] as const;

function Countdown({ countdown }: { readonly countdown: DelayedRestart }) {
    return (
        <div role='status' className='fill flex h-9 items-center gap-2 rounded-full pr-1.5 pl-3 text-sm' data-testid='restart-countdown'>
            <Spinner size='small' />
            <span className='tabular-nums'>
                Restarting in {countdown.remaining} second{countdown.remaining === 1 ? '' : 's'}
            </span>
            <Button.Text size='xsmall' onClick={countdown.cancel}>
                <X className='size-3.5' aria-hidden /> Cancel
            </Button.Text>
        </div>
    );
}

interface MenuProps {
    readonly model: ServerPowerModel;
    readonly countdown: DelayedRestart;
    /** The main action is Start, so the menu trigger takes its green. */
    readonly start: boolean;
    readonly busy: boolean;
    readonly onKill: () => void;
}

/** Restart, a restart after a warning, Stop and Kill, beside the main action. */
function PowerMenu({ model, countdown, start, busy, onKill }: MenuProps) {
    const { permissions, enabled, actions } = model;
    const counting = countdown.remaining !== null;

    return (
        <DropdownMenu
            triggerClassName={cn(
                buttonClassName({ color: start ? 'green' : 'grey', size: 'small' }),
                !start && 'lq-info text-[#cdd8ff]!',
                'rounded-l-none border-l border-l-white/20 px-2'
            )}
            triggerContent={
                <>
                    <ChevronDown className='size-4' aria-hidden />
                    <span className='sr-only'>More power actions</span>
                </>
            }
        >
            {permissions.restart && (
                <DropdownMenuItem icon={RotateCcw} disabled={!enabled.restart || counting || busy} onClick={actions.restart}>
                    Restart
                </DropdownMenuItem>
            )}
            {permissions.restart &&
                RESTART_DELAYS.map((seconds) => (
                    <DropdownMenuItem
                        key={seconds}
                        icon={Timer}
                        disabled={!enabled.restart || counting}
                        onClick={() => countdown.start(seconds)}
                    >
                        Restart in {seconds} seconds
                    </DropdownMenuItem>
                ))}
            {permissions.stop && (
                <DropdownMenuItem icon={Square} disabled={!enabled.stop || model.killable || busy} onClick={actions.stop}>
                    Stop
                </DropdownMenuItem>
            )}
            {permissions.stop && (
                <DropdownMenuItem danger icon={Zap} disabled={!enabled.kill} onClick={onKill}>
                    Kill
                </DropdownMenuItem>
            )}
        </DropdownMenu>
    );
}

/**
 * The power control as one split capsule. The main action is Start while the server is offline and Restart otherwise;
 * the menu beside it holds Restart, Restart in 10/30/60 seconds (the players are warned and it can be cancelled), Stop
 * and a confirmed Kill. A pressed button shows its pending state in the same frame, before the server answers, and the
 * rest wait so a signal is never sent twice; a transition shows the panel's Spinner, never a pulse. The engine sends
 * the signal; this view only decides what to show and when to call it.
 */
export default function Power({ model, className }: ViewProps<'server.power'>) {
    const { permissions, enabled, actions, state } = model;
    const [pending, setPending] = useState<Signal | null>(null);
    const [confirmingKill, setConfirmingKill] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
    const countdown = useDelayedRestart({ command: actions.command, restart: actions.restart, canRestart: enabled.restart });

    // The server reporting a new state is the answer to the signal.
    useEffect(() => setPending(null), [state, model.connected]);
    useEffect(() => () => clearTimeout(timer.current), []);

    const send = (signal: Signal) => {
        setPending(signal);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setPending(null), GIVE_UP_MS);
        actions[signal]();
    };

    const busy = pending !== null;
    const counting = countdown.remaining !== null;
    // Until the first state arrives the main action is a disabled Start.
    const offline = state === 'offline' || state === null;
    const showStart = offline && permissions.start;
    const showRestart = !offline && permissions.restart;
    const hasMenu = (permissions.restart || permissions.stop) && (showStart || showRestart);
    const any = permissions.start || permissions.stop || permissions.restart;

    return (
        <div className={cn('ast-power flex flex-wrap items-center gap-2', className)}>
            <Slot name='server.console.power.before' data={model.server} />
            {any && (
                <>
                    {counting && <Countdown countdown={countdown} />}
                    <div role='group' aria-label='Power controls' aria-busy={busy} className='flex'>
                        {showStart && (
                            <Button
                                size='small'
                                color='green'
                                className={cn(hasMenu && 'rounded-r-none')}
                                isLoading={pending === 'start'}
                                disabled={!enabled.start || busy}
                                onClick={() => send('start')}
                            >
                                <Play className='size-4' aria-hidden /> Start
                            </Button>
                        )}
                        {showRestart && (
                            <Button
                                size='small'
                                color='grey'
                                className={cn('lq-info text-[#cdd8ff]!', hasMenu && 'rounded-r-none')}
                                isLoading={pending === 'restart'}
                                disabled={!enabled.restart || busy || counting}
                                onClick={() => send('restart')}
                            >
                                <RotateCcw className='size-4' aria-hidden /> Restart
                            </Button>
                        )}
                        {hasMenu && (
                            <PowerMenu
                                model={model}
                                countdown={countdown}
                                start={showStart}
                                busy={busy}
                                onKill={() => setConfirmingKill(true)}
                            />
                        )}
                    </div>
                </>
            )}
            {!model.connected && (
                <span role='status' className='text-xs text-muted-foreground'>
                    Reconnecting to the console…
                </span>
            )}
            <Dialog.Confirm
                hideCloseIcon
                open={confirmingKill}
                onClose={() => setConfirmingKill(false)}
                title='Forcibly stop the process'
                confirm='Kill'
                onConfirmed={() => {
                    setConfirmingKill(false);
                    actions.kill();
                }}
            >
                Forcibly stopping a server can lead to data corruption.
            </Dialog.Confirm>
            <Slot name='server.console.power.after' data={model.server} />
        </div>
    );
}

/* ― Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse ― */
