import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { BotContext } from '../context.js';
import { UserError } from '../errors.js';
import { infoEmbed } from '../ui/embeds.js';
import { discordTime, truncate } from '../ui/format.js';
import { paginate } from '../ui/paginate.js';
import { callFor } from './helpers.js';
import type { CustomerCommand } from './types.js';

interface Invoice {
    id: string;
    number: string;
    total: number | string;
    currency: string;
    status: string;
    due?: string | null;
    payUrl?: string;
}

interface Service {
    id: string;
    name: string;
    status: string;
    renews?: string | null;
    price?: number | string;
}

const PAGE = 8;

const money = (amount: number | string, currency: string) => {
    const n = typeof amount === 'number' ? amount : Number(amount);

    return Number.isFinite(n) ? `${n.toFixed(2)} ${currency}` : `${amount} ${currency}`;
};

const statusIcon = (status: string) => (status === 'paid' ? '✅' : status === 'unpaid' || status === 'overdue' ? '🧾' : '•');

async function invoices(ctx: BotContext, i: ChatInputCommandInteraction): Promise<void> {
    const status = i.options.getString('show') ?? 'unpaid';
    const list = (await callFor(ctx, i)<Invoice[]>('billing.invoices', { status })) ?? [];

    if (list.length === 0) {
        await i.editReply({ embeds: [infoEmbed(status === 'unpaid' ? 'All paid up 🎉' : 'No invoices yet', status === 'unpaid' ? 'You have no unpaid invoices.' : 'You don’t have any invoices yet.')] });

        return;
    }

    await paginate(i, async (page) => {
        const lines = list.slice((page - 1) * PAGE, page * PAGE).map((inv) => {
            const pay = inv.payUrl && inv.status !== 'paid' ? ` · [Pay now](${inv.payUrl})` : inv.payUrl ? ` · [View](${inv.payUrl})` : '';

            return `${statusIcon(inv.status)} **${truncate(String(inv.number), 40)}** — ${money(inv.total, inv.currency)} · ${inv.status}${inv.due ? ` · due ${discordTime(inv.due, 'R')}` : ''}${pay}`;
        });

        return { embed: infoEmbed(status === 'unpaid' ? 'Your unpaid invoices' : 'Your invoices', lines.join('\n')), totalPages: Math.ceil(list.length / PAGE) };
    });
}

async function services(ctx: BotContext, i: ChatInputCommandInteraction): Promise<void> {
    const list = (await callFor(ctx, i)<Service[]>('billing.services')) ?? [];

    if (list.length === 0) {
        await i.editReply({ embeds: [infoEmbed('No services yet', 'You don’t have any services yet.')] });

        return;
    }

    await paginate(i, async (page) => {
        const lines = list.slice((page - 1) * PAGE, page * PAGE).map((s) => `**${truncate(s.name, 60)}** — ${s.status}${s.renews ? ` · renews ${discordTime(s.renews, 'R')}` : ''}${s.price !== undefined ? ` · ${s.price}` : ''}`);

        return { embed: infoEmbed('Your services', lines.join('\n')), totalPages: Math.ceil(list.length / PAGE) };
    });
}

async function execute(ctx: BotContext, i: ChatInputCommandInteraction): Promise<void> {
    switch (i.options.getSubcommand()) {
        case 'invoices':
            return invoices(ctx, i);
        case 'services':
            return services(ctx, i);
        default:
            throw new UserError('I don’t know that one. Try `/help`.');
    }
}

export const billingCommand: CustomerCommand = {
    name: 'billing',
    feature: 'billing',
    build: () =>
        new SlashCommandBuilder()
            .setName('billing')
            .setDescription('Your invoices and services')
            .addSubcommand((s) =>
                s
                    .setName('invoices')
                    .setDescription('See your invoices')
                    .addStringOption((o) => o.setName('show').setDescription('Which ones (default: unpaid)').addChoices({ name: 'Unpaid only', value: 'unpaid' }, { name: 'All', value: 'all' })),
            )
            .addSubcommand((s) => s.setName('services').setDescription('See your services and when they renew'))
            .toJSON(),
    execute,
};
