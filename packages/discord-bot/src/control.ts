import { createHash, timingSafeEqual } from 'node:crypto';
import http from 'node:http';
import type { FeatureStore } from './features.js';
import { logger } from './logger.js';
import type { StatsStore } from './stats.js';

/**
 * Control API for the website's owner dashboard (/customerbot). Server-to-server:
 * send `Authorization: Bearer <CONTROL_SECRET>`. Same auth and /v1/status shape as moderation-bot/src/api.js.
 *
 *   GET  /health        no auth, for uptime checks
 *   GET  /v1/status     { ok, user:{tag,avatar}, uptimeSeconds, pingMs, guilds, commands, node }
 *   POST /v1/stop       exits with code 0 after answering
 *   POST /v1/restart    exits with code 75 after answering (run under a supervisor that restarts on failure)
 *   GET  /v1/stats      { commands:{24h,7d}, loginsIssued, dmsFailed }
 *   GET  /v1/settings   { servers, billing, support, login, status }  (booleans)
 *   PUT  /v1/settings   any subset of those booleans
 */
export const RESTART_EXIT_CODE = 75;

export interface BotView {
    ready: boolean;
    user: { tag: string; avatar: string | null } | null;
    pingMs: number;
    guilds: number;
    commands: number;
}

export interface ControlDeps {
    secret: string;
    bot: () => BotView;
    features: FeatureStore;
    stats: StatsStore;
    /** Called after the HTTP answer was sent. */
    onExit: (code: number) => void;
}

class HttpError extends Error {
    constructor(
        public readonly status: number,
        message: string,
    ) {
        super(message);
    }
}

const digest = (s: string) => createHash('sha256').update(s).digest();

function send(res: http.ServerResponse, status: number, body: unknown): void {
    const text = JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(text), 'Cache-Control': 'no-store' });
    res.end(text);
}

async function readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
    if (req.method === 'GET') return {};
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
        size += (chunk as Buffer).length;
        if (size > 32_768) throw new HttpError(413, 'Body too large');
        chunks.push(chunk as Buffer);
    }
    if (!chunks.length) return {};
    try {
        const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
    } catch {
        // fall through
    }
    throw new HttpError(400, 'Body must be a JSON object');
}

export function createControlServer(deps: ControlDeps): http.Server {
    const secretHash = digest(deps.secret);
    const authorised = (req: http.IncomingMessage) => {
        const match = /^Bearer (.+)$/.exec(req.headers.authorization ?? '');

        return !!match?.[1] && timingSafeEqual(digest(match[1]), secretHash);
    };

    // Slow down guessing: 20 bad tokens a minute per address, then 429.
    const strikes = new Map<string, number[]>();
    const recent = (ip: string) => (strikes.get(ip) ?? []).filter((t) => Date.now() - t < 60_000);
    const blocked = (ip: string) => recent(ip).length >= 20;
    const strike = (ip: string) => {
        strikes.set(ip, [...recent(ip), Date.now()]);
        if (strikes.size > 2000) strikes.clear();
    };

    const route = (req: http.IncomingMessage, path: string, body: Record<string, unknown>, res: http.ServerResponse): unknown => {
        const get = req.method === 'GET';
        const [, v, what] = path.split('/');
        if (v !== 'v1') throw new HttpError(404, 'Not found');

        if (what === 'status' && get) {
            const bot = deps.bot();
            if (!bot.ready) throw new HttpError(503, 'The bot is still connecting to Discord');

            return {
                ok: true,
                user: bot.user,
                uptimeSeconds: Math.floor(process.uptime()),
                pingMs: bot.pingMs,
                guilds: bot.guilds,
                commands: bot.commands,
                node: process.version,
            };
        }
        if (what === 'stats' && get) return deps.stats.snapshot();
        if (what === 'settings' && get) return deps.features.all();
        if (what === 'settings' && req.method === 'PUT') {
            if (Object.keys(body).length === 0) throw new HttpError(400, 'Send at least one feature');
            try {
                return deps.features.update(body);
            } catch (error) {
                throw new HttpError(400, error instanceof Error ? error.message : 'Invalid settings');
            }
        }
        if ((what === 'stop' || what === 'restart') && req.method === 'POST') {
            const code = what === 'stop' ? 0 : RESTART_EXIT_CODE;
            logger.warn(`control api: ${what} requested`);
            res.once('finish', () => setTimeout(() => deps.onExit(code), 100));

            return { ok: true, action: what };
        }

        throw new HttpError(404, 'Not found');
    };

    const server = http.createServer(async (req, res) => {
        const ip = req.socket.remoteAddress ?? '?';
        const url = new URL(req.url ?? '/', 'http://x');
        const path = url.pathname.replace(/\/+$/, '');
        try {
            if (path === '/health' && req.method === 'GET') return void send(res, 200, { ok: true, ready: deps.bot().ready });
            if (blocked(ip)) throw new HttpError(429, 'Too many failed attempts');
            if (!authorised(req)) {
                strike(ip);
                throw new HttpError(401, 'Missing or wrong API secret');
            }
            send(res, 200, route(req, path, await readBody(req), res));
        } catch (error) {
            if (error instanceof HttpError) return void send(res, error.status, { error: error.message });
            logger.error('control api error', { reason: error instanceof Error ? error.message : String(error) });
            send(res, 500, { error: 'Internal error' });
        }
    });
    server.requestTimeout = 60_000;

    return server;
}
