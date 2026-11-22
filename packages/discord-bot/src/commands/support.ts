import { ActionRowBuilder, MessageFlags, ModalBuilder, SlashCommandBuilder, TextInputBuilder, TextInputStyle, type ChatInputCommandInteraction } from 'discord.js';
import type { BotContext } from '../context.js';
import { sendError } from '../errorsView.js';
import { UserError } from '../errors.js';
import { infoEmbed, successEmbed } from '../ui/embeds.js';
import { discordTime, truncate } from '../ui/format.js';
import { paginate } from '../ui/paginate.js';
import { callFor } from './helpers.js';
import type { CustomerCommand } from './types.js';

interface Ticket {
    number: string | number;
    subject: string;
    status: string;
    updated?: string;
}

const MODAL_WAIT_MS = 10 * 60_000;

async function tickets(ctx: BotContext, i: ChatInputCommandInteraction): Promise<void> {
    const list = (await callFor(ctx, i)<Ticket[]>('support.tickets')) ?? [];

    if (list.length === 0) {
        await i.editReply({ embeds: [infoEmbed('No tickets', 'You haven’t opened any tickets. Need a hand? Use `/support open`.')] });

        return;
    }

    await paginate(i, async (page) => {
        const lines = list.slice((page - 1) * 8, page * 8).map((t) => `🎫 **#${t.number}** — ${truncate(t.subject, 80)}\n${t.status}${t.updated ? ` · updated ${discordTime(t.updated)}` : ''}`);

        return { embed: infoEmbed('Your tickets', lines.join('\n\n')), totalPages: Math.ceil(list.length / 8) };
    });
}

/** The modal must be the first response, so this command is not deferred by the router. */
async function open(ctx: BotContext, i: ChatInputCommandInteraction): Promise<void> {
    const category = i.options.getString('category', true);
    const modalId = `support-open:${i.id}`;

    await i.showModal(
        new ModalBuilder()
            .setCustomId(modalId)
            .setTitle('Open a support ticket')
            .addComponents(
                new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('subject').setLabel('What’s it about?').setStyle(TextInputStyle.Short).setMinLength(3).setMaxLength(120).setRequired(true)),
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder().setCustomId('message').setLabel('Tell us what’s going on').setStyle(TextInputStyle.Paragraph).setMinLength(10).setMaxLength(2000).setRequired(true),
                ),
            ),
    );

    let submit;
    try {
        submit = await i.awaitModalSubmit({ time: MODAL_WAIT_MS, filter: (m) => m.customId === modalId && m.user.id === i.user.id });
    } catch {
        return; // The customer closed the form: nothing to say.
    }

    await submit.deferReply({ flags: MessageFlags.Ephemeral });
    try {
        const subject = submit.fields.getTextInputValue('subject').trim();
        const message = submit.fields.getTextInputValue('message').trim();
        if (!subject || !message) throw new UserError('Please fill in both boxes.');

        const result = await callFor(ctx, submit)<{ number: string | number; url?: string }>('support.open', { subject, category, message });
        await submit.editReply({
            embeds: [successEmbed('Ticket opened', `Thanks! We’ve opened ticket **#${result.number}** and will get back to you.${result.url ? `\n[Open it on the website](${result.url})` : ''}`)],
        });
    } catch (error) {
        await sendError({ deferred: true, replied: true, editReply: (o) => submit.editReply(o), reply: (o) => submit.editReply(o) }, error, ctx.config.siteUrl);
    }
}

async function execute(ctx: BotContext, i: ChatInputCommandInteraction): Promise<void> {
    return i.options.getSubcommand() === 'open' ? open(ctx, i) : tickets(ctx, i);
}

export const supportCommand: CustomerCommand = {
    name: 'support',
    feature: 'support',
    noDefer: true,
    build: () =>
        new SlashCommandBuilder()
            .setName('support')
            .setDescription('Get help from the team')
            .addSubcommand((s) => s.setName('tickets').setDescription('See your support tickets'))
            .addSubcommand((s) =>
                s
                    .setName('open')
                    .setDescription('Open a new support ticket')
                    .addStringOption((o) =>
                        o
                            .setName('category')
                            .setDescription('What kind of help')
                            .setRequired(true)
                            .addChoices({ name: 'General', value: 'general' }, { name: 'Billing', value: 'billing' }, { name: 'Technical', value: 'technical' }),
                    ),
            )
            .toJSON(),
    execute: async (ctx, i) => {
        // `tickets` needs a deferred reply; `open` must show the modal first.
        if (i.options.getSubcommand() !== 'open') await i.deferReply({ flags: MessageFlags.Ephemeral });

        return execute(ctx, i);
    },
};
