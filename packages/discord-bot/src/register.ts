import { REST, Routes } from 'discord.js';
import { buildCommands } from './commands/index.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const rest = new REST({ version: '10' }).setToken(config.discordToken);
const body = buildCommands();

// Bulk-overwrites THIS application's commands (other applications' commands are untouched).
await rest.put(config.guildId ? Routes.applicationGuildCommands(config.clientId, config.guildId) : Routes.applicationCommands(config.clientId), { body });
console.log(`Registered ${body.length} commands ${config.guildId ? `in guild ${config.guildId}` : 'globally'}.`);
