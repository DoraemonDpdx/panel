import { expect, it } from 'vitest';
import { createTestServer } from './fixtures';
import { appliesToWorkload, filterByWorkload, presentWorkloads, serverWorkload } from './workload';

it('reads the profile of a server and falls back to generic', () => {
    expect(serverWorkload(createTestServer({ workloadProfile: 'bot' }))).toBe('bot');
    expect(serverWorkload(undefined)).toBe('generic');

    const unknown = createTestServer();

    (unknown.attributes as { workload_profile: string }).workload_profile = 'spaceship';

    expect(serverWorkload(unknown)).toBe('generic');
});

it('applies unscoped things everywhere and scoped things to their profiles, and everything to generic', () => {
    expect(appliesToWorkload(undefined, 'database')).toBe(true);
    expect(appliesToWorkload(['game'], 'game')).toBe(true);
    expect(appliesToWorkload(['game'], 'bot')).toBe(false);
    expect(appliesToWorkload(['game'], 'generic')).toBe(true);
    expect(appliesToWorkload([], 'bot')).toBe(false);
});

it('lists the present profiles in a stable order and filters by one', () => {
    expect(presentWorkloads(['web', 'game', 'web', 'generic'])).toEqual(['game', 'web', 'generic']);

    const items = [
        { id: 1, workload: 'game' as const },
        { id: 2, workload: 'bot' as const },
        { id: 3, workload: 'game' as const },
    ];

    expect(filterByWorkload(items, 'all')).toHaveLength(3);
    expect(filterByWorkload(items, 'game').map((item) => item.id)).toEqual([1, 3]);
    expect(filterByWorkload(items, 'web')).toEqual([]);
});
