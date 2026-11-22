import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, type APIEmbed } from 'discord.js';

/** Which bot this is, as the site's outbox knows it. */
export const BOT = 'panel';

export const GREEN = 0x22c55e;
export const RED = 0xef4444;
export const GREY = 0x6b7280;
export const LIME = 0xb4ff1e;

/** decided_via / origin value → the words the customer reads. */
export const VIA_LABEL: Record<string, string> = {
    panel: 'the Astrelyse website',
    game_panel: 'the game panel',
    discord: 'Discord',
    email: 'the email link',
};

export const viaLabel = (via: string | null | undefined): string => (via ? VIA_LABEL[via] : undefined) ?? 'another place';

export type ConsentState = 'pending' | 'approved' | 'denied' | 'expired' | 'revoked';

export interface ConsentEvent {
    id: string;
    kind: 'request' | 'resolved';
    requestId: string;
    discordId: string;
    staffName: string;
    ticketSubject: string | null;
    requestExpiresAt: string;
    reason: string | null;
    state: ConsentState;
    decidedVia: string | null;
    decidedAt: string | null;
    grantExpiresAt: string | null;
    dm: { channelId: string; messageId: string } | null;
}

export interface ParsedConsentId {
    decision: 'approve' | 'deny';
    requestId: string;
    channelId: string | null;
}

/** `uc:<a|d>:<id>` and the legacy `uc:<a|d>:<id>:<channelId>`. Null when it is not a consent button. */
export function parseConsentId(customId: string): ParsedConsentId | null {
    const m = /^uc:([ad]):([0-9a-fA-F-]{8,64})(?::(\d{5,25}))?$/.exec(customId ?? '');

    return m ? { decision: m[1] === 'a' ? 'approve' : 'deny', requestId: m[2]!, channelId: m[3] ?? null } : null;
}

const secs = (iso: string | null | undefined): number => Math.floor(new Date(iso ?? Date.now()).getTime() / 1000);
const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** The DM for a new request. Never contains customer data. */
export function requestMessage(ev: ConsentEvent, siteUrl: string, avatarUrl?: string) {
    const staff = clip(ev.staffName || 'Astrelyse team', 100);
    const embed = new EmbedBuilder()
        .setColor(LIME)
        .setTitle('Astrelyse support is asking to view your account')
        .setDescription(`**${staff}** wants to see your account details so they can help you. Nothing is shared unless you press Approve.`)
        .addFields(
            { name: 'Staff', value: staff, inline: true },
            ...(ev.reason ? [{ name: 'Reason', value: clip(ev.reason, 500), inline: false }] : []),
            { name: 'How long', value: 'Access ends 24 h after you approve', inline: true },
            { name: 'Request expires', value: `<t:${secs(ev.requestExpiresAt)}:R>`, inline: true },
        )
        .setFooter({ text: 'Astrelyse', ...(avatarUrl ? { iconURL: avatarUrl } : {}) })
        .setTimestamp();
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`uc:a:${ev.requestId}`).setLabel('Approve').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`uc:d:${ev.requestId}`).setLabel('Deny').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setLabel('Review on the website').setStyle(ButtonStyle.Link).setURL(`${siteUrl}/dashboard/privacy`),
    );

    return { embeds: [embed], components: [row], allowedMentions: { parse: [] as never[] } };
}

/** The embed for an answered request (buttons are removed by the caller). */
export function resolvedEmbed(
    r: { state: string; via: string | null | undefined; grantExpiresAt?: string | null; already?: boolean },
    base?: APIEmbed | null,
): EmbedBuilder {
    const e = (base ? EmbedBuilder.from(base) : new EmbedBuilder().setTitle('Astrelyse support is asking to view your account')).setFields([]).setImage(null);
    const where = viaLabel(r.via);

    if (r.state === 'approved') {
        const until = r.grantExpiresAt ? `<t:${secs(r.grantExpiresAt)}:f>` : '24 hours after approval';

        return e
            .setColor(GREEN)
            .setTitle(r.already ? `Already approved on ${where}` : `Approved on ${where}`)
            .setDescription(`Support can view your account until ${until}. Revoke any time on the website or panel.`);
    }
    if (r.state === 'denied') return e.setColor(RED).setTitle(r.already ? `Already denied on ${where}` : `Denied on ${where}`).setDescription('Nothing was shared.');
    if (r.state === 'revoked') return e.setColor(GREY).setTitle(`Access ${r.already ? 'already ' : ''}revoked on ${where}`).setDescription('Support can no longer view your account.');

    return e.setColor(GREY).setTitle('This request expired').setDescription('Nothing was shared.');
}
