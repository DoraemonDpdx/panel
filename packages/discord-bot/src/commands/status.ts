import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { BotContext } from '../context.js';
import { infoEmbed } from '../ui/embeds.js';
import { truncate } from '../ui/format.js';
import { callFor, pick } from './helpers.js';
import type { CustomerCommand } from './types.js';

const icon = (s: unknown) => {
    const v = String(s ?? '').toLowerCase();

    return /^(up|ok|online|operational|healthy|running)$/.test(v) ? '🟢' : /^(degraded|partial|slow|maintenance)$/.test(v) ? '🟡' : /^(down|offline|outage|error)$/.test(v) ? '🔴' : '⚪';
};

function lines(value: unknown): string[] {
    if (!Array.isArray(value)) return [];

    return value.map((item) => `${icon(pick(item, 'status', 'state'))} **${truncate(String(pick(item, 'name', 'label', 'id') ?? 'Service'), 60)}** — ${pick(item, 'status', 'state') ?? 'unknown'}`);
}

async function execute(ctx: BotContext, i: ChatInputCommandInteraction): Promise<void> {
    const d = await callFor(ctx, i)<any>('status.platform');

    const nodes = lines(pick(d, 'nodes'));
    const services = lines(pick(d, 'services')).concat(Array.isArray(d) ? lines(d) : []);
    const overall = pick<string>(d, 'overall', 'status', 'state');

    const embed = infoEmbed('Platform status', overall ? `${icon(overall)} ${overall}` : undefined);
    if (nodes.length) embed.addFields({ name: 'Nodes', value: truncate(nodes.join('\n'), 1000) });
    if (services.length) embed.addFields({ name: 'Services', value: truncate(services.join('\n'), 1000) });
    if (!nodes.length && !services.length && !overall) embed.setDescription('Everything we can see looks normal.');

    await i.editReply({ embeds: [embed] });
}

export const statusCommand: CustomerCommand = {
    name: 'status',
    feature: 'status',
    build: () => new SlashCommandBuilder().setName('status').setDescription('Is Astrelyse up? Platform status').toJSON(),
    execute,
};
