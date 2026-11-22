import { useState } from 'react';
import { ChevronDown, RotateCcw, Square, Timer, X, Zap } from 'lucide-react';
import {
    Button,
    buttonClassName,
    cn,
    Dialog,
    DropdownMenu,
    DropdownMenuItem,
    Spinner,
    StatusDot,
    useDelayedRestart,
    type DelayedRestart,
} from '@/sdk';
import { Slot, type ServerPowerModel, type ViewProps } from '@/sdk/theme';

/** The delays offered for a restart that warns the players first, in seconds. */
const RESTART_DELAYS = [10, 30, 60] as const;

function Countdown({ countdown }: { countdown: DelayedRestart }) {
    return (
        <div role='status' className='flex items-center gap-2 text-sm' data-testid='restart-countdown'>
            <Spinner size='small' />
            <span>
                Restarting in {countdown.remaining} second{countdown.remaining === 1 ? '' : 's'}
            </span>
            <Button.Text size='xsmall' onClick={countdown.cancel}>
                <X className='size-3.5' aria-hidden /> Cancel
            </Button.Text>
        </div>
    );
}

interface MenuProps {
    model: ServerPowerModel;
    countdown: DelayedRestart;
    start: boolean;
    onKill: () => void;
}

/** Restart, a restart after a warning, Stop and Kill, beside the main action. */
function PowerMenu({ model, countdown, start, onKill }: MenuProps) {
    const { permissions, enabled, actions } = model;
    const counting = countdown.remaining !== null;

    return (
        <DropdownMenu
            triggerClassName={cn(
                buttonClassName({ color: start ? 'green' : 'primary' }),
                'rounded-l-none border-l border-l-foreground/20 px-2'
            )}
            triggerContent={
                <>
                    <ChevronDown className='size-4' aria-hidden />
                    <span className='sr-only'>More power actions</span>
                </>
            }
        >
            {permissions.restart && (
                <DropdownMenuItem icon={RotateCcw} disabled={!enabled.restart || counting} onClick={actions.restart}>
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
                <DropdownMenuItem icon={Square} disabled={!enabled.stop || model.killable} onClick={actions.stop}>
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

/** Start while offline, Restart otherwise; `split` squares the edge that meets the menu. */
function MainAction({ model, counting, split }: { model: ServerPowerModel; counting: boolean; split: boolean }) {
    const { permissions, enabled, actions, state } = model;
    const offline = state === 'offline' || state === null;

    if (offline) {
        return permissions.start ? (
            <Button
                color='green'
                className={cn(split && 'rounded-r-none')}
                disabled={!enabled.start}
                onClick={actions.start}
            >
                Start
            </Button>
        ) : null;
    }

    return permissions.restart ? (
        <Button
            className={cn(split && 'rounded-r-none')}
            disabled={!enabled.restart || counting}
            onClick={actions.restart}
        >
            <RotateCcw className='size-4' aria-hidden /> Restart
        </Button>
    ) : null;
}

/**
 * A split button: Start while the server is offline, Restart otherwise, with Restart, a delayed restart, Stop and
 * Kill in the menu beside it. Kill asks first. A transition shows the panel's spinner, never a pulse.
 */
export default function Power({ model, className }: ViewProps<'server.power'>) {
    const { permissions, enabled, actions, state } = model;
    const [confirmingKill, setConfirmingKill] = useState(false);
    const countdown = useDelayedRestart({
        command: actions.command,
        restart: actions.restart,
        canRestart: enabled.restart,
    });
    // Until the first state arrives the main action is a disabled Start.
    const offline = state === 'offline' || state === null;
    const showStart = offline && permissions.start;
    const hasMenu = (permissions.restart || permissions.stop) && (showStart || (!offline && permissions.restart));

    return (
        <div className={className}>
            <Slot name='server.console.power.before' data={model.server} />
            {(permissions.start || permissions.stop || permissions.restart) && (
                <div className='flex flex-wrap items-center gap-2 sm:justify-end'>
                    {(state === 'starting' || state === 'stopping') && <StatusDot status={state} showLabel />}
                    {countdown.remaining !== null && <Countdown countdown={countdown} />}
                    <div role='group' aria-label='Power controls' className='flex'>
                        <MainAction model={model} counting={countdown.remaining !== null} split={hasMenu} />
                        {hasMenu && (
                            <PowerMenu
                                model={model}
                                countdown={countdown}
                                start={showStart}
                                onKill={() => setConfirmingKill(true)}
                            />
                        )}
                    </div>
                </div>
            )}
            <Dialog.Confirm
                hideCloseIcon
                open={confirmingKill}
                onClose={() => setConfirmingKill(false)}
                title='Forcibly Stop Process'
                confirm='Continue'
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
