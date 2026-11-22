import { parseLogLine, type LogLine } from './logParser';

/** Lines kept for searching, filtering and downloading; the terminal keeps its own scrollback. */
export const MAX_LOG_LINES = 5_000;

const NOTIFY_DELAY_MS = 100;

/**
 * Everything the console printed, as parsed lines, beside the terminal canvas. The canvas cannot
 * be searched or filtered, so the structured view reads from here. While paused, new lines are
 * held back from both and released together on resume.
 */
export class ConsoleLog {
    private lines: LogLine[] = [];
    private held: string[] = [];
    private version = 0;
    private pausedNow = false;
    private sink: ((raw: string) => void) | null = null;
    private readonly listeners = new Set<() => void>();
    private timer: ReturnType<typeof setTimeout> | undefined;

    /** Where lines are drawn when they are released; the terminal's `writeln`. */
    setSink(sink: ((raw: string) => void) | null) {
        this.sink = sink;
    }

    get paused() {
        return this.pausedNow;
    }

    /** Stores a line and draws it, unless output is paused. */
    write(raw: string) {
        if (this.pausedNow) {
            this.held.push(raw);

            return;
        }

        this.append(raw);
        this.sink?.(raw);
    }

    setPaused(paused: boolean) {
        if (paused === this.pausedNow) {
            return;
        }

        this.pausedNow = paused;

        if (!paused) {
            const held = this.held;

            this.held = [];
            for (const raw of held) {
                this.append(raw);
                this.sink?.(raw);
            }
        }

        this.notify();
    }

    /** Forgets every line, such as when the history is requested again or the user clears the console. */
    clear() {
        this.lines = [];
        this.held = [];
        this.notify();
    }

    getLines(): readonly LogLine[] {
        return this.lines;
    }

    /** Changes whenever the lines or the pause state do. */
    getSnapshot = () => this.version;

    subscribe = (listener: () => void) => {
        this.listeners.add(listener);

        return () => {
            this.listeners.delete(listener);
        };
    };

    private append(raw: string) {
        // Wings can send several lines in one event.
        for (const part of raw.split(/\r?\n/)) {
            this.lines.push(parseLogLine(part));
        }

        if (this.lines.length > MAX_LOG_LINES) {
            this.lines.splice(0, this.lines.length - MAX_LOG_LINES);
        }

        this.scheduleNotify();
    }

    private scheduleNotify() {
        if (this.timer !== undefined) {
            return;
        }

        this.timer = setTimeout(() => {
            this.timer = undefined;
            this.notify();
        }, NOTIFY_DELAY_MS);
    }

    private notify() {
        clearTimeout(this.timer);
        this.timer = undefined;
        this.version++;
        for (const listener of this.listeners) {
            listener();
        }
    }
}
