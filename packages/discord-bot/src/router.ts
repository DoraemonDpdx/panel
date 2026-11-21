import { MessageFlags, type AutocompleteInteraction, type ChatInputCommandInteraction } from 'discord.js';
import { commandByName } from './commands/index.js';
import type { BotContext } from './context.js';
import { sendError } from './errorsView.js';
import { DISABLED_MESSAGE } from './features.js';
import { logger } from './logger.js';
import { infoEmbed } from './ui/embeds.js';

/** One slash command: feature gate, usage stats, ephemeral defer, then the handler. Every reply is ephemeral. */
export async function handleCommand(ctx: BotContext, interaction: ChatInputCommandInteraction): Promise<void> {
    const command = commandByName(interaction.commandName);
    if (!command) return;

    try {
        if (command.feature && !ctx.features.isEnabled(command.feature)) {
            await interaction.reply({ embeds: [infoEmbed(DISABLED_MESSAGE)], flags: MessageFlags.Ephemeral });

            return;
        }

        const sub = interaction.options.getSubcommand(false);
        const name = sub ? `${command.name} ${sub}` : command.name;
        ctx.stats.command(name);
        logger.info('command', { command: name });

        if (!command.noDefer) await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await command.execute(ctx, interaction);
    } catch (error) {
        await sendError(interaction, error, ctx.config.siteUrl);
    }
}

export async function handleAutocomplete(ctx: BotContext, interaction: AutocompleteInteraction): Promise<void> {
    const command = commandByName(interaction.commandName);
    try {
        if (!command?.autocomplete || (command.feature && !ctx.features.isEnabled(command.feature))) return void (await interaction.respond([]));
        await command.autocomplete(ctx, interaction);
    } catch {
        await interaction.respond([]).catch(() => undefined);
    }
}
