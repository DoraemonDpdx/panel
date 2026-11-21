/**
 * Client for the website's `POST /api/bot/customer` (docs/BOT_SPLIT_PLAN.md section 2).
 * This is the bot's only way to reach anything: it holds no panel API key.
 */

export type ErrorCode =
    | 'not_linked'
    | 'not_customer'
    | 'pick_account'
    | 'rate_limited'
    | 'bad_request'
    | 'not_found'
    | 'forbidden'
    | 'panel_unavailable'
    | 'server_error'
    // Client-side conditions:
    | 'unauthorized'
    | 'unreachable';

const KNOWN: ReadonlySet<string> = new Set<ErrorCode>([
    'not_linked',
    'not_customer',
    'pick_account',
    'rate_limited',
    'bad_request',
    'not_found',
    'forbidden',
    'panel_unavailable',
    'server_error',
]);

export interface AccountChoice {
    id: string;
    label: string;
}

export class CustomerError extends Error {
    constructor(
        public readonly code: ErrorCode,
        public readonly status: number,
        public readonly field?: string,
        public readonly accounts: AccountChoice[] = [],
    ) {
        super(`customer api: ${code}${field ? ` (${field})` : ''}`);
        this.name = 'CustomerError';
    }
}

export interface Invoker {
    discordId: string;
    guildId?: string | undefined;
    channelId?: string | undefined;
}

export interface CustomerClientOptions {
    siteUrl: string;
    secret: string;
    fetch?: typeof fetch;
    timeoutMs?: number;
}

function codeFor(status: number, body: { error?: unknown } | null): ErrorCode {
    if (typeof body?.error === 'string' && KNOWN.has(body.error)) return body.error as ErrorCode;
    if (status === 401) return 'unauthorized';
    if (status === 429) return 'rate_limited';
    if (status === 404) return 'not_found';
    if (status === 403) return 'forbidden';
    if (status === 400) return 'bad_request';
    if (status === 503) return 'panel_unavailable';

    return 'server_error';
}

function parseAccounts(value: unknown): AccountChoice[] {
    if (!Array.isArray(value)) return [];

    return value.flatMap((entry) => {
        const a = entry as { id?: unknown; label?: unknown } | null;

        return a && typeof a.id === 'string' && a.id ? [{ id: a.id, label: typeof a.label === 'string' && a.label ? a.label : a.id }] : [];
    });
}

export class CustomerClient {
    private readonly endpoint: string;

    constructor(private readonly options: CustomerClientOptions) {
        this.endpoint = `${options.siteUrl.replace(/\/+$/, '')}/api/bot/customer`;
    }

    /** Run `command` as the invoker. Resolves with `data`; rejects with a CustomerError. */
    async call<T = any>(invoker: Invoker, command: string, args: Record<string, unknown> = {}, account?: string): Promise<T> {
        const doFetch = this.options.fetch ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));

        let response: Response;
        try {
            response = await doFetch(this.endpoint, {
                method: 'POST',
                headers: { Authorization: `Bearer ${this.options.secret}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    invokerDiscordId: invoker.discordId,
                    ...(invoker.guildId ? { guildId: invoker.guildId } : {}),
                    ...(invoker.channelId ? { channelId: invoker.channelId } : {}),
                    ...(account ? { account } : {}),
                    command,
                    args,
                }),
                signal: AbortSignal.timeout(this.options.timeoutMs ?? 15_000),
            });
        } catch {
            throw new CustomerError('unreachable', 0);
        }

        const body = (await response.json().catch(() => null)) as { ok?: unknown; data?: unknown; error?: unknown; field?: unknown; accounts?: unknown } | null;

        if (response.ok && body?.ok === true) return body.data as T;

        const code = codeFor(response.status, body);

        throw new CustomerError(code, response.status, typeof body?.field === 'string' ? body.field : undefined, code === 'pick_account' ? parseAccounts(body?.accounts) : []);
    }
}

/** Remembers which account a Discord user picked, so the menu appears once and not on every command. */
export class AccountMemory {
    private readonly entries = new Map<string, { account: string; expires: number }>();

    constructor(
        private readonly ttlMs = 30 * 60_000,
        private readonly now: () => number = Date.now,
    ) {}

    get(discordId: string): string | undefined {
        const hit = this.entries.get(discordId);
        if (!hit) return undefined;
        if (hit.expires <= this.now()) {
            this.entries.delete(discordId);

            return undefined;
        }

        return hit.account;
    }

    set(discordId: string, account: string): void {
        this.entries.set(discordId, { account, expires: this.now() + this.ttlMs });
    }

    forget(discordId: string): void {
        this.entries.delete(discordId);
    }
}

/** Shows the account choices to the customer and resolves with the chosen `users.id`. */
export interface AccountPicker {
    pick(accounts: AccountChoice[]): Promise<string>;
}

const STALE: ReadonlySet<ErrorCode> = new Set<ErrorCode>(['not_linked', 'not_customer', 'forbidden']);

/**
 * `client.call` plus the `pick_account` flow: when the site answers 409 pick_account, ask the picker
 * (a select menu in Discord), remember the answer and retry once with `account`.
 */
export async function callWithPicker<T = any>(
    client: Pick<CustomerClient, 'call'>,
    memory: AccountMemory,
    picker: AccountPicker,
    invoker: Invoker,
    command: string,
    args: Record<string, unknown> = {},
): Promise<T> {
    const attempt = async (account: string | undefined): Promise<T> => {
        try {
            return await client.call<T>(invoker, command, args, account);
        } catch (error) {
            if (account && error instanceof CustomerError && STALE.has(error.code)) memory.forget(invoker.discordId);
            throw error;
        }
    };

    try {
        return await attempt(memory.get(invoker.discordId));
    } catch (error) {
        if (!(error instanceof CustomerError) || error.code !== 'pick_account' || error.accounts.length === 0) throw error;

        const chosen = await picker.pick(error.accounts);
        memory.set(invoker.discordId, chosen);

        return attempt(chosen);
    }
}
