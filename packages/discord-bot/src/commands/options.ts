import type { SlashCommandStringOption } from 'discord.js';

export const serverOption = (o: SlashCommandStringOption) => o.setName('server').setDescription('Which of your servers').setRequired(true).setAutocomplete(true);
