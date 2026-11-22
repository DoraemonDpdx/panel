/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { fuzzyScore, groupItems, moveIndex, pushRecent, rankItems, readRecents, type PaletteItem } from './search';

const nav = { type: 'navigate', destination: { to: '/' } } as const;
const item = (id: string, kind: PaletteItem['kind'], label: string, extra: Partial<PaletteItem> = {}): PaletteItem => ({
    id,
    kind,
    label,
    action: nav,
    ...extra,
});

const items = [
    item('s1', 'server', 'Survival'),
    item('s2', 'server', 'Skyblock'),
    item('p1', 'page', 'Backups'),
    item('p2', 'page', 'Console'),
    item('a1', 'action', 'Restart server', { hint: 'Survival', showWhenIdle: true }),
    item('a2', 'action', 'Restart server', { hint: 'Skyblock', showWhenIdle: false }),
];

describe('fuzzyScore', () => {
    it('ranks prefix above word start above substring above subsequence', () => {
        const prefix = fuzzyScore('sur', 'Survival')!;
        const word = fuzzyScore('sur', 'My Survival')!;
        const sub = fuzzyScore('viv', 'Survival')!;
        const seq = fuzzyScore('srvl', 'Survival')!;

        expect(prefix).toBeGreaterThan(word);
        expect(word).toBeGreaterThan(sub);
        expect(sub).toBeGreaterThan(seq);
        expect(seq).toBeGreaterThan(0);
    });

    it('returns null when nothing matches and 0 for an empty query', () => {
        expect(fuzzyScore('zzz', 'Survival')).toBeNull();
        expect(fuzzyScore('', 'Survival')).toBe(0);
    });

    it('matches several words in any order', () => {
        expect(fuzzyScore('restart surv', 'Restart server Survival')).not.toBeNull();
        expect(fuzzyScore('restart nope', 'Restart server Survival')).toBeNull();
    });
});

describe('rankItems', () => {
    it('orders by score and drops non-matches', () => {
        const ranked = rankItems(items, 'sky').map((entry) => entry.id);

        expect(ranked[0]).toBe('s2');
        expect(ranked).not.toContain('p2');
    });

    it('finds an action on a named server', () => {
        expect(rankItems(items, 'restart sky')[0]?.id).toBe('a2');
    });

    it('hides non-idle actions until typed for, and puts recents first when idle', () => {
        const idle = rankItems(items, '', ['p2', 's2']).map((entry) => entry.id);

        expect(idle).not.toContain('a2');
        expect(idle.slice(0, 2)).toEqual(['p2', 's2']);
    });

    it('bumps a recent item above an equal match', () => {
        const tied = [item('x', 'page', 'Settings'), item('y', 'page', 'Settings')];

        expect(rankItems(tied, 'set', ['y'])[0]?.id).toBe('y');
    });
});

describe('groupItems', () => {
    it('lists a Recent section first when idle, without repeating its items', () => {
        const sections = groupItems(rankItems(items, '', ['p2']), '', ['p2']);

        expect(sections.map((section) => section.heading)).toEqual(['Recent', 'Servers', 'Pages', 'Actions']);
        expect(sections[2]?.items.map((entry) => entry.id)).toEqual(['p1']);
    });

    it('has no Recent section while searching', () => {
        const sections = groupItems(rankItems(items, 'sur', ['p2']), 'sur', ['p2']);

        expect(sections.some((section) => section.heading === 'Recent')).toBe(false);
    });
});

describe('moveIndex', () => {
    it('wraps in both directions and handles an empty list', () => {
        expect(moveIndex(0, -1, 3)).toBe(2);
        expect(moveIndex(2, 1, 3)).toBe(0);
        expect(moveIndex(0, 1, 0)).toBe(-1);
    });
});

describe('recents', () => {
    it('persists per user, newest first, without duplicates', () => {
        localStorage.clear();
        pushRecent('u1', 'a');
        pushRecent('u1', 'b');
        pushRecent('u1', 'a');
        pushRecent('u2', 'z');

        expect(readRecents('u1')).toEqual(['a', 'b']);
        expect(readRecents('u2')).toEqual(['z']);
    });

    it('survives unreadable storage', () => {
        localStorage.setItem('astrelyse.palette.recent.bad', '{not json');

        expect(readRecents('bad')).toEqual([]);
    });
});
