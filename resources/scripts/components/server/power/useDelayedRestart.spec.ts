/** @vitest-environment jsdom */

import { act as rtlAct, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDelayedRestart, warningMessage } from './useDelayedRestart';

/** Runs a synchronous update; `act` is typed to possibly return a promise. */
const act = (update: () => unknown) => {
    rtlAct(() => {
        update();
    });
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(canRestart = true) {
    const command = vi.fn();
    const restart = vi.fn();
    const hook = renderHook(({ canRestart }) => useDelayedRestart({ command, restart, canRestart }), {
        initialProps: { canRestart },
    });

    return { command, restart, ...hook };
}

describe('useDelayedRestart', () => {
    it('warns the players first, then counts down and restarts once', () => {
        const { result, command, restart } = setup();

        act(() => result.current.start(3));

        expect(command).toHaveBeenCalledWith(warningMessage(3));
        expect(result.current.remaining).toBe(3);
        expect(restart).not.toHaveBeenCalled();

        act(() => vi.advanceTimersByTime(1000));
        act(() => vi.advanceTimersByTime(1000));
        expect(result.current.remaining).toBe(1);
        expect(restart).not.toHaveBeenCalled();

        act(() => vi.advanceTimersByTime(1000));
        expect(restart).toHaveBeenCalledTimes(1);
        expect(result.current.remaining).toBeNull();

        act(() => vi.advanceTimersByTime(5000));
        expect(restart).toHaveBeenCalledTimes(1);
    });

    it('cancels without restarting and tells the players', () => {
        const { result, command, restart } = setup();

        act(() => result.current.start(10));
        act(() => vi.advanceTimersByTime(1000));
        act(() => result.current.cancel());

        expect(result.current.remaining).toBeNull();
        expect(command).toHaveBeenLastCalledWith('say Scheduled restart cancelled');

        act(() => vi.advanceTimersByTime(20_000));
        expect(restart).not.toHaveBeenCalled();
    });

    it('cancelling with nothing pending sends nothing', () => {
        const { result, command } = setup();

        act(() => result.current.cancel());

        expect(command).not.toHaveBeenCalled();
    });

    it('gives up when the server can no longer restart', () => {
        const { result, rerender, restart } = setup();

        act(() => result.current.start(5));
        rerender({ canRestart: false });

        expect(result.current.remaining).toBeNull();

        act(() => vi.advanceTimersByTime(10_000));
        expect(restart).not.toHaveBeenCalled();
    });
});
