import { SlashCommandBuilder, type SlashCommandSubcommandBuilder, type AutocompleteInteraction, type ChatInputCommandInteraction } from 'discord.js';
import type { BotContext } from '../context.js';
import { UserError } from '../errors.js';
import { confirmAndRun } from '../ui/confirm.js';
import { infoEmbed, successEmbed } from '../ui/embeds.js';
import { code, discordTime, formatBytes, formatUptime, truncate } from '../ui/format.js';
import { paginate } from '../ui/paginate.js';
import { callFor, callForAutocomplete, listServers, pick, serverName, stateLabel } from './helpers.js';
import { serverOption } from './options.js';
import type { CustomerCommand } from './types.js';


const metric = (value: unknown, kind: 'bytes' | 'percent' | 'plain' = 'plain'): string => {
    if (value === undefined || value === null) return '—';
    if (typeof value === 'number') return kind === 'bytes' ? formatBytes(value) : kind === 'percent' ? `${Math.round(value * 10) / 10}%` : String(value);
    if (typeof value === 'object') {
        const used = pick<number>(value, 'used', 'current', 'value');
        const limit = pick<number>(value, 'limit', 'max', 'total');
        if (typeof used === 'number') return `${metric(used, kind)}${typeof limit === 'number' && limit > 0 ? ` of ${metric(limit, kind)}` : ''}`;
    }

    return truncate(String(value), 100);
};

const sub = (s: SlashCommandSubcommandBuilder, name: string, description: string) => s.setName(name).setDescription(description).addStringOption(serverOption);

function build() {
    return new SlashCommandBuilder()
        .setName('server')
        .setDescription('Look after one of your servers')
        .addSubcommand((s) => sub(s, 'info', 'Details about a server'))
        .addSubcommand((s) => sub(s, 'status', 'Is it online? Live usage'))
        .addSubcommand((s) =>
            sub(s, 'power', 'Start, stop or restart a server').addStringOption((o) =>
                o
                    .setName('action')
                    .setDescription('What to do')
                    .setRequired(true)
                    .addChoices({ name: 'Start', value: 'start' }, { name: 'Stop', value: 'stop' }, { name: 'Restart', value: 'restart' }, { name: 'Force stop (kill)', value: 'kill' }),
            ),
        )
        .addSubcommand((s) => sub(s, 'console', 'Send a command to the server console').addStringOption((o) => o.setName('command').setDescription('The command to send').setRequired(true).setMaxLength(500)))
        .addSubcommand((s) => sub(s, 'backups', 'See your backups'))
        .addSubcommand((s) => sub(s, 'backup-create', 'Make a new backup').addStringOption((o) => o.setName('name').setDescription('A name for it (optional)').setMaxLength(100)))
        .addSubcommand((s) => sub(s, 'backup-restore', 'Restore a backup').addStringOption((o) => o.setName('backup').setDescription('Which backup').setRequired(true).setAutocomplete(true)))
        .addSubcommand((s) => sub(s, 'reinstall', 'Reinstall a server from scratch'))
        .toJSON();
}

async function info(ctx: BotContext, i: ChatInputCommandInteraction, server: string): Promise<void> {
    const d = await callFor(ctx, i)<any>('server.info', { server });
    const limits = pick<any>(d, 'limits') ?? {};
    const address = pick<any>(d, 'address', 'primaryAddress', 'allocation');
    const addressText = typeof address === 'string' ? address : address ? `${pick(address, 'ip', 'host', 'alias') ?? ''}:${pick(address, 'port') ?? ''}` : undefined;

    const embed = infoEmbed(`${pick<string>(d, 'name') ?? server}`, `${stateLabel(pick<string>(d, 'state', 'status'))}`).addFields(
        { name: 'ID', value: code(pick(d, 'identifier') ?? server), inline: true },
        ...(pick(d, 'node') ? [{ name: 'Location', value: String(pick(d, 'node')), inline: true }] : []),
        ...(addressText ? [{ name: 'Connect with', value: code(addressText), inline: false }] : []),
        {
            name: 'Resources',
            value: [`Memory: ${metric(pick(limits, 'memory'), 'bytes')}`, `Disk: ${metric(pick(limits, 'disk'), 'bytes')}`, `CPU: ${metric(pick(limits, 'cpu'), 'percent')}`].join('\n'),
        },
    );
    await i.editReply({ embeds: [embed] });
}

async function status(ctx: BotContext, i: ChatInputCommandInteraction, server: string): Promise<void> {
    const d = await callFor(ctx, i)<any>('server.resources', { server });
    const name = await serverName(ctx, i, server);
    const uptime = pick<number>(d, 'uptime');
    const embed = infoEmbed(name, stateLabel(pick<string>(d, 'state'))).addFields(
        { name: 'CPU', value: metric(pick(d, 'cpu'), 'percent'), inline: true },
        { name: 'Memory', value: metric(pick(d, 'memory'), 'bytes'), inline: true },
        { name: 'Disk', value: metric(pick(d, 'disk'), 'bytes'), inline: true },
        { name: 'Uptime', value: typeof uptime === 'number' && uptime > 0 ? formatUptime(uptime) : '—', inline: true },
    );
    await i.editReply({ embeds: [embed] });
}

async function power(ctx: BotContext, i: ChatInputCommandInteraction, server: string): Promise<void> {
    const signal = i.options.getString('action', true);
    const name = await serverName(ctx, i, server);
    const send = () => callFor(ctx, i)('server.power', { server, signal });

    const done: Record<string, [string, string]> = {
        start: ['Starting up', `Your server **${name}** is starting. Give it a minute.`],
        stop: ['Stopping', `Your server **${name}** is stopping.`],
        restart: ['Restarting', `Your server **${name}** is restarting. Give it a minute.`],
        kill: ['Force stopped', `Your server **${name}** was force stopped. Unsaved progress may be lost.`],
    };
    const [title, text] = done[signal] ?? ['Done', 'Sent.'];

    if (signal === 'start') {
        await send();
        await i.editReply({ embeds: [successEmbed(title, text)] });

        return;
    }

    const warn =
        signal === 'kill'
            ? `Force stopping **${name}** is like pulling the plug: anything unsaved can be lost. Only do this if it’s stuck.`
            : signal === 'stop'
              ? `This will stop **${name}**, so anyone playing will be disconnected.`
              : `This will restart **${name}**, so anyone playing will be disconnected for a moment.`;

    await confirmAndRun(i, { title: `${signal === 'kill' ? 'Force stop' : signal === 'stop' ? 'Stop' : 'Restart'} ${name}?`, description: warn, confirmLabel: 'Yes, do it' }, async () => {
        await send();

        return successEmbed(title, text);
    });
}

async function consoleCommand(ctx: BotContext, i: ChatInputCommandInteraction, server: string): Promise<void> {
    const command = i.options.getString('command', true);
    const name = await serverName(ctx, i, server);
    await callFor(ctx, i)('server.command', { server, command });
    await i.editReply({ embeds: [successEmbed('Sent', `I sent that to the console of **${name}**.`)] });
}

interface Backup {
    uuid: string;
    name: string;
    size?: number;
    created?: string;
    locked?: boolean;
    ok?: boolean;
}

const loadBackups = (ctx: BotContext, i: { user: { id: string } }, call: ReturnType<typeof callFor>, server: string) =>
    ctx.cache.wrap(`backups:${i.user.id}:${server}`, async () => (await call<Backup[]>('server.backups', { server })) ?? []);

async function backups(ctx: BotContext, i: ChatInputCommandInteraction, server: string): Promise<void> {
    const name = await serverName(ctx, i, server);
    const list = await callFor(ctx, i)<Backup[]>('server.backups', { server });

    if (!list?.length) {
        await i.editReply({ embeds: [infoEmbed(`Backups for ${name}`, 'You don’t have any backups yet. Make one with `/server backup-create`.')] });

        return;
    }

    await paginate(i, async (page) => {
        const slice = list.slice((page - 1) * 8, page * 8);
        const lines = slice.map((b) => `${b.ok === false ? '⚠️' : '💾'} **${truncate(b.name, 60)}**${b.locked ? ' 🔒' : ''}\n${typeof b.size === 'number' ? `${formatBytes(b.size)} · ` : ''}${discordTime(b.created)}`);

        return { embed: infoEmbed(`Backups for ${name}`, lines.join('\n\n')), totalPages: Math.ceil(list.length / 8) };
    });
}

async function backupCreate(ctx: BotContext, i: ChatInputCommandInteraction, server: string): Promise<void> {
    const name = await serverName(ctx, i, server);
    const label = i.options.getString('name') ?? undefined;
    await callFor(ctx, i)('server.backupCreate', { server, ...(label ? { name: label } : {}) });
    ctx.cache.clear();
    await i.editReply({ embeds: [successEmbed('Backup started', `I’m making a backup of **${name}**. It may take a few minutes; check it with \`/server backups\`.`)] });
}

async function backupRestore(ctx: BotContext, i: ChatInputCommandInteraction, server: string): Promise<void> {
    const backup = i.options.getString('backup', true);
    const call = callFor(ctx, i);
    const name = await serverName(ctx, i, server);
    const list = await call<Backup[]>('server.backups', { server });
    const found = list?.find((b) => b.uuid === backup);
    if (!found) throw new UserError('I couldn’t find that backup. Pick one from the suggestions.');

    await confirmAndRun(
        i,
        { title: `Restore “${truncate(found.name, 60)}”?`, description: `**${name}** will be rolled back to this backup. Everything changed since then will be **lost**. Your server will be stopped while it restores.`, confirmLabel: 'Yes, restore it' },
        async () => {
            await call('server.backupRestore', { server, backup });

            return successEmbed('Restoring', `**${name}** is being restored from “${truncate(found.name, 60)}”. It will start up again when it’s done.`);
        },
    );
}

async function reinstall(ctx: BotContext, i: ChatInputCommandInteraction, server: string): Promise<void> {
    const name = await serverName(ctx, i, server);
    await confirmAndRun(
        i,
        { title: `Reinstall ${name}?`, description: `This wipes **${name}** and sets it up again from scratch. Your files may be **deleted**. Make a backup first if you want to keep anything.`, confirmLabel: 'Yes, reinstall' },
        async () => {
            await callFor(ctx, i)('server.reinstall', { server });

            return successEmbed('Reinstalling', `**${name}** is being reinstalled. This can take a few minutes.`);
        },
    );
}

async function execute(ctx: BotContext, i: ChatInputCommandInteraction): Promise<void> {
    const server = i.options.getString('server', true);
    switch (i.options.getSubcommand()) {
        case 'info':
            return info(ctx, i, server);
        case 'status':
            return status(ctx, i, server);
        case 'power':
            return power(ctx, i, server);
        case 'console':
            return consoleCommand(ctx, i, server);
        case 'backups':
            return backups(ctx, i, server);
        case 'backup-create':
            return backupCreate(ctx, i, server);
        case 'backup-restore':
            return backupRestore(ctx, i, server);
        case 'reinstall':
            return reinstall(ctx, i, server);
        default:
            throw new UserError('I don’t know that one. Try `/help`.');
    }
}

async function autocomplete(ctx: BotContext, i: AutocompleteInteraction): Promise<void> {
    const focused = i.options.getFocused(true);
    const query = String(focused.value).toLowerCase();
    try {
        if (focused.name === 'server') {
            const servers = await listServers(ctx, i);
            await i.respond(
                servers
                    .filter((s) => s.name.toLowerCase().includes(query) || s.identifier.toLowerCase().includes(query))
                    .slice(0, 25)
                    .map((s) => ({ name: truncate(`${s.name} (${s.identifier})`, 100), value: s.identifier })),
            );

            return;
        }
        if (focused.name === 'backup') {
            const server = i.options.getString('server');
            if (!server) return void (await i.respond([]));
            const list = await loadBackups(ctx, i, callForAutocomplete(ctx, i), server);
            await i.respond(
                list
                    .filter((b) => b.name.toLowerCase().includes(query))
                    .slice(0, 25)
                    .map((b) => ({ name: truncate(`${b.name}${b.created ? ` · ${b.created.slice(0, 10)}` : ''}`, 100), value: b.uuid })),
            );

            return;
        }
    } catch {
        // Fall through to an empty list: autocomplete must never throw.
    }
    await i.respond([]).catch(() => undefined);
}

export const serverCommand: CustomerCommand = { name: 'server', feature: 'servers', build, execute, autocomplete };
