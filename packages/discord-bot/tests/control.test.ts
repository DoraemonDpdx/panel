import { mkdtempSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createControlServer, RESTART_EXIT_CODE } from '../src/control.js';
import { FeatureStore } from '../src/features.js';
import { StatsStore } from '../src/stats.js';

const SECRET = 'control-secret-0123456789';
const servers: import('node:http').Server[] = [];
afterEach(() => void servers.splice(0).forEach((s) => s.close()));

async function start(ready = true) {
    const dir = mkdtempSync(join(tmpdir(), 'bot-'));
    const onExit = vi.fn();
    const stats = new StatsStore(dir);
    stats.command('servers');
    const server = createControlServer({
        secret: SECRET,
        features: new FeatureStore(dir),
        stats,
        onExit,
        bot: () => ({ ready, user: { tag: 'Bot#0001', avatar: null }, pingMs: 42, guilds: 3, commands: 8 }),
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    servers.push(server);
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const req = (path: string, init: { method?: string; token?: string | null; body?: unknown } = {}) =>
        fetch(base + path, {
            method: init.method ?? 'GET',
            headers: { ...(init.token === null ? {} : { Authorization: `Bearer ${init.token ?? SECRET}` }), ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
            body: init.body ? JSON.stringify(init.body) : undefined,
        });

    return { req, onExit };
}

describe('control API', () => {
    it('serves /health without auth', async () => {
        const { req } = await start();
        const res = await req('/health', { token: null });
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ok: true, ready: true });
    });

    it('rejects missing and wrong secrets with 401, and never leaks data', async () => {
        const { req } = await start();
        for (const token of [null, 'wrong', SECRET + 'x', '']) {
            const res = await req('/v1/status', { token });
            expect(res.status).toBe(401);
            expect(await res.json()).toEqual({ error: 'Missing or wrong API secret' });
        }
        expect((await req('/v1/settings', { method: 'PUT', token: 'nope', body: { login: false } })).status).toBe(401);
        expect((await req('/v1/stop', { method: 'POST', token: 'nope' })).status).toBe(401);
    });

    it('rate limits repeated bad secrets', async () => {
        const { req } = await start();
        for (let n = 0; n < 20; n++) await req('/v1/status', { token: 'bad' });
        expect((await req('/v1/status', { token: 'bad' })).status).toBe(429);
        expect((await req('/v1/status')).status).toBe(429);
    });

    it('answers /v1/status in the moderation-bot shape', async () => {
        const { req } = await start();
        const body: any = await (await req('/v1/status')).json();
        expect(body).toMatchObject({ ok: true, user: { tag: 'Bot#0001', avatar: null }, pingMs: 42, guilds: 3, commands: 8, node: process.version });
        expect(typeof body.uptimeSeconds).toBe('number');
    });

    it('answers 503 on status while Discord is connecting', async () => {
        const { req } = await start(false);
        expect((await req('/v1/status')).status).toBe(503);
    });

    it('serves stats', async () => {
        const { req } = await start();
        const body: any = await (await req('/v1/stats')).json();
        expect(body.commands['24h']).toEqual({ commands: { servers: 1 }, total: 1 });
        expect(body).toHaveProperty('loginsIssued');
        expect(body).toHaveProperty('dmsFailed');
    });

    it('reads and updates feature toggles, rejecting bad input', async () => {
        const { req } = await start();
        expect(await (await req('/v1/settings')).json()).toEqual({ servers: true, billing: true, support: true, login: true, status: true });

        const put = await req('/v1/settings', { method: 'PUT', body: { billing: false } });
        expect(put.status).toBe(200);
        expect(((await put.json()) as any).billing).toBe(false);
        expect(((await (await req('/v1/settings')).json()) as any).billing).toBe(false);

        expect((await req('/v1/settings', { method: 'PUT', body: { nope: true } })).status).toBe(400);
        expect((await req('/v1/settings', { method: 'PUT', body: { login: 'x' } })).status).toBe(400);
        expect((await req('/v1/settings', { method: 'PUT', body: {} })).status).toBe(400);
    });

    it('stop and restart answer first, then exit with their codes', async () => {
        const { req, onExit } = await start();
        expect((await req('/v1/status')).status).toBe(200);
        expect(onExit).not.toHaveBeenCalled();

        const stop = await req('/v1/stop', { method: 'POST' });
        expect(await stop.json()).toEqual({ ok: true, action: 'stop' });
        await vi.waitFor(() => expect(onExit).toHaveBeenCalledWith(0));

        await req('/v1/restart', { method: 'POST' });
        await vi.waitFor(() => expect(onExit).toHaveBeenCalledWith(RESTART_EXIT_CODE));
    });

    it('404s unknown routes and wrong methods', async () => {
        const { req } = await start();
        expect((await req('/v1/nothing')).status).toBe(404);
        expect((await req('/v1/stop')).status).toBe(404);
        expect((await req('/other')).status).toBe(404);
    });
});
