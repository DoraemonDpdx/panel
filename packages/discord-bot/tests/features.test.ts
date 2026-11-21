import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { commands } from '../src/commands/index.js';
import { FeatureStore } from '../src/features.js';
import { handleCommand } from '../src/router.js';
import { StatsStore } from '../src/stats.js';

const dir = () => mkdtempSync(join(tmpdir(), 'bot-'));

describe('FeatureStore', () => {
    it('starts with everything on, persists updates and reloads them', () => {
        const d = dir();
        const store = new FeatureStore(d);
        expect(store.all()).toEqual({ servers: true, billing: true, support: true, login: true, status: true });

        store.update({ billing: false });
        expect(JSON.parse(readFileSync(join(d, 'settings.json'), 'utf8')).billing).toBe(false);
        expect(new FeatureStore(d).isEnabled('billing')).toBe(false);
        expect(new FeatureStore(d).isEnabled('servers')).toBe(true);
    });

    it('rejects unknown keys and non-booleans without changing anything', () => {
        const store = new FeatureStore(dir());
        expect(() => store.update({ login: false, bogus: true })).toThrow(/Unknown feature/);
        expect(() => store.update({ login: 'no' })).toThrow(/true or false/);
        expect(store.isEnabled('login')).toBe(true);
    });
});

describe('feature gate in the router', () => {
    const fakeInteraction = (name: string) => ({
        commandName: name,
        options: { getSubcommand: () => null },
        reply: vi.fn(async (_o?: unknown) => undefined),
        deferReply: vi.fn(async () => undefined),
        editReply: vi.fn(async () => undefined),
        deferred: false,
        replied: false,
    });

    it('answers a disabled feature with the plain message and does not run the command', async () => {
        const features = new FeatureStore(dir());
        features.update({ status: false });
        const ctx: any = { features, stats: new StatsStore(dir()), config: { siteUrl: 'https://site.test' } };
        const execute = vi.spyOn(commands.find((c) => c.name === 'status')!, 'execute');

        const interaction = fakeInteraction('status');
        await handleCommand(ctx, interaction as any);

        expect(execute).not.toHaveBeenCalled();
        const payload = interaction.reply.mock.calls[0]![0] as any;
        expect(payload.embeds[0].toJSON().title).toBe("This isn't available right now.");
        expect(payload.flags).toBeDefined();
        expect(interaction.deferReply).not.toHaveBeenCalled();
    });

    it('defers ephemerally, runs the command and counts it when enabled; /help is never gated', async () => {
        const features = new FeatureStore(dir());
        for (const f of ['servers', 'billing', 'support', 'login', 'status'] as const) features.update({ [f]: false });
        const stats = new StatsStore(dir());
        const ctx: any = { features, stats, config: { siteUrl: 'https://site.test' } };

        const interaction = fakeInteraction('help');
        await handleCommand(ctx, interaction as any);

        expect(interaction.deferReply).toHaveBeenCalledTimes(1);
        expect(interaction.editReply).toHaveBeenCalled();
        expect(stats.snapshot().commands['24h'].commands.help).toBe(1);
    });

    it('maps each command to its feature', () => {
        const map = Object.fromEntries(commands.map((c) => [c.name, c.feature]));
        expect(map).toMatchObject({ servers: 'servers', server: 'servers', billing: 'billing', support: 'support', login: 'login', status: 'status' });
        expect(map.account).toBeUndefined();
        expect(map.help).toBeUndefined();
    });
});

describe('StatsStore', () => {
    it('counts per command in 24h and 7d windows and prunes older events', () => {
        let now = 1_000_000_000_000;
        const s = new StatsStore(dir(), () => now);
        s.command('servers');
        now += 2 * 86_400_000;
        s.command('servers');
        s.command('login');
        s.loginIssued();
        s.dmFailed();

        const snap = s.snapshot();
        expect(snap.commands['24h']).toEqual({ commands: { servers: 1, login: 1 }, total: 2 });
        expect(snap.commands['7d'].commands.servers).toBe(2);
        expect(snap.loginsIssued).toEqual({ '24h': 1, '7d': 1 });
        expect(snap.dmsFailed['24h']).toBe(1);

        now += 6 * 86_400_000;
        expect(s.snapshot().commands['7d'].commands.servers).toBe(1);
    });
});
