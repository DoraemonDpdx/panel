import type { PanelDestination } from '@/sdk/navigation';

export type PaletteKind = 'server' | 'page' | 'action';

/** An action the palette can run, resolved by `runPaletteAction`. */
export type PaletteAction =
    | { type: 'navigate'; destination: PanelDestination }
    | { type: 'power'; uuid: string; signal: 'start' | 'stop' | 'restart'; name: string }
    | { type: 'backup'; uuid: string; name: string };

export interface PaletteItem {
    /** Stable across sessions; recents are stored by id. */
    id: string;
    kind: PaletteKind;
    label: string;
    /** A secondary line, such as the server an action targets. */
    hint?: string;
    /** Extra searchable text that is not shown. */
    keywords?: string;
    /** Shown while the search box is empty (actions on other servers only appear once typed for). */
    showWhenIdle?: boolean;
    action: PaletteAction;
}

export interface PaletteSection {
    heading: string;
    items: PaletteItem[];
}

const WORD_START = /[\s\-_./:]/;

/**
 * How well `query` matches `text`, or null when it does not. A prefix beats a word-start match, which beats a
 * substring, which beats a scattered subsequence; an empty query matches everything with 0.
 */
export function fuzzyScore(query: string, text: string): number | null {
    const q = query.trim().toLowerCase();
    const t = text.toLowerCase();

    if (q === '') {
        return 0;
    }

    if (t.startsWith(q)) {
        return 1000 - (t.length - q.length);
    }

    for (let i = 1; i < t.length; i++) {
        if (WORD_START.test(t[i - 1] ?? '') && t.startsWith(q, i)) {
            return 800 - i;
        }
    }

    const at = t.indexOf(q);

    if (at >= 0) {
        return 600 - at;
    }

    // Every query word must match somewhere ("restart surv" finds "Restart server Survival").
    const words = q.split(/\s+/).filter(Boolean);

    if (words.length > 1) {
        const scores = words.map((word) => fuzzyScore(word, text));

        return scores.every((score) => score !== null) ? Math.min(...(scores as number[])) - 50 - words.length : null;
    }

    let position = 0;
    let gaps = 0;
    let previous = -1;

    for (const char of q) {
        const found = t.indexOf(char, position);

        if (found < 0) {
            return null;
        }

        if (previous >= 0 && found !== previous + 1) {
            gaps += found - previous;
        }

        previous = found;
        position = found + 1;
    }

    return Math.max(1, 300 - gaps);
}

const itemScore = (item: PaletteItem, query: string): number | null => {
    const label = fuzzyScore(query, `${item.label} ${item.hint ?? ''}`);
    const keywords = item.keywords ? fuzzyScore(query, item.keywords) : null;

    if (label === null) {
        return keywords === null ? null : keywords - 100;
    }

    return keywords === null ? label : Math.max(label, keywords - 100);
};

/** Items that match `query`, best first; recents get a bump and, with no query, come first in recency order. */
export function rankItems(
    items: readonly PaletteItem[],
    query: string,
    recents: readonly string[] = []
): PaletteItem[] {
    const recency = (id: string) => {
        const index = recents.indexOf(id);

        return index < 0 ? -1 : recents.length - index;
    };

    if (query.trim() === '') {
        return items
            .filter((item) => item.showWhenIdle !== false || recency(item.id) >= 0)
            .map((item, order) => ({ item, order }))
            .sort((a, b) => recency(b.item.id) - recency(a.item.id) || a.order - b.order)
            .map(({ item }) => item);
    }

    return items
        .map((item, order) => ({ item, order, score: itemScore(item, query) }))
        .filter((entry): entry is { item: PaletteItem; order: number; score: number } => entry.score !== null)
        .map((entry) => ({
            item: entry.item,
            order: entry.order,
            score: entry.score + (recency(entry.item.id) >= 0 ? 40 : 0),
        }))
        .sort((a, b) => b.score - a.score || a.order - b.order)
        .map(({ item }) => item);
}

const HEADINGS = { server: 'Servers', page: 'Pages', action: 'Actions' } satisfies Record<PaletteKind, string>;
const ORDER: PaletteKind[] = ['server', 'page', 'action'];
const RECENT_LIMIT = 5;

/**
 * Groups ranked items: with no query a "Recent" section first (items already shown there are not repeated),
 * then servers, pages and actions. Concatenating the sections gives the order arrow keys walk.
 */
export function groupItems(
    ranked: readonly PaletteItem[],
    query: string,
    recents: readonly string[]
): PaletteSection[] {
    const sections: PaletteSection[] = [];
    let rest = ranked;

    if (query.trim() === '') {
        const recent = recents
            .map((id) => ranked.find((item) => item.id === id))
            .filter((item): item is PaletteItem => !!item)
            .slice(0, RECENT_LIMIT);

        if (recent.length > 0) {
            sections.push({ heading: 'Recent', items: recent });
            rest = ranked.filter((item) => !recent.includes(item));
        }
    }

    for (const kind of ORDER) {
        const items = rest.filter((item) => item.kind === kind);

        if (items.length > 0) {
            sections.push({ heading: HEADINGS[kind], items });
        }
    }

    return sections;
}

/** The next active index for an arrow key, wrapping at both ends. */
export function moveIndex(current: number, delta: 1 | -1, length: number): number {
    return length === 0 ? -1 : (current + delta + length) % length;
}

const storageKey = (userId: string) => `astrelyse.palette.recent.${userId}`;
const MAX_RECENTS = 12;

export function readRecents(userId: string): string[] {
    try {
        const parsed = JSON.parse(localStorage.getItem(storageKey(userId)) ?? '[]');

        return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
        return [];
    }
}

/** Puts `id` first in the user's recents and returns the new list. */
export function pushRecent(userId: string, id: string): string[] {
    const next = [id, ...readRecents(userId).filter((entry) => entry !== id)].slice(0, MAX_RECENTS);

    try {
        localStorage.setItem(storageKey(userId), JSON.stringify(next));
    } catch {
        // Storage can be blocked; recents are a convenience.
    }

    return next;
}
