import { Client, Events, GatewayIntentBits } from 'discord.js';
import { TtlCache } from './cache.js';
import { loadConfig } from './config.js';
import { createControlServer } from './control.js';
import type { BotContext } from './context.js';
import { AccountMemory, CustomerClient } from './customer/client.js';
import { buildCommands } from './commands/index.js';
import { FeatureStore } from './features.js';
import { errorFields, logger } from './logger.js';
import { handleAutocomplete, handleCommand } from './router.js';
import { StatsStore } from './stats.js';

const config = loadConfig();

const discord = new Client({ intents: [GatewayIntentBits.Guilds] });
const stats = new StatsStore(config.dataDir);
const features = new FeatureStore(config.dataDir);

const ctx: BotContext = {
    config,
    discord,
    customer: new CustomerClient({ siteUrl: config.siteUrl, secret: config.customerBotSecret }),
    accounts: new AccountMemory(),
    cache: new TtlCache(30_000),
    features,
    stats,
};

discord.on(Events.InteractionCreate, (interaction) => {
    if (interaction.isChatInputCommand()) void handleCommand(ctx, interaction);
    else if (interaction.isAutocomplete()) void handleAutocomplete(ctx, interaction);
});

discord.once(Events.ClientReady, (client) => logger.info('ready', { user: client.user.tag }));

function shutdown(code: number): void {
    stats.flush();
    void discord.destroy().finally(() => process.exit(code));
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
        logger.info('shutting down', { signal });
        shutdown(0);
    });
}
process.on('unhandledRejection', (reason) => logger.error('unhandled rejection', errorFields(reason)));

if (config.controlSecret) {
    const control = createControlServer({
        secret: config.controlSecret,
        features,
        stats,
        onExit: shutdown,
        bot: () => ({
            ready: discord.isReady(),
            user: discord.user ? { tag: discord.user.tag, avatar: discord.user.displayAvatarURL() } : null,
            pingMs: Math.round(discord.ws.ping),
            guilds: discord.guilds.cache.size,
            commands: buildCommands().length,
        }),
    });
    control.on('error', (error) => logger.error('control api failed to start', errorFields(error)));
    control.listen(config.controlPort, config.controlHost, () => logger.info('control api listening', { host: config.controlHost, port: config.controlPort }));
} else {
    logger.warn('CONTROL_SECRET is not set: the control API is off');
}

await discord.login(config.discordToken);
