import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, type ChatInputCommandInteraction, type EmbedBuilder } from 'discord.js';

export interface LoadedPage {
    embed: EmbedBuilder;
    totalPages: number;
}

const IDLE_MS = 120_000;

/** Show page `start` and let the invoker flip through pages with Previous / Next buttons. */
export async function paginate(
    interaction: ChatInputCommandInteraction,
    load: (page: number) => Promise<LoadedPage>,
    start = 1,
): Promise<void> {
    const prevId = `prev:${interaction.id}`;
    const nextId = `next:${interaction.id}`;

    let page = Math.max(1, start);
    let current = await load(page);
    if (page > current.totalPages && current.totalPages > 0) {
        page = current.totalPages;
        current = await load(page);
    }

    const render = (loaded: LoadedPage, disabled = false) => {
        const embed = loaded.embed.setFooter({ text: `Page ${page} of ${Math.max(loaded.totalPages, 1)}` });
        const components =
            loaded.totalPages > 1
                ? [
                      new ActionRowBuilder<ButtonBuilder>().addComponents(
                          new ButtonBuilder().setCustomId(prevId).setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(disabled || page <= 1),
                          new ButtonBuilder().setCustomId(nextId).setLabel('Next').setStyle(ButtonStyle.Primary).setDisabled(disabled || page >= loaded.totalPages),
                      ),
                  ]
                : [];

        return { embeds: [embed], components };
    };

    const message = await interaction.editReply(render(current));
    if (current.totalPages <= 1) return;

    const collector = message.createMessageComponentCollector({
        componentType: ComponentType.Button,
        idle: IDLE_MS,
        filter: (button) => button.user.id === interaction.user.id && (button.customId === prevId || button.customId === nextId),
    });

    collector.on('collect', async (button) => {
        try {
            page = button.customId === nextId ? page + 1 : page - 1;
            current = await load(page);
            await button.update(render(current));
        } catch {
            await button.deferUpdate().catch(() => undefined);
        }
    });

    collector.on('end', () => {
        interaction.editReply(render(current, true)).catch(() => undefined);
    });
}
