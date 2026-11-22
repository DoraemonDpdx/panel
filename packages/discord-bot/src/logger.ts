type Level = 'info' | 'warn' | 'error';

function write(level: Level, message: string, fields?: Record<string, unknown>): void {
    const line = JSON.stringify({ time: new Date().toISOString(), level, message, ...fields });
    (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(line);
}

/** Structured stdout logging. Callers must never pass secrets (tokens, API keys, passwords). */
export const logger = {
    info: (message: string, fields?: Record<string, unknown>) => write('info', message, fields),
    warn: (message: string, fields?: Record<string, unknown>) => write('warn', message, fields),
    error: (message: string, fields?: Record<string, unknown>) => write('error', message, fields),
};

export function errorFields(error: unknown): Record<string, unknown> {
    if (error instanceof Error) return { error: error.name, reason: error.message, stack: error.stack?.split('\n').slice(0, 5).join('\n') };

    return { error: String(error) };
}
