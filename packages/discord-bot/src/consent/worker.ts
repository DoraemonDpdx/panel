import type { Client } from 'discord.js';
import type { DashboardClient } from '../dashboard/client.js';
import { errorFields, logger } from '../logger.js';
import { BOT, requestMessage, resolvedEmbed, type ConsentEvent } from './shared.js';

/** Discord: "Cannot send messages to this user". */
const DM_CLOSED = 50007;
const UNKNOWN_USER = 10013;

export const POLL_MS = 5_000;

type Site = Pick<DashboardClient, 'postRaw' | 'url'>;
type DiscordLike = Pick<Client, 'users' | 'channels' | 'user'>;

const code = (e: unknown): number | undefined => (e as { code?: number } | null)?.code;

/** Deliver one claimed event: send the request DM, or edit the DM this bot sent earlier. Always acks. */
export async function deliver(discord: DiscordLike, site: Site, ev: ConsentEvent): Promise<void> {
    const ack = (body: Record<string, unknown>) => site.postRaw('/api/bot/consent-events', { action: 'ack', id: ev.id, ...body });

    if (ev.kind === 'request') {
        let user;
        try {
            user = await discord.users.fetch(ev.discordId);
        } catch (e) {
            await ack({ ok: false, code: code(e) === UNKNOWN_USER ? 'unknown_user' : 'other', error: `discord_${code(e) ?? 'error'}` });

            return;
        }
        try {
            const msg = await user.send(requestMessage(ev, site.url, discord.user?.displayAvatarURL()));
            await ack({ ok: true, channelId: msg.channelId, messageId: msg.id });
        } catch (e) {
            await ack({ ok: false, code: code(e) === DM_CLOSED ? 'dm_closed' : 'other', error: `discord_${code(e) ?? 'error'}` });
        }

        return;
    }

    // resolved: edit our own DM. A message that is gone still counts as done.
    try {
        const channel = ev.dm ? await discord.channels.fetch(ev.dm.channelId).catch(() => null) : null;
        const msg = channel && 'messages' in channel && ev.dm ? await channel.messages.fetch(ev.dm.messageId).catch(() => null) : null;
        if (msg) {
            await msg.edit({
                embeds: [resolvedEmbed({ state: ev.state, via: ev.decidedVia, grantExpiresAt: ev.grantExpiresAt }, msg.embeds[0]?.toJSON())],
                components: [],
            });
        }
        await ack({ ok: true });
    } catch (e) {
        await ack({ ok: false, code: 'other', error: `discord_${code(e) ?? 'error'}` });
    }
}

/** One poll: claim a batch and deliver it. Returns the number of events handled. */
export async function tick(discord: DiscordLike, site: Site): Promise<number> {
    const r = await site.postRaw<{ events?: ConsentEvent[] }>('/api/bot/consent-events', { action: 'claim', bot: BOT });
    if (r.status !== 200) return 0;
    const events: ConsentEvent[] = Array.isArray(r.events) ? r.events : [];
    for (const ev of events) {
        try {
            await deliver(discord, site, ev);
        } catch (error) {
            logger.error('consent delivery crashed', errorFields(error));
            await site.postRaw('/api/bot/consent-events', { action: 'ack', id: ev.id, ok: false, code: 'other', retry: true, error: 'bot_error' });
        }
    }

    return events.length;
}

/** Start the 5 s loop (unref'd). A site outage only pauses it. */
export function startConsentWorker(discord: DiscordLike, site: Site, intervalMs = POLL_MS): NodeJS.Timeout {
    let busy = false;
    const run = async () => {
        if (busy) return;
        busy = true;
        try {
            await tick(discord, site);
        } catch (error) {
            logger.error('consent poll failed', errorFields(error));
        } finally {
            busy = false;
        }
    };
    const timer = setInterval(run, intervalMs);
    timer.unref();

    return timer;
}
