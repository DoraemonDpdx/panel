import { describe, expect, it, vi } from 'vitest';
import { AccountMemory, callWithPicker, CustomerClient, CustomerError, type AccountPicker } from '../src/customer/client.js';
import { jsonResponse, mockFetch } from './helpers.js';

const invoker = { discordId: '111111111111111111', guildId: '222222222222222222', channelId: '333333333333333333' };
const make = (responses: Parameters<typeof mockFetch>[0]) => {
    const m = mockFetch(responses);

    return { ...m, client: new CustomerClient({ siteUrl: 'https://site.test/', secret: 'secret-secret-secret', fetch: m.fetch }) };
};

describe('CustomerClient', () => {
    it('posts the contract body with the bearer secret and returns data', async () => {
        const { client, calls } = make([jsonResponse({ ok: true, data: [{ identifier: 'abc' }] })]);

        await expect(client.call(invoker, 'server.list')).resolves.toEqual([{ identifier: 'abc' }]);
        expect(calls[0]).toMatchObject({
            url: 'https://site.test/api/bot/customer',
            method: 'POST',
            headers: { Authorization: 'Bearer secret-secret-secret' },
            body: { invokerDiscordId: invoker.discordId, guildId: invoker.guildId, channelId: invoker.channelId, command: 'server.list', args: {} },
        });
        expect(calls[0]?.body).not.toHaveProperty('account');
    });

    it('sends account and args when given', async () => {
        const { client, calls } = make([jsonResponse({ ok: true, data: {} })]);
        await client.call(invoker, 'server.power', { server: 'abc', signal: 'stop' }, 'user-1');
        expect(calls[0]?.body).toMatchObject({ account: 'user-1', args: { server: 'abc', signal: 'stop' } });
    });

    it.each([
        ['not_linked', 403],
        ['not_customer', 403],
        ['rate_limited', 429],
        ['not_found', 404],
        ['forbidden', 403],
        ['panel_unavailable', 503],
        ['server_error', 500],
    ] as const)('maps %s', async (code, status) => {
        const { client } = make([jsonResponse({ error: code }, status)]);
        await expect(client.call(invoker, 'x.y')).rejects.toMatchObject({ code, status });
    });

    it('keeps the field on bad_request', async () => {
        const { client } = make([jsonResponse({ error: 'bad_request', field: 'subject' }, 400)]);
        await expect(client.call(invoker, 'support.open')).rejects.toMatchObject({ code: 'bad_request', field: 'subject' });
    });

    it('parses pick_account choices and drops malformed ones', async () => {
        const { client } = make([jsonResponse({ error: 'pick_account', accounts: [{ id: 'a', label: 'Main' }, { id: 'b' }, { nope: 1 }] }, 409)]);
        const error = await client.call(invoker, 'x.y').catch((e) => e);
        expect(error).toBeInstanceOf(CustomerError);
        expect(error.accounts).toEqual([
            { id: 'a', label: 'Main' },
            { id: 'b', label: 'b' },
        ]);
    });

    it('falls back on the HTTP status when the body is unusable', async () => {
        const { client } = make([new Response('<html>', { status: 502 }), new Response('', { status: 401 }), new Response('', { status: 429 })]);
        await expect(client.call(invoker, 'a.b')).rejects.toMatchObject({ code: 'server_error' });
        await expect(client.call(invoker, 'a.b')).rejects.toMatchObject({ code: 'unauthorized' });
        await expect(client.call(invoker, 'a.b')).rejects.toMatchObject({ code: 'rate_limited' });
    });

    it('treats an unknown error string as server_error and a 200 without ok as an error', async () => {
        const { client } = make([jsonResponse({ error: 'weird' }, 500), jsonResponse({ nothing: true }, 200)]);
        await expect(client.call(invoker, 'a.b')).rejects.toMatchObject({ code: 'server_error' });
        await expect(client.call(invoker, 'a.b')).rejects.toMatchObject({ code: 'server_error' });
    });

    it('reports a network failure as unreachable', async () => {
        const { client } = make([new TypeError('fetch failed')]);
        await expect(client.call(invoker, 'a.b')).rejects.toMatchObject({ code: 'unreachable', status: 0 });
    });
});

describe('pick_account retry', () => {
    const pickBody = { error: 'pick_account', accounts: [{ id: 'u1', label: 'Alice shop' }, { id: 'u2', label: 'Alice game' }] };

    it('asks the picker, retries once with the chosen account and remembers it', async () => {
        const { client, calls } = make([jsonResponse(pickBody, 409), jsonResponse({ ok: true, data: 'first' }), jsonResponse({ ok: true, data: 'second' })]);
        const picker: AccountPicker = { pick: vi.fn(async () => 'u2') };
        const memory = new AccountMemory();

        await expect(callWithPicker(client, memory, picker, invoker, 'server.list')).resolves.toBe('first');
        expect(picker.pick).toHaveBeenCalledWith(pickBody.accounts);
        expect(calls[0]?.body).not.toHaveProperty('account');
        expect(calls[1]?.body.account).toBe('u2');

        // Second command: no menu, the remembered account is sent straight away.
        await expect(callWithPicker(client, memory, picker, invoker, 'billing.services')).resolves.toBe('second');
        expect(picker.pick).toHaveBeenCalledTimes(1);
        expect(calls[2]?.body.account).toBe('u2');
    });

    it('does not loop when the retry fails, and forgets a stale account', async () => {
        const { client, calls } = make([jsonResponse(pickBody, 409), jsonResponse({ error: 'forbidden' }, 403)]);
        const memory = new AccountMemory();
        await expect(callWithPicker(client, memory, { pick: async () => 'u1' }, invoker, 'x.y')).rejects.toMatchObject({ code: 'forbidden' });
        expect(calls).toHaveLength(2);
        expect(memory.get(invoker.discordId)).toBeUndefined();
    });

    it('propagates when the customer never chooses', async () => {
        const { client } = make([jsonResponse(pickBody, 409)]);
        const memory = new AccountMemory();
        await expect(callWithPicker(client, memory, { pick: async () => Promise.reject(new Error('timeout')) }, invoker, 'x.y')).rejects.toThrow('timeout');
        expect(memory.get(invoker.discordId)).toBeUndefined();
    });

    it('rethrows pick_account that has no choices, and other errors untouched', async () => {
        const { client } = make([jsonResponse({ error: 'pick_account', accounts: [] }, 409)]);
        const picker: AccountPicker = { pick: vi.fn(async () => 'x') };
        await expect(callWithPicker(client, new AccountMemory(), picker, invoker, 'x.y')).rejects.toMatchObject({ code: 'pick_account' });
        expect(picker.pick).not.toHaveBeenCalled();
    });

    it('expires the remembered account', () => {
        let now = 0;
        const memory = new AccountMemory(1000, () => now);
        memory.set('d', 'u1');
        now = 999;
        expect(memory.get('d')).toBe('u1');
        now = 1000;
        expect(memory.get('d')).toBeUndefined();
    });
});
