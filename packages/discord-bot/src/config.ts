import { z } from 'zod';

const snowflake = z.string().regex(/^\d{15,25}$/, 'must be a Discord snowflake (numeric ID)');

/** Treat an empty string (as written in a .env template) as "not set". */
const blankToUndefined = (value: unknown): unknown => (typeof value === 'string' && value.trim() === '' ? undefined : value);
const optional = <T extends z.ZodType>(schema: T) => z.preprocess(blankToUndefined, schema.optional());

const httpUrl = (label: string) =>
    z
        .string()
        .trim()
        .url('must be a valid URL')
        .refine((url) => /^https?:\/\//i.test(url), `${label} must start with http:// or https://`)
        .transform((url) => url.replace(/\/+$/, ''));

const envSchema = z.object({
    DISCORD_TOKEN: z.string().trim().min(1, 'is required'),
    DISCORD_CLIENT_ID: snowflake,
    /** When set, commands are registered in this guild only (instant). When blank they are global. */
    DISCORD_GUILD_ID: optional(snowflake),
    SITE_URL: httpUrl('SITE_URL'),
    CUSTOMER_BOT_SECRET: z.string().trim().min(16, 'is required (at least 16 characters, the website CUSTOMER_BOT_SECRET)'),
    /** The control API stays off unless CONTROL_SECRET is set. */
    CONTROL_SECRET: optional(z.string().trim().min(16, 'must be at least 16 characters')),
    CONTROL_PORT: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).max(65535).default(8787)),
    CONTROL_HOST: z.preprocess(blankToUndefined, z.string().trim().default('127.0.0.1')),
    DATA_DIR: z.preprocess(blankToUndefined, z.string().trim().default('data')),
});

export interface Config {
    discordToken: string;
    clientId: string;
    guildId: string | undefined;
    siteUrl: string;
    customerBotSecret: string;
    controlSecret: string | undefined;
    controlPort: number;
    controlHost: string;
    dataDir: string;
}

export class ConfigError extends Error {
    constructor(public readonly problems: string[]) {
        super(`Invalid environment configuration:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
        this.name = 'ConfigError';
    }
}

/** Validate an environment object. Only variable names and reasons are reported, never the values. */
export function parseConfig(env: Record<string, string | undefined>): Config {
    const result = envSchema.safeParse(env);
    if (!result.success) {
        throw new ConfigError(result.error.issues.map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`));
    }

    const e = result.data;

    return {
        discordToken: e.DISCORD_TOKEN,
        clientId: e.DISCORD_CLIENT_ID,
        guildId: e.DISCORD_GUILD_ID,
        siteUrl: e.SITE_URL,
        customerBotSecret: e.CUSTOMER_BOT_SECRET,
        controlSecret: e.CONTROL_SECRET,
        controlPort: e.CONTROL_PORT,
        controlHost: e.CONTROL_HOST,
        dataDir: e.DATA_DIR,
    };
}

export function loadConfig(): Config {
    return parseConfig(process.env);
}
