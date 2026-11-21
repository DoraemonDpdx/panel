import { vi } from 'vitest';

export interface Call {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: any;
}

export function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** A fetch mock that answers with the queued responses in order and records every call. */
export function mockFetch(responses: (Response | Error)[]) {
    const calls: Call[] = [];
    let index = 0;
    const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        calls.push({
            url: String(input),
            method: init?.method ?? 'GET',
            headers: (init?.headers ?? {}) as Record<string, string>,
            body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
        });
        const next = responses[Math.min(index++, responses.length - 1)];
        if (next instanceof Error) throw next;
        if (!next) throw new Error('no mocked response');

        return next.clone();
    });

    return { fetch: fn as unknown as typeof fetch, calls, fn };
}
