import { expect, it } from 'vitest';
import {
    canBulk,
    countByStatus,
    filterByStatus,
    groupServers,
    normalizePreferences,
    pinFirst,
    runBulk,
    togglePinned,
    type Listable,
} from './dashboardList';

const server = (uuid: string, overrides: Partial<Listable> = {}): Listable => ({
    uuid,
    name: uuid,
    workload: 'game',
    node: 'Node A',
    tags: [],
    status: 'running',
    ...overrides,
});

const servers = [
    server('a', { node: 'Node B', status: 'running', tags: ['minecraft'] }),
    server('b', { node: 'Node A', status: 'offline', workload: 'bot', tags: ['minecraft', 'modded'] }),
    server('c', { node: 'Node A', status: 'suspended' }),
    server('d', { node: 'Node B', status: null }),
];

it('filters by status and leaves transitional servers under All only', () => {
    expect(filterByStatus(servers, 'all')).toHaveLength(4);
    expect(filterByStatus(servers, 'running').map((s) => s.uuid)).toEqual(['a']);
    expect(filterByStatus(servers, 'offline').map((s) => s.uuid)).toEqual(['b']);
    expect(filterByStatus(servers, 'suspended').map((s) => s.uuid)).toEqual(['c']);
    expect(countByStatus(servers)).toEqual({ all: 4, running: 1, offline: 1, suspended: 1 });
});

it('puts pinned servers first and keeps the order of the rest', () => {
    expect(pinFirst(servers, ['c', 'a']).map((s) => s.uuid)).toEqual(['a', 'c', 'b', 'd']);
    expect(pinFirst(servers, []).map((s) => s.uuid)).toEqual(['a', 'b', 'c', 'd']);
    expect(pinFirst(servers, ['gone'])).toHaveLength(4);
});

it('toggles a pin on and off', () => {
    expect(togglePinned([], 'a')).toEqual(['a']);
    expect(togglePinned(['a', 'b'], 'a')).toEqual(['b']);
});

it('groups by node alphabetically with pins first in each group', () => {
    const groups = groupServers(servers, 'node', ['d']);

    expect(groups.map((g) => g.label)).toEqual(['Node A', 'Node B']);
    expect(groups[1].items.map((s) => s.uuid)).toEqual(['d', 'a']);
});

it('groups by game, by workload label', () => {
    const groups = groupServers(servers, 'game', []);

    expect(groups.map((g) => g.label)).toEqual(['Bot', 'Game']);
});

it('groups by tag, repeats multi-tag servers, and puts untagged last', () => {
    const groups = groupServers(servers, 'tag', []);

    expect(groups.map((g) => g.label)).toEqual(['Minecraft', 'Modded', 'Untagged']);
    expect(groups[0].items.map((s) => s.uuid)).toEqual(['a', 'b']);
    expect(groups[2].items.map((s) => s.uuid)).toEqual(['c', 'd']);
});

it('does not group by none and returns nothing for an empty list', () => {
    expect(groupServers(servers, 'none', ['b'])).toHaveLength(1);
    expect(groupServers(servers, 'none', ['b'])[0].items[0].uuid).toBe('b');
    expect(groupServers([], 'node', [])).toEqual([]);
});

it('falls back to defaults for unknown stored preferences', () => {
    expect(normalizePreferences({ group: 'project', status: 'x', pinned: ['a'] })).toEqual({
        pinned: ['a'],
        group: 'none',
        status: 'all',
    });
    expect(normalizePreferences(undefined).pinned).toEqual([]);
    // A stored `view` from before the grid was removed is ignored.
    expect(normalizePreferences({ view: 'grid', group: 'node', status: 'running' } as never)).toEqual({
        pinned: [],
        group: 'node',
        status: 'running',
    });
});

const all = { start: true, stop: true, restart: true };

it('allows a bulk signal only for a permitted server in a fitting state', () => {
    expect(canBulk('start', { permissions: all, status: 'offline' })).toBe(true);
    expect(canBulk('start', { permissions: all, status: 'running' })).toBe(false);
    expect(canBulk('stop', { permissions: all, status: 'running' })).toBe(true);
    expect(canBulk('restart', { permissions: all, status: 'offline' })).toBe(false);
    expect(canBulk('restart', { permissions: { ...all, restart: false }, status: 'running' })).toBe(false);
    expect(canBulk('start', { permissions: all, status: 'suspended' })).toBe(false);
});

it('reports each server of a bulk run on its own, and a failure does not stop the rest', async () => {
    const sent: string[] = [];
    const progress: number[] = [];
    const results = await runBulk(
        [
            { uuid: 'a', name: 'A', allowed: true },
            { uuid: 'b', name: 'B', allowed: true },
            { uuid: 'c', name: 'C', allowed: false },
            { uuid: 'd', name: 'D', allowed: true },
        ],
        async (uuid) => {
            sent.push(uuid);

            if (uuid === 'b') {
                throw new Error('Daemon unreachable');
            }
        },
        (partial) => progress.push(partial.length)
    );

    expect(sent).toEqual(['a', 'b', 'd']);
    expect(results.map((r) => [r.uuid, r.ok])).toEqual([
        ['a', true],
        ['b', false],
        ['c', false],
        ['d', true],
    ]);
    expect(results[1].message).toBe('Daemon unreachable');
    expect(results[2].message).toMatch(/skipped/i);
    expect(progress).toEqual([1, 2, 3, 4]);
});

it('gives a generic message when a failure carries none', async () => {
    const [result] = await runBulk([{ uuid: 'a', name: 'A', allowed: true }], () => Promise.reject('nope'));

    expect(result).toMatchObject({ ok: false, message: 'The request failed.' });
});
