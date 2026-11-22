import type { Client } from 'discord.js';
import type { TtlCache } from './cache.js';
import type { Config } from './config.js';
import type { AccountMemory, CustomerClient } from './customer/client.js';
import type { FeatureStore } from './features.js';
import type { StatsStore } from './stats.js';

export interface BotContext {
    config: Config;
    /** The website's customer API: the only thing this bot talks to. */
    customer: Pick<CustomerClient, 'call'>;
    accounts: AccountMemory;
    cache: TtlCache;
    features: FeatureStore;
    stats: StatsStore;
    discord: Client;
}
