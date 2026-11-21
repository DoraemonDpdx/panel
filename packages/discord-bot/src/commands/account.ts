import { ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { BotContext } from '../context.js';
import { linkUrl } from '../errorsView.js';
import { infoEmbed } from '../ui/embeds.js';
import { callFor } from './helpers.js';
import type { CustomerCommand } from './types.js';

async function execute(ctx: BotContext, i: ChatInputCommandInteraction): Promise<void> {
    const p = await callFor(ctx, i)<{ name: string; tier?: string; linkedAccounts?: number }>('me.profile');

    const embed = infoEmbed(`Hi, ${p.name}!`, 'Your Discord account is linked to your Astrelyse account.').addFields(
        ...(p.tier ? [{ name: 'Plan', value: p.tier, inline: true }] : []),
        ...(typeof p.linkedAccounts === 'number' && p.linkedAccounts > 1 ? [{ name: 'Linked accounts', value: String(p.linkedAccounts), inline: true }] : []),
        { name: 'Link or change it', value: 'You can link, relink or unlink Discord any time from your account page on the website.' },
    );

    await i.editReply({
        embeds: [embed],
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setLabel('Manage Discord link').setStyle(ButtonStyle.Link).setURL(linkUrl(ctx.config.siteUrl)))],
    });
}

export const accountCommand: CustomerCommand = {
    name: 'account',
    build: () => new SlashCommandBuilder().setName('account').setDescription('Your account and how to link Discord').toJSON(),
    execute,
};
