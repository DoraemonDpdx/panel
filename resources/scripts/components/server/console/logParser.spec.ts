import { describe, expect, it } from 'vitest';
import {
    filterEntries,
    groupLogEntries,
    matchesFilters,
    parseLogLine,
    splitHighlights,
    stripAnsi,
    toPlainText,
    type LogFilter,
} from './logParser';

const lines = (...raw: string[]) => raw.map((line) => parseLogLine(line, 0));
const set = (...filters: LogFilter[]) => new Set(filters);

describe('parseLogLine', () => {
    it('strips colour codes', () => {
        expect(stripAnsi('\u001b[1m\u001b[33mhello\u001b[0m')).toBe('hello');
        expect(parseLogLine('\u001b[31m[12:00:01 ERROR]: boom\u001b[0m').text).toBe('[12:00:01 ERROR]: boom');
    });

    it.each([
        ['[12:00:01 INFO]: Done', 'info'],
        ["[12:00:01 WARN]: Can't keep up", 'warn'],
        ['[Server thread/ERROR]: crash', 'error'],
        ['[DEBUG] verbose', 'debug'],
        ['2026-01-01 12:00:00 ERROR failed to bind', 'error'],
        ['WARNING: low disk', 'warn'],
        ['level=error msg="x"', 'error'],
        ['plain text without a level', null],
    ])('reads the level of %s', (line, level) => {
        expect(parseLogLine(line).level).toBe(level);
    });

    it('reads JSON lines and numeric pino levels', () => {
        const named = parseLogLine('{"level":"warn","msg":"slow","time":"now","ms":42}');

        expect(named).toMatchObject({ level: 'warn', message: 'slow', fields: { ms: '42' } });
        expect(parseLogLine('{"level":50,"msg":"bad"}').level).toBe('error');
        expect(parseLogLine('{"level":30,"msg":"ok"}').level).toBe('info');
        expect(parseLogLine('{not json}').message).toBeNull();
        expect(parseLogLine('[1,2]').fields).toBeNull();
    });

    it('spots player events', () => {
        expect(parseLogLine('[12:00 INFO]: Steve joined the game').player).toBe(true);
        expect(parseLogLine('[12:00 INFO]: Steve left the game').player).toBe(true);
        expect(parseLogLine('[12:00 INFO]: <Steve> hello').player).toBe(true);
        expect(parseLogLine('[12:00 INFO]: Done (7s)!').player).toBe(false);
    });
});

describe('groupLogEntries', () => {
    it('collapses a Node stack trace under its error', () => {
        const entries = groupLogEntries(
            lines(
                'listening',
                'TypeError: x is not a function',
                '    at run (/app/index.js:10:5)',
                '    at Object.<anonymous> (/app/index.js:20:1)',
                'next line'
            )
        );

        expect(entries.map((entry) => entry.kind)).toEqual(['line', 'trace', 'line']);
        expect(entries[1].kind === 'trace' && entries[1].body).toHaveLength(2);
    });

    it('collapses a Java trace including Caused by', () => {
        const entries = groupLogEntries(
            lines(
                '[12:00 ERROR]: Could not load',
                '\tat net.minecraft.Foo.bar(Foo.java:10)',
                'Caused by: java.io.IOException: nope',
                '\tat net.minecraft.Baz.run(Baz.java:2)',
                '\t... 5 more'
            )
        );

        expect(entries).toHaveLength(1);
        expect(entries[0].kind === 'trace' && entries[0].body).toHaveLength(4);
    });

    it('collapses a Python traceback through its exception line', () => {
        const entries = groupLogEntries(
            lines(
                'Traceback (most recent call last):',
                '  File "main.py", line 3, in <module>',
                '    run()',
                'ValueError: bad',
                'after'
            )
        );

        expect(entries.map((entry) => entry.kind)).toEqual(['trace', 'line']);
        expect(entries[0].kind === 'trace' && entries[0].body).toHaveLength(3);
    });

    it('collapses a Go panic with its goroutine dump', () => {
        const entries = groupLogEntries(
            lines(
                'panic: runtime error: index out of range',
                '',
                'goroutine 1 [running]:',
                'main.main()',
                '\t/app/main.go:12 +0x1d',
                ''
            )
        );

        expect(entries[0].kind).toBe('trace');
        expect(entries[0].kind === 'trace' && entries[0].head.text).toContain('panic:');
    });

    it('leaves frames with no announcing line, and plain output, as lines', () => {
        const entries = groupLogEntries(lines('hello', 'world'));

        expect(entries.map((entry) => entry.kind)).toEqual(['line', 'line']);
    });
});

describe('filters and search', () => {
    const entries = groupLogEntries(
        lines(
            '[12:00 INFO]: Steve joined the game',
            '[12:00 WARN]: slow tick',
            '[12:00 ERROR]: failed',
            '    at a (b.js:1:1)',
            '[12:00 DEBUG]: noise',
            'no level'
        )
    );

    it('keeps everything with no filter', () => {
        expect(filterEntries(entries, { filters: set(), search: '' })).toHaveLength(entries.length);
    });

    it('keeps the selected levels, and the trace behind an error', () => {
        const errors = filterEntries(entries, { filters: set('error'), search: '' });

        expect(errors).toHaveLength(1);
        expect(errors[0].kind).toBe('trace');
        expect(filterEntries(entries, { filters: set('error', 'warn'), search: '' })).toHaveLength(2);
    });

    it('selects player events', () => {
        const players = filterEntries(entries, { filters: set('players'), search: '' });

        expect(players).toHaveLength(1);
        expect(matchesFilters(parseLogLine('Steve joined the game'), set('players'))).toBe(true);
    });

    it('searches case-insensitively, also inside traces', () => {
        expect(filterEntries(entries, { filters: set(), search: 'SLOW' })).toHaveLength(1);
        expect(filterEntries(entries, { filters: set(), search: 'b.js' })).toHaveLength(1);
    });

    it('splits text around matches', () => {
        expect(splitHighlights('Foo foo', 'foo')).toEqual([
            { text: 'Foo', match: true, offset: 0 },
            { text: ' ', match: false, offset: 3 },
            { text: 'foo', match: true, offset: 4 },
        ]);
        expect(splitHighlights('abc', '')).toEqual([{ text: 'abc', match: false, offset: 0 }]);
    });
});

describe('toPlainText', () => {
    it('joins plain lines, with optional clock prefixes', () => {
        const parsed = lines('\u001b[1ma\u001b[0m', 'b');

        expect(toPlainText(parsed, false)).toBe('a\nb\n');
        expect(toPlainText(parsed, true)).toMatch(/^\[\d\d:\d\d:\d\d\] a\n\[\d\d:\d\d:\d\d\] b\n$/);
    });
});
