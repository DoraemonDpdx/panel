import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import type { BotContext } from '../context.js';
import { infoEmbed } from '../ui/embeds.js';
import { code } from '../ui/format.js';
import { paginate } from '../ui/paginate.js';
import { listServers, stateLabel } from './helpers.js';
import type { CustomerCommand } from './types.js';

const PAGE = 10;

async function execute(ctx: BotContext, i: ChatInputCommandInteraction): Promise<void> {
    const servers = await listServers(ctx, i);

    if (servers.length === 0) {
        await i.editReply({ embeds: [infoEmbed('No servers yet', 'You don’t have any servers on this account yet. Once you order one, it will show up here.')] });

        return;
    }

    await paginate(i, async (page) => {
        const slice = servers.slice((page - 1) * PAGE, page * PAGE);
        const lines = slice.map((s) => `**${s.name}** — ${stateLabel(s.state)}${s.plan ? ` · ${s.plan}` : ''}\n${code(s.identifier)}${s.node ? ` · ${s.node}` : ''}`);

        return { embed: infoEmbed(`Your servers (${servers.length})`, lines.join('\n\n')), totalPages: Math.ceil(servers.length / PAGE) };
    });
}

export const serversCommand: CustomerCommand = {
    name: 'servers',
    feature: 'servers',
    build: () => new SlashCommandBuilder().setName('servers').setDescription('See all of your servers').toJSON(),
    execute,
};
