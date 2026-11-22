import { useCallback, useEffect, useRef, useState } from 'react';

export interface DelayedRestartOptions {
    /** Sends a console command; the countdown announces itself with a `say`. */
    command: (command: string) => void;
    restart: () => void;
    /** Cancels the countdown when the server stops being restartable, such as going offline. */
    canRestart: boolean;
}

export interface DelayedRestart {
    /** Seconds left, or null when no restart is pending. */
    remaining: number | null;
    start: (seconds: number) => void;
    cancel: () => void;
}

export const warningMessage = (seconds: number) =>
    `say Server restarting in ${seconds} second${seconds === 1 ? '' : 's'}`;

/**
 * Warns the players with a `say`, counts down once a second, then sends the restart. Cancelling announces that
 * too, so players are not left waiting for a restart that will not come.
 */
export function useDelayedRestart({ command, restart, canRestart }: DelayedRestartOptions): DelayedRestart {
    const [remaining, setRemaining] = useState<number | null>(null);
    const latest = useRef({ command, restart, remaining });

    useEffect(() => {
        latest.current = { command, restart, remaining };
    });

    const start = useCallback((seconds: number) => {
        latest.current.command(warningMessage(seconds));
        setRemaining(seconds);
    }, []);

    const cancel = useCallback(() => {
        if (latest.current.remaining !== null) {
            latest.current.command('say Scheduled restart cancelled');
        }

        setRemaining(null);
    }, []);

    useEffect(() => {
        if (remaining === null) {
            return;
        }

        if (!canRestart) {
            setRemaining(null);

            return;
        }

        if (remaining <= 0) {
            setRemaining(null);
            latest.current.restart();

            return;
        }

        const timeout = setTimeout(() => setRemaining(remaining - 1), 1000);

        return () => clearTimeout(timeout);
    }, [remaining, canRestart]);

    return { remaining, start, cancel };
}
