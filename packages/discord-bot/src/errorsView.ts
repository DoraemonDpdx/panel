import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, type APIEmbed } from 'discord.js';
import { CustomerError } from './customer/client.js';
import { UserError } from './errors.js';
import { errorFields, logger } from './logger.js';
import { errorEmbed, infoEmbed } from './ui/embeds.js';

export const linkUrl = (siteUrl: string) => `${siteUrl}/account/discord`;

/** Words for the customer: no codes, no panel jargon. */
export function describeError(error: unknown, siteUrl: string): { embeds: APIEmbed[]; components: ActionRowBuilder<ButtonBuilder>[] } {
    const plain = (title: string, text: string) => ({ embeds: [errorEmbed(title, text).toJSON()], components: [] });

    if (error instanceof UserError) return plain('Hmm, that did not work', error.message);

    if (error instanceof CustomerError) {
        switch (error.code) {
            case 'not_linked':
                return {
                    embeds: [infoEmbed('Let’s link your account first', 'I can’t find an Astrelyse account connected to this Discord account yet. Link it on the website (it takes a few seconds), then try again.').toJSON()],
                    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setLabel('Link my Discord account').setStyle(ButtonStyle.Link).setURL(linkUrl(siteUrl)))],
                };
            case 'not_customer':
                return plain('This bot is for customers', 'Your account is a team account, so please use the team bot instead.');
            case 'rate_limited':
                return plain('Slow down a little', 'You’ve done that quite a few times in a short while. Please try again in a bit.');
            case 'bad_request':
                return plain('Something looks off', error.field ? `Please check the “${error.field}” value and try again.` : 'Please check what you entered and try again.');
            case 'not_found':
                return plain('I couldn’t find that', 'It may not exist, or it may not be yours. Try picking it from the suggestions.');
            case 'forbidden':
                return plain('That isn’t allowed', 'Your account can’t do that.');
            case 'panel_unavailable':
                return plain('Game panel is busy', 'The game panel isn’t answering right now. Please try again in a minute.');
            case 'pick_account':
                return plain('Which account?', 'You have more than one account. Please run the command again and choose one.');
            case 'unreachable':
            case 'unauthorized':
            case 'server_error':
                return plain('Something went wrong on our side', 'We’ve noted it. Please try again in a moment.');
        }
    }

    return plain('Something went wrong', 'It has been logged. Please try again in a moment.');
}

interface Replyable {
    deferred: boolean;
    replied: boolean;
    editReply(options: any): Promise<unknown>;
    reply(options: any): Promise<unknown>;
}

/** Show an error on whatever reply state the interaction is in. Always ephemeral. */
export async function sendError(interaction: Replyable, error: unknown, siteUrl: string): Promise<void> {
    if (!(error instanceof UserError || error instanceof CustomerError)) logger.error('interaction failed', errorFields(error));
    else if (error instanceof CustomerError && ['server_error', 'unreachable', 'unauthorized'].includes(error.code)) logger.error('customer api failed', { code: error.code, status: error.status });

    const view = describeError(error, siteUrl);
    if (interaction.deferred || interaction.replied) await interaction.editReply({ ...view }).catch(() => undefined);
    else await interaction.reply({ ...view, flags: MessageFlags.Ephemeral }).catch(() => undefined);
}
