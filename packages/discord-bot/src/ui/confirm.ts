import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, type ChatInputCommandInteraction, type EmbedBuilder } from 'discord.js';
import { infoEmbed, warnEmbed } from './embeds.js';

export const CONFIRM_TIMEOUT_MS = 30_000;

export interface ConfirmOptions {
    title: string;
    description: string;
    confirmLabel?: string;
}

/**
 * Ask the invoker to confirm with Confirm / Cancel buttons, then run the action.
 *
 * The interaction must already be deferred (the router does this). Only the invoker can press the
 * buttons and the prompt expires after 30 seconds. Errors thrown by `run` propagate to the global
 * error handler, which edits the same reply.
 *
 * Returns true when the action ran.
 */
export async function confirmAndRun(
    interaction: ChatInputCommandInteraction,
    options: ConfirmOptions,
    run: () => Promise<EmbedBuilder>,
): Promise<boolean> {
    const confirmId = `confirm:${interaction.id}`;
    const cancelId = `cancel:${interaction.id}`;

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(confirmId).setLabel(options.confirmLabel ?? 'Confirm').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(cancelId).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
    );

    const message = await interaction.editReply({
        embeds: [warnEmbed(options.title, `${options.description}\n\nPress **Confirm** within ${CONFIRM_TIMEOUT_MS / 1000}s to continue.`)],
        components: [row],
    });

    let press;
    try {
        press = await message.awaitMessageComponent({
            componentType: ComponentType.Button,
            time: CONFIRM_TIMEOUT_MS,
            filter: (button) => button.user.id === interaction.user.id && (button.customId === confirmId || button.customId === cancelId),
        });
    } catch {
        await interaction.editReply({ embeds: [infoEmbed('Timed out', 'No confirmation received. Nothing was changed.')], components: [] });

        return false;
    }

    if (press.customId === cancelId) {
        await press.update({ embeds: [infoEmbed('Cancelled', 'Nothing was changed.')], components: [] });

        return false;
    }

    await press.update({ embeds: [infoEmbed('Working…')], components: [] });
    const result = await run();
    await interaction.editReply({ embeds: [result], components: [] });

    return true;
}
