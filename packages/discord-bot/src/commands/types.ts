import type { AutocompleteInteraction, ChatInputCommandInteraction, RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js';
import type { BotContext } from '../context.js';
import type { Feature } from '../features.js';

export interface CustomerCommand {
    name: string;
    /** Feature toggle that switches the whole command off. Commands without one are always on. */
    feature?: Feature;
    /** The command opens a modal first, so the router must not defer. */
    noDefer?: boolean;
    build(): RESTPostAPIChatInputApplicationCommandsJSONBody;
    /** Replies are always ephemeral; the router has already deferred (unless `noDefer`). */
    execute(ctx: BotContext, interaction: ChatInputCommandInteraction): Promise<void>;
    autocomplete?(ctx: BotContext, interaction: AutocompleteInteraction): Promise<void>;
}
