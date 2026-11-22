import { SlashCommandBuilder } from 'discord.js';
import { infoEmbed } from '../ui/embeds.js';
import type { CustomerCommand } from './types.js';

export const helpCommand: CustomerCommand = {
    name: 'help',
    build: () => new SlashCommandBuilder().setName('help').setDescription('What this bot can do').toJSON(),
    execute: async (_ctx, i) => {
        await i.editReply({
            embeds: [
                infoEmbed(
                    'Here’s what I can do 👋',
                    [
                        '**Your servers**',
                        '`/servers` — see them all',
                        '`/server info` · `status` · `power` · `console` — look after one',
                        '`/server backups` · `backup-create` · `backup-restore` · `reinstall`',
                        '',
                        '**Billing & help**',
                        '`/billing invoices` · `/billing services`',
                        '`/support tickets` · `/support open`',
                        '',
                        '**Account**',
                        '`/login` — a one-time sign-in link, sent by DM',
                        '`/account` — your profile and Discord link',
                        '`/status` — is everything up?',
                        '',
                        'Everything I say is private: only you can see it.',
                    ].join('\n'),
                ),
            ],
        });
    },
};
