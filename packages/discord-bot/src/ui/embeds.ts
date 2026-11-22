import { EmbedBuilder } from 'discord.js';
import { COLORS, truncate } from './format.js';

export const successEmbed = (title: string, description?: string) =>
    new EmbedBuilder().setColor(COLORS.success).setTitle(truncate(`✅ ${title}`, 256)).setDescription(description ? truncate(description, 4000) : null);

export const errorEmbed = (title: string, description?: string) =>
    new EmbedBuilder().setColor(COLORS.danger).setTitle(truncate(`❌ ${title}`, 256)).setDescription(description ? truncate(description, 4000) : null);

export const warnEmbed = (title: string, description?: string) =>
    new EmbedBuilder().setColor(COLORS.warning).setTitle(truncate(`⚠️ ${title}`, 256)).setDescription(description ? truncate(description, 4000) : null);

export const infoEmbed = (title: string, description?: string) =>
    new EmbedBuilder().setColor(COLORS.info).setTitle(truncate(title, 256)).setDescription(description ? truncate(description, 4000) : null);

/** Colour for a server's state: status, suspension, or the live power state when known. */
export function serverColor(server: { status: string | null; suspended: boolean }, powerState?: string): number {
    if (server.suspended || server.status === 'suspended') return COLORS.suspended;
    if (server.status) return COLORS.warning; // installing, install_failed, restoring_backup, ...
    switch (powerState) {
        case 'running':
            return COLORS.success;
        case 'starting':
        case 'stopping':
            return COLORS.warning;
        case 'offline':
        case 'stopped':
            return COLORS.danger;
        default:
            return COLORS.info;
    }
}
