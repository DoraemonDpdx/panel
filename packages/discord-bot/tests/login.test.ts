import { describe, expect, it, vi } from 'vitest';
import { loginCommand } from '../src/commands/login.js';
import { AccountMemory, CustomerClient } from '../src/customer/client.js';
import { StatsStore } from '../src/stats.js';
import { jsonResponse, mockFetch } from './helpers.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const LINK = 'https://site.test/auth/discord?t=SECRETTOKEN123';

function setup(send: () => Promise<unknown>, link = LINK) {
    const m = mockFetch([jsonResponse({ ok: true, data: { url: link, expiresAt: '2030-01-01T00:00:00Z' } })]);
    const stats = new StatsStore(mkdtempSync(join(tmpdir(), 'bot-')));
    const ctx: any = {
        config: { siteUrl: 'https://site.test' },
        customer: new CustomerClient({ siteUrl: 'https://site.test', secret: 's'.repeat(16), fetch: m.fetch }),
        accounts: new AccountMemory(),
        stats,
    };
    const userSend = vi.fn((_o?: unknown) => send());
    const replies: unknown[] = [];
    const interaction: any = {
        id: 'i1',
        user: { id: '111111111111111111', send: userSend },
        guildId: 'g',
        channelId: 'c',
        editReply: vi.fn(async (o: unknown) => void replies.push(o)),
        reply: vi.fn(async (o: unknown) => void replies.push(o)),
    };

    return { ctx, interaction, userSend, replies, stats };
}

const everythingInReplies = (replies: unknown[]) => JSON.stringify(replies.map((r: any) => ({ ...r, embeds: r.embeds?.map((e: any) => e.toJSON()), components: r.components?.map((c: any) => c.toJSON()) })));

describe('/login', () => {
    it('DMs the link in a link button and never puts it in the interaction reply', async () => {
        const { ctx, interaction, userSend, replies, stats } = setup(async () => ({}));
        await loginCommand.execute(ctx, interaction);

        expect(userSend).toHaveBeenCalledTimes(1);
        const dm = userSend.mock.calls[0]![0] as any;
        expect(JSON.stringify(dm.components[0].toJSON())).toContain(LINK);
        expect(JSON.stringify(dm.embeds[0].toJSON())).toContain('expires in **5 minutes**');

        expect(everythingInReplies(replies)).not.toContain('SECRETTOKEN123');
        expect(everythingInReplies(replies)).toContain('Check your DMs');
        expect(interaction.reply).not.toHaveBeenCalled();
        expect(stats.snapshot().loginsIssued['24h']).toBe(1);
        expect(stats.snapshot().dmsFailed['24h']).toBe(0);
    });

    it('tells the customer how to allow DMs when the DM fails, still without the link', async () => {
        const { ctx, interaction, replies, stats } = setup(async () => {
            throw Object.assign(new Error('Cannot send messages to this user'), { code: 50007 });
        });
        await loginCommand.execute(ctx, interaction);

        const text = everythingInReplies(replies);
        expect(text).not.toContain('SECRETTOKEN123');
        expect(text).not.toContain('/auth/discord');
        expect(text).toContain('Direct Messages');
        expect(stats.snapshot().dmsFailed['24h']).toBe(1);
    });

    it('refuses a link that does not point at the site', async () => {
        const { ctx, interaction, userSend } = setup(async () => ({}), 'https://evil.test/auth/discord?t=x');
        await expect(loginCommand.execute(ctx, interaction)).rejects.toMatchObject({ code: 'server_error' });
        expect(userSend).not.toHaveBeenCalled();
    });
});
