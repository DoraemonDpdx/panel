import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { logger } from './logger.js';

export const FEATURES = ['servers', 'billing', 'support', 'login', 'status'] as const;
export type Feature = (typeof FEATURES)[number];
export type Toggles = Record<Feature, boolean>;

export const DISABLED_MESSAGE = "This isn't available right now.";

const defaults = (): Toggles => ({ servers: true, billing: true, support: true, login: true, status: true });

/** Feature toggles, persisted as JSON in the bot's data directory. */
export class FeatureStore {
    private readonly file: string;
    private toggles: Toggles = defaults();

    constructor(dataDir: string) {
        this.file = join(dataDir, 'settings.json');
        try {
            const raw = JSON.parse(readFileSync(this.file, 'utf8')) as Record<string, unknown>;
            for (const feature of FEATURES) if (typeof raw[feature] === 'boolean') this.toggles[feature] = raw[feature];
        } catch {
            // First run or unreadable file: everything on.
        }
    }

    isEnabled(feature: Feature): boolean {
        return this.toggles[feature];
    }

    all(): Toggles {
        return { ...this.toggles };
    }

    /** Apply a partial update. Throws on unknown keys or non-boolean values and changes nothing then. */
    update(patch: Record<string, unknown>): Toggles {
        const next = { ...this.toggles };
        for (const [key, value] of Object.entries(patch)) {
            if (!(FEATURES as readonly string[]).includes(key)) throw new RangeError(`Unknown feature "${key}"`);
            if (typeof value !== 'boolean') throw new RangeError(`"${key}" must be true or false`);
            next[key as Feature] = value;
        }
        this.toggles = next;
        this.save();

        return this.all();
    }

    private save(): void {
        try {
            mkdirSync(dirname(this.file), { recursive: true });
            const tmp = `${this.file}.tmp`;
            writeFileSync(tmp, JSON.stringify(this.toggles, null, 2));
            renameSync(tmp, this.file);
        } catch (error) {
            logger.warn('could not save settings', { reason: error instanceof Error ? error.message : String(error) });
        }
    }
}
