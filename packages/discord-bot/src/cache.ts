/** Tiny in-memory TTL cache, used to keep autocomplete from hammering the panel. */
export class TtlCache {
    private readonly entries = new Map<string, { expires: number; value: unknown }>();

    constructor(
        private readonly ttlMs = 30_000,
        private readonly maxEntries = 200,
        private readonly now: () => number = Date.now,
    ) {}

    async wrap<T>(key: string, loader: () => Promise<T>): Promise<T> {
        const hit = this.entries.get(key);
        if (hit && hit.expires > this.now()) return hit.value as T;

        const value = await loader();
        if (this.entries.size >= this.maxEntries) {
            const oldest = this.entries.keys().next();
            if (!oldest.done) this.entries.delete(oldest.value);
        }
        this.entries.set(key, { expires: this.now() + this.ttlMs, value });

        return value;
    }

    clear(): void {
        this.entries.clear();
    }
}
