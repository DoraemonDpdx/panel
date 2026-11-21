import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConsoleLog, MAX_LOG_LINES } from './consoleLog';

describe('ConsoleLog', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('stores and draws lines, notifying once per burst', () => {
        const log = new ConsoleLog();
        const sink = vi.fn();
        const listener = vi.fn();

        log.setSink(sink);
        log.subscribe(listener);
        log.write('[12:00 INFO]: a');
        log.write('[12:00 WARN]: b');
        vi.advanceTimersByTime(200);

        expect(sink).toHaveBeenCalledTimes(2);
        expect(log.getLines().map((line) => line.level)).toEqual(['info', 'warn']);
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('holds lines while paused and releases them in order on resume', () => {
        const log = new ConsoleLog();
        const sink = vi.fn();

        log.setSink(sink);
        log.write('before');
        log.setPaused(true);
        log.write('during 1');
        log.write('during 2');

        expect(sink).toHaveBeenCalledTimes(1);
        expect(log.getLines()).toHaveLength(1);

        log.setPaused(false);

        expect(sink.mock.calls.map(([line]) => line)).toEqual(['before', 'during 1', 'during 2']);
        expect(log.getLines()).toHaveLength(3);
    });

    it('clears stored and held lines', () => {
        const log = new ConsoleLog();

        log.write('a');
        log.setPaused(true);
        log.write('b');
        log.clear();
        log.setPaused(false);

        expect(log.getLines()).toHaveLength(0);
    });

    it('keeps the newest lines only', () => {
        const log = new ConsoleLog();

        for (let index = 0; index < MAX_LOG_LINES + 10; index++) {
            log.write(`line ${index}`);
        }

        expect(log.getLines()).toHaveLength(MAX_LOG_LINES);
        expect(log.getLines().at(-1)?.text).toBe(`line ${MAX_LOG_LINES + 9}`);
    });
});
