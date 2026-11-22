import { describe, expect, it, vi } from 'vitest';
import { AccountMemory } from '../src/customer/client.js';
import { callFor } from '../src/commands/helpers.js';
import { jsonResponse, mockFetch } from './helpers.js';
import { CustomerClient } from '../src/customer/client.js';

describe('select menu picker', () => {
    it('shows a menu to the invoker and retries with the pick', async () => {
        const m = mockFetch([
            jsonResponse({ error: 'pick_account', accounts: [{ id: 'u1', label: 'One' }, { id: 'u2', label: 'Two' }] }, 409),
            jsonResponse({ ok: true, data: { name: 'Two' } }),
        ]);
        const ctx: any = { customer: new CustomerClient({ siteUrl: 'https://site.test', secret: 's'.repeat(16), fetch: m.fetch }), accounts: new AccountMemory() };

        const update = vi.fn();
        const message = { awaitMessageComponent: vi.fn(async (opts: any) => {
            expect(opts.filter({ user: { id: 'me' }, customId: 'account:i1' })).toBe(true);
            expect(opts.filter({ user: { id: 'someone-else' }, customId: 'account:i1' })).toBe(false);

            return { values: ['u2'], update };
        }) };
        const interaction: any = { id: 'i1', user: { id: 'me' }, guildId: null, channelId: null, editReply: vi.fn(async () => message) };

        await expect(callFor(ctx, interaction)('me.profile')).resolves.toEqual({ name: 'Two' });

        const menu = JSON.stringify(interaction.editReply.mock.calls[0][0].components[0].toJSON());
        expect(menu).toContain('"label":"One"');
        expect(menu).toContain('"value":"u2"');
        expect(m.calls[1]?.body.account).toBe('u2');
        expect(update).toHaveBeenCalled();
    });
});
