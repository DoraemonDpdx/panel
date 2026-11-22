import { isNumber, isObject, isString } from '@/lib/objects';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogFilter = LogLevel | 'players';

export const LOG_FILTERS: readonly LogFilter[] = ['error', 'warn', 'info', 'debug', 'players'];

export interface LogLine {
    /** Unique among the lines this page has parsed, so a list can key on it. */
    id: number;
    /** The line as received, with its colours. */
    raw: string;
    /** The line without colour codes. */
    text: string;
    level: LogLevel | null;
    /** The message of a JSON log line, without its envelope. */
    message: string | null;
    /** The fields of a JSON log line other than level, message and time. */
    fields: Record<string, string> | null;
    /** A player joined, left or spoke. */
    player: boolean;
    /** When the panel received the line, in milliseconds since the epoch. */
    at: number;
}

export interface LogEntryLine {
    kind: 'line';
    id: number;
    line: LogLine;
}

export interface LogEntryTrace {
    kind: 'trace';
    id: number;
    /** The line that announced the trace, such as the error or the panic. */
    head: LogLine;
    /** The frames and causes that follow it. */
    body: LogLine[];
}

export type LogEntry = LogEntryLine | LogEntryTrace;

// oxlint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;

export const stripAnsi = (value: string) => value.replace(ANSI, '');

const LEVEL_ALIASES = {
    trace: 'debug',
    debug: 'debug',
    verbose: 'debug',
    info: 'info',
    information: 'info',
    notice: 'info',
    log: 'info',
    warn: 'warn',
    warning: 'warn',
    error: 'error',
    err: 'error',
    fatal: 'error',
    severe: 'error',
    critical: 'error',
    crit: 'error',
    panic: 'error',
} satisfies Record<string, LogLevel>;

const numericLevel = (value: number): LogLevel => {
    // pino and bunyan: 10 trace, 20 debug, 30 info, 40 warn, 50 error, 60 fatal.
    if (value >= 50) {
        return 'error';
    }

    if (value >= 40) {
        return 'warn';
    }

    return value >= 30 ? 'info' : 'debug';
};

const normalizeLevel = (value: string | number | null | undefined): LogLevel | null => {
    if (isNumber(value)) {
        return numericLevel(value);
    }

    if (isString(value)) {
        return Object.entries(LEVEL_ALIASES).find(([word]) => word === value.trim().toLowerCase())?.[1] ?? null;
    }

    return null;
};

const LEVEL_WORDS = 'TRACE|DEBUG|VERBOSE|INFO|NOTICE|WARN(?:ING)?|ERROR|ERR|FATAL|SEVERE|CRIT(?:ICAL)?|PANIC';
// "[12:00:01 INFO]", "[INFO]", "[Server thread/WARN]", "2026-01-01 12:00 ERROR msg", "ERROR:", "level=warn".
const LEVEL_PATTERNS = [
    new RegExp(`^\\s*\\[[^\\]]*?[ /](${LEVEL_WORDS})\\]`, 'i'),
    new RegExp(`^\\s*\\[(${LEVEL_WORDS})\\]`, 'i'),
    new RegExp(`\\blevel=["']?(${LEVEL_WORDS})\\b`, 'i'),
    new RegExp(`^(?:\\S+\\s+){0,3}?(${LEVEL_WORDS})(?::|\\s+-|\\s{2,})`),
    new RegExp(`^\\s*(${LEVEL_WORDS}):`),
    // A shouted level after a timestamp: "2026-01-01 12:00:00 ERROR failed".
    /^(?:\S+\s+){1,3}?(TRACE|DEBUG|INFO|WARN|WARNING|ERROR|FATAL)\s/,
];

const JSON_ENVELOPE_KEYS = ['level', 'severity', 'lvl', 'levelname', 'log.level'];
const JSON_MESSAGE_KEYS = ['message', 'msg', 'text', 'event'];
const JSON_TIME_KEYS = ['time', 'timestamp', 'ts', '@timestamp', 'asctime', 't'];

const PLAYER_PATTERN =
    /(?:joined the game|left the game|lost connection:|logged in with entity id|\bUUID of player\b|(?:^|[\]:]\s+)(?:\[Not Secure\]\s*)?<[^>\s]{1,32}>\s|\bwas (?:slain|shot|killed|blown up|burned|pricked|drowned|fireballed)|\bhas made the advancement)/i;

function parseJson(text: string): Pick<LogLine, 'level' | 'message' | 'fields'> | null {
    const trimmed = text.trim();

    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
        return null;
    }

    try {
        const parsed: unknown = JSON.parse(trimmed);

        if (!isObject(parsed)) {
            return null;
        }

        const pick = (keys: readonly string[]) => keys.find((key) => key in parsed);
        const levelKey = pick(JSON_ENVELOPE_KEYS);
        const messageKey = pick(JSON_MESSAGE_KEYS);
        const timeKey = pick(JSON_TIME_KEYS);
        const consumed = new Set([levelKey, messageKey, timeKey]);
        const fields = Object.fromEntries(
            Object.entries(parsed)
                .filter(([key]) => !consumed.has(key))
                .map(([key, value]) => [key, isString(value) ? value : JSON.stringify(value)])
        );
        const message: string | number | boolean | null =
            messageKey === undefined ? null : Reflect.get(parsed, messageKey);

        return {
            level: levelKey === undefined ? null : normalizeLevel(Reflect.get(parsed, levelKey)),
            message: message === null ? null : String(message),
            fields: Object.keys(fields).length > 0 ? fields : null,
        };
    } catch {
        return null;
    }
}

function detectLevel(text: string): LogLevel | null {
    for (const pattern of LEVEL_PATTERNS) {
        const match = pattern.exec(text);

        if (match?.[1]) {
            return normalizeLevel(match[1]);
        }
    }

    return null;
}

let nextLineId = 0;

/** Reads the level, JSON envelope and player events of one console line. */
export function parseLogLine(raw: string, at = Date.now()): LogLine {
    const text = stripAnsi(raw);
    const json = parseJson(text);
    const level = json?.level ?? detectLevel(text);

    return {
        id: nextLineId++,
        raw,
        text,
        level,
        message: json?.message ?? null,
        fields: json?.fields ?? null,
        player: PLAYER_PATTERN.test(text),
        at,
    };
}

// Frames of a Node, Java or Python trace, and the lines that continue one.
const FRAME =
    /^\s+at\s+\S|^\s+\.\.\. \d+ (?:more|common frames omitted)|^\s+File "[^"]+", line \d+|^\s{2,}\S.*\.go:\d+/;
const CAUSE = /^\s*(?:Caused by|Suppressed):\s/;
const PYTHON_HEAD = /^Traceback \(most recent call last\):/;
const GO_PANIC = /^(?:panic:|fatal error:|goroutine \d+ \[)/;
const NODE_HEAD = /^\s*(?:Uncaught\s+)?(?:\w+\.)*\w*(?:Error|Exception)\b.*|^\s*Unhandled (?:rejection|promise)/;
const JAVA_HEAD = /^\s*(?:Exception in thread|[\w.$]+(?:Exception|Error)\b)/;

const isBlank = (line: LogLine | undefined) => line === undefined || line.text.trim() === '';

const isFrame = (line: LogLine) => FRAME.test(line.text) || CAUSE.test(line.text);

const pythonTraceEnd = (lines: readonly LogLine[], start: number): number => {
    let end = start + 1;

    // Frames, then the exception line that ends the traceback.
    while (end < lines.length && (isFrame(lines[end]) || /^\s{2,}\S/.test(lines[end].text))) {
        end++;
    }

    return end < lines.length && /^[\w.]+(?:Error|Exception|Exit|Interrupt)\b/.test(lines[end].text) ? end + 1 : end;
};

const goPanicEnd = (lines: readonly LogLine[], start: number): number => {
    let end = start + 1;

    // A panic runs on through its goroutine dumps until a leveled line or two blank lines.
    while (end < lines.length && !detectLevel(lines[end].text) && !(isBlank(lines[end]) && isBlank(lines[end + 1]))) {
        end++;
    }

    while (end > start + 1 && isBlank(lines[end - 1])) {
        end--;
    }

    return end;
};

/** Where the trace that starts at `start` ends (exclusive); `start + 1` when it has no continuation. */
function traceEnd(lines: readonly LogLine[], start: number): number {
    const head = lines[start].text;

    if (PYTHON_HEAD.test(head)) {
        return pythonTraceEnd(lines, start);
    }

    if (GO_PANIC.test(head)) {
        return goPanicEnd(lines, start);
    }

    let end = start + 1;

    while (end < lines.length && isFrame(lines[end])) {
        end++;
    }

    return end;
}

const announcesTrace = (line: LogLine) =>
    PYTHON_HEAD.test(line.text) ||
    GO_PANIC.test(line.text) ||
    line.level === 'error' ||
    NODE_HEAD.test(line.text) ||
    JAVA_HEAD.test(line.text);

/**
 * Groups consecutive lines of a stack trace under the line that announced them, so a reader sees
 * one expandable block. Node and Java frames, Python tracebacks and Go panics are recognised.
 */
export function groupLogEntries(lines: readonly LogLine[]): LogEntry[] {
    const entries: LogEntry[] = [];
    let index = 0;

    while (index < lines.length) {
        const line = lines[index];
        const end = traceEnd(lines, index);

        if (end > index + 1 && announcesTrace(line)) {
            entries.push({ kind: 'trace', id: line.id, head: line, body: lines.slice(index + 1, end) });
            index = end;
        } else {
            entries.push({ kind: 'line', id: line.id, line });
            index++;
        }
    }

    return entries;
}

export interface LogQuery {
    /** Levels and player events to keep; none keeps everything. */
    filters: ReadonlySet<LogFilter>;
    search: string;
}

/** A line that carries a level only passes when its level is selected; player events have their own chip. */
export function matchesFilters(line: LogLine, filters: ReadonlySet<LogFilter>): boolean {
    if (filters.size === 0) {
        return true;
    }

    return (line.level !== null && filters.has(line.level)) || (line.player && filters.has('players'));
}

export const matchesSearch = (line: LogLine, search: string) =>
    search.length === 0 || line.text.toLowerCase().includes(search.toLowerCase());

/** Splits `text` around every case-insensitive occurrence of `search`, for highlighting. */
export function splitHighlights(text: string, search: string): { text: string; match: boolean; offset: number }[] {
    if (search.length === 0) {
        return [{ text, match: false, offset: 0 }];
    }

    const parts: { text: string; match: boolean; offset: number }[] = [];
    const haystack = text.toLowerCase();
    const needle = search.toLowerCase();
    let cursor = 0;

    while (cursor < text.length) {
        const at = haystack.indexOf(needle, cursor);

        if (at === -1) {
            parts.push({ text: text.slice(cursor), match: false, offset: cursor });
            break;
        }

        if (at > cursor) {
            parts.push({ text: text.slice(cursor, at), match: false, offset: cursor });
        }

        parts.push({ text: text.slice(at, at + needle.length), match: true, offset: at });
        cursor = at + needle.length;
    }

    return parts;
}

/**
 * Applies the filters and search to grouped entries. A trace stays when its head, or any frame
 * when searching, matches, so filtering for errors keeps the whole trace behind an error line.
 */
export function filterEntries(entries: readonly LogEntry[], { filters, search }: LogQuery): LogEntry[] {
    return entries.filter((entry) => {
        if (entry.kind === 'line') {
            return matchesFilters(entry.line, filters) && matchesSearch(entry.line, search);
        }

        const headPasses = matchesFilters(entry.head, filters) || (filters.has('error') && entry.head.level === null);

        return headPasses && [entry.head, ...entry.body].some((line) => matchesSearch(line, search));
    });
}

/** What the structured view shows for a line: the JSON message when there is one, else the text. */
export const displayText = (line: LogLine) => line.message ?? line.text;

export function formatClock(at: number): string {
    const date = new Date(at);
    const pad = (value: number) => String(value).padStart(2, '0');

    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** The text of the lines for a download, optionally prefixed with when each arrived. */
export function toPlainText(lines: readonly LogLine[], timestamps: boolean): string {
    return `${lines.map((line) => (timestamps ? `[${formatClock(line.at)}] ${line.text}` : line.text)).join('\n')}\n`;
}
