import { ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { BotContext } from '../context.js';
import { CustomerError } from '../customer/client.js';
import { errorFields, logger } from '../logger.js';
import { infoEmbed, successEmbed, warnEmbed } from '../ui/embeds.js';
import { callFor } from './helpers.js';
import type { CustomerCommand } from './types.js';

/**
 * `/login`: DM a one-time sign-in link. The link is delivered ONLY by DM, in a link button: it is never
 * placed in a channel message or in the ephemeral reply (docs/BOT_SPLIT_PLAN.md section 3).
 */
async function execute(ctx: BotContext, i: ChatInputCommandInteraction): Promise<void> {
    const result = await callFor(ctx, i)<{ url: string; expiresAt?: string }>('auth.loginLink');

    // Never forward a link that does not point at our own site.
    let target: URL;
    try {
        target = new URL(result.url);
    } catch {
        throw new CustomerError('server_error', 500);
    }
    if (target.origin !== new URL(ctx.config.siteUrl).origin) throw new CustomerError('server_error', 500);

    ctx.stats.loginIssued();

    try {
        await i.user.send({
            embeds: [infoEmbed('Your sign-in link', 'Here’s your sign-in link. It works **once** and expires in **5 minutes**. Don’t share it with anyone.')],
            components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setLabel('Sign in to Astrelyse').setStyle(ButtonStyle.Link).setURL(target.toString()))],
        });
    } catch (error) {
        ctx.stats.dmFailed();
        logger.warn('login dm failed', { user: i.user.id, ...errorFields(error) });
        await i.editReply({
            embeds: [
                warnEmbed(
                    'I couldn’t send you a DM',
                    'Your direct messages are closed, so I can’t deliver your sign-in link safely.\n\n**To allow DMs:** open this server’s name menu → **Privacy Settings** → turn on **Direct Messages**. Then run `/login` again.',
                ),
            ],
            components: [],
        });

        return;
    }

    await i.editReply({ embeds: [successEmbed('Check your DMs 📬', 'I’ve sent you a sign-in link. It works once and expires in 5 minutes.')], components: [] });
}

export const loginCommand: CustomerCommand = {
    name: 'login',
    feature: 'login',
    build: () => new SlashCommandBuilder().setName('login').setDescription('Get a one-time sign-in link to the website, by DM').toJSON(),
    execute,
};
