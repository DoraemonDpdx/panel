import { ActionRowBuilder, ComponentType, StringSelectMenuBuilder, type AutocompleteInteraction } from 'discord.js';
import type { BotContext } from '../context.js';
import { callWithPicker, type AccountChoice, type AccountPicker, type Invoker } from '../customer/client.js';
import { UserError } from '../errors.js';
import { infoEmbed } from '../ui/embeds.js';
import { truncate } from '../ui/format.js';

/** What the helpers need from a slash-command or modal-submit interaction. */
export interface Replyable {
    id: string;
    user: { id: string };
    guildId: string | null;
    channelId: string | null;
    editReply(options: any): Promise<any>;
}

export const invokerOf = (i: Pick<Replyable, 'user' | 'guildId' | 'channelId'>): Invoker => ({
    discordId: i.user.id,
    guildId: i.guildId ?? undefined,
    channelId: i.channelId ?? undefined,
});

const PICK_MS = 60_000;

/** The `pick_account` select menu: shown on the interaction's own reply, answered by the invoker only. */
export function selectMenuPicker(i: Replyable): AccountPicker {
    return {
        async pick(accounts: AccountChoice[]) {
            const menuId = `account:${i.id}`;
            const menu = new StringSelectMenuBuilder()
                .setCustomId(menuId)
                .setPlaceholder('Choose an account')
                .addOptions(accounts.slice(0, 25).map((a) => ({ label: truncate(a.label, 100), value: truncate(a.id, 100) })));

            const message = await i.editReply({
                embeds: [infoEmbed('Which account do you mean?', 'Your Discord account is linked to more than one Astrelyse account. Pick the one to use — I’ll remember it for a while.')],
                components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
            });

            try {
                const choice = await message.awaitMessageComponent({
                    componentType: ComponentType.StringSelect,
                    time: PICK_MS,
                    filter: (c: { user: { id: string }; customId: string }) => c.user.id === i.user.id && c.customId === menuId,
                });
                await choice.update({ embeds: [infoEmbed('Working…')], components: [] });

                return choice.values[0] as string;
            } catch {
                await i.editReply({ embeds: [infoEmbed('No account chosen', 'Nothing was changed. Run the command again whenever you’re ready.')], components: [] }).catch(() => undefined);
                throw new UserError('No account was chosen, so I stopped there.');
            }
        },
    };
}

/** Autocomplete cannot show a menu, so a customer who still has to pick simply gets no suggestions. */
const silentPicker: AccountPicker = {
    async pick() {
        throw new UserError('pick an account first');
    },
};

/** `call('server.list')` as the invoker of this interaction, with the account-picking retry built in. */
export const callFor =
    (ctx: BotContext, i: Replyable, picker: AccountPicker = selectMenuPicker(i)) =>
    <T = any>(command: string, args: Record<string, unknown> = {}): Promise<T> =>
        callWithPicker<T>(ctx.customer, ctx.accounts, picker, invokerOf(i), command, args);

export const callForAutocomplete = (ctx: BotContext, i: AutocompleteInteraction) => callFor(ctx, { ...i, id: i.id, editReply: async () => undefined }, silentPicker);

export interface ServerSummary {
    identifier: string;
    name: string;
    state?: string;
    node?: string;
    plan?: string;
}

/** The customer's servers, cached 30 s per user (autocomplete fires on every keystroke). */
export function listServers(ctx: BotContext, i: Replyable | AutocompleteInteraction): Promise<ServerSummary[]> {
    const call = 'editReply' in i ? callFor(ctx, i as Replyable) : callForAutocomplete(ctx, i);

    return ctx.cache.wrap(`server.list:${i.user.id}`, async () => (await call<ServerSummary[]>('server.list')) ?? []);
}

export async function serverName(ctx: BotContext, i: Replyable, identifier: string): Promise<string> {
    try {
        return (await listServers(ctx, i)).find((s) => s.identifier === identifier)?.name ?? identifier;
    } catch {
        return identifier;
    }
}

export const STATE_LABEL: Record<string, string> = {
    running: '🟢 Online',
    online: '🟢 Online',
    starting: '🟡 Starting',
    stopping: '🟡 Stopping',
    offline: '🔴 Offline',
    stopped: '🔴 Offline',
    installing: '🛠️ Installing',
    suspended: '⏸️ Suspended',
};

export const stateLabel = (state: string | undefined) => (state ? (STATE_LABEL[state] ?? state) : 'Unknown');

/** Pull a value out of loosely shaped `data`, trying several field names. */
export function pick<T = unknown>(obj: unknown, ...keys: string[]): T | undefined {
    if (!obj || typeof obj !== 'object') return undefined;
    for (const key of keys) {
        const value = (obj as Record<string, unknown>)[key];
        if (value !== undefined && value !== null) return value as T;
    }

    return undefined;
}
