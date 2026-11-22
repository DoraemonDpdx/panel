import { MessageFlags, type ButtonInteraction } from 'discord.js';
import type { DashboardClient } from '../dashboard/client.js';
import { errorFields, logger } from '../logger.js';
import { parseConsentId, resolvedEmbed } from './shared.js';

/** Approve / Deny in the consent DM. The site decides whether the clicker is really the customer. */
export async function consentButtonHandler(interaction: ButtonInteraction, site: Pick<DashboardClient, 'postRaw'>): Promise<void> {
    const p = parseConsentId(interaction.customId);
    if (!p) return;

    try {
        await interaction.deferUpdate();
        const r = await site.postRaw('/api/bot/consent', { clickerDiscordId: interaction.user.id, requestId: p.requestId, decision: p.decision });
        const old = interaction.message.embeds[0]?.toJSON();

        if (r.status === 409) {
            await interaction.editReply({ embeds: [resolvedEmbed({ state: r.state ?? 'expired', via: r.decidedVia, grantExpiresAt: r.grantExpiresAt, already: true }, old)], components: [] });

            return;
        }
        if (r.status !== 200) {
            const why = r.error === 'already_answered' ? 'This request was already answered or has expired.' : "This request isn't yours to answer.";
            await interaction.followUp({ content: why, flags: MessageFlags.Ephemeral });

            return;
        }

        const approved = r.decision === 'approve';
        await interaction.editReply({
            embeds: [resolvedEmbed({ state: approved ? 'approved' : 'denied', via: 'discord', grantExpiresAt: r.grantExpiresAt ?? new Date(Date.now() + 24 * 3_600_000).toISOString() }, old)],
            components: [],
        });

        // Tell the staff member in the ticket. No customer data.
        const channelId = (r.ticketChannelId as string | undefined) ?? p.channelId;
        const staffId = r.staffDiscordId as string | undefined;
        const channel = channelId ? await interaction.client.channels.fetch(channelId).catch(() => null) : null;
        if (channel?.isSendable() && staffId) {
            await channel
                .send({ content: approved ? `<@${staffId}> the customer approved. Run \`/userinfo\` again.` : `<@${staffId}> the customer declined access.`, allowedMentions: { users: [staffId] } })
                .catch(() => undefined);
        }
    } catch (error) {
        logger.error('consent button failed', errorFields(error));
    }
}
