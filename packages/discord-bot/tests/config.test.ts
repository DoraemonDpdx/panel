import { describe, expect, it } from 'vitest';
import { ConfigError, parseConfig } from '../src/config.js';

const valid = {
    DISCORD_TOKEN: 'token',
    DISCORD_CLIENT_ID: '123456789012345678',
    DISCORD_GUILD_ID: '123456789012345679',
    SITE_URL: 'https://site.test/',
    CUSTOMER_BOT_SECRET: 'customer-secret-0123456789',
};

describe('parseConfig', () => {
    it('accepts a minimal environment and applies defaults', () => {
        const c = parseConfig(valid);
        expect(c).toMatchObject({ siteUrl: 'https://site.test', controlSecret: undefined, controlPort: 8787, controlHost: '127.0.0.1', dataDir: 'data' });
    });

    it('treats blank optional values as unset', () => {
        const c = parseConfig({ ...valid, DISCORD_GUILD_ID: '', CONTROL_SECRET: '', CONTROL_PORT: '' });
        expect(c.guildId).toBeUndefined();
        expect(c.controlPort).toBe(8787);
    });

    it('does not know about panel keys and reports names without values', () => {
        expect(() => parseConfig({ ...valid, CUSTOMER_BOT_SECRET: 'short' })).toThrow(ConfigError);
        try {
            parseConfig({ ...valid, CUSTOMER_BOT_SECRET: 'short' });
        } catch (e) {
            expect((e as Error).message).toContain('CUSTOMER_BOT_SECRET');
            expect((e as Error).message).not.toContain('short');
        }
        expect(Object.keys(parseConfig(valid))).not.toContain('panelApiKey');
    });
});
