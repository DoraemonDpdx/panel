import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { logger } from './logger.js';

const DAY = 86_400_000;
const WEEK = 7 * DAY;

interface Event {
    t: number;
    kind: 'command' | 'login' | 'dm_failed';
    name?: string;
}

export interface WindowStats {
    commands: Record<string, number>;
    total: number;
}

export interface StatsSnapshot {
    commands: { '24h': WindowStats; '7d': WindowStats };
    loginsIssued: { '24h': number; '7d': number };
    dmsFailed: { '24h': number; '7d': number };
}

/** Usage counters for the last 7 days, kept in `data/stats.json` so a restart does not reset them. */
export class StatsStore {
    private readonly file: string;
    private events: Event[] = [];
    private dirty = false;
    private timer: NodeJS.Timeout | undefined;

    constructor(
        dataDir: string,
        private readonly now: () => number = Date.now,
    ) {
        this.file = join(dataDir, 'stats.json');
        try {
            const raw = JSON.parse(readFileSync(this.file, 'utf8')) as unknown;
            if (Array.isArray(raw)) this.events = raw.filter((e): e is Event => typeof e?.t === 'number' && typeof e?.kind === 'string');
        } catch {
            // Fresh start.
        }
        this.prune();
    }

    command(name: string): void {
        this.add({ t: this.now(), kind: 'command', name });
    }

    loginIssued(): void {
        this.add({ t: this.now(), kind: 'login' });
    }

    dmFailed(): void {
        this.add({ t: this.now(), kind: 'dm_failed' });
    }

    snapshot(): StatsSnapshot {
        this.prune();
        const now = this.now();
        const within = (ms: number) => this.events.filter((e) => now - e.t <= ms);
        const commandsIn = (ms: number): WindowStats => {
            const commands: Record<string, number> = {};
            let total = 0;
            for (const e of within(ms)) {
                if (e.kind !== 'command' || !e.name) continue;
                commands[e.name] = (commands[e.name] ?? 0) + 1;
                total += 1;
            }

            return { commands, total };
        };
        const count = (kind: Event['kind'], ms: number) => within(ms).filter((e) => e.kind === kind).length;

        return {
            commands: { '24h': commandsIn(DAY), '7d': commandsIn(WEEK) },
            loginsIssued: { '24h': count('login', DAY), '7d': count('login', WEEK) },
            dmsFailed: { '24h': count('dm_failed', DAY), '7d': count('dm_failed', WEEK) },
        };
    }

    /** Write pending changes now (also called on shutdown). */
    flush(): void {
        if (this.timer) clearTimeout(this.timer);
        this.timer = undefined;
        if (!this.dirty) return;
        this.dirty = false;
        try {
            mkdirSync(dirname(this.file), { recursive: true });
            const tmp = `${this.file}.tmp`;
            writeFileSync(tmp, JSON.stringify(this.events));
            renameSync(tmp, this.file);
        } catch (error) {
            logger.warn('could not save stats', { reason: error instanceof Error ? error.message : String(error) });
        }
    }

    private add(event: Event): void {
        this.events.push(event);
        this.dirty = true;
        this.timer ??= setTimeout(() => this.flush(), 10_000).unref();
    }

    private prune(): void {
        const cutoff = this.now() - WEEK;
        if (this.events.length && this.events[0] && this.events[0].t < cutoff) this.events = this.events.filter((e) => e.t >= cutoff);
    }
}
