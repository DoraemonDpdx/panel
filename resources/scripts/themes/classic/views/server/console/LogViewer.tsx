import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronRight, ChevronsDown } from 'lucide-react';
import { Icon, cn } from '@/sdk';
import {
    displayText,
    formatClock,
    splitHighlights,
    type LogLevel,
    type LogLine,
    type ServerLogViewerModel,
} from '@/sdk/theme';

const levelClass = {
    error: 'text-destructive',
    warn: 'text-warning',
    info: 'text-foreground',
    debug: 'text-muted-foreground',
} satisfies Record<LogLevel, string>;

const FOLLOW_SLACK_PX = 24;

function Highlighted({ text, search }: { text: string; search: string }) {
    return (
        <>
            {splitHighlights(text, search).map((part) =>
                part.match ? (
                    <mark key={part.offset} className='rounded-xs bg-accent/40 text-foreground'>
                        {part.text}
                    </mark>
                ) : (
                    <span key={part.offset}>{part.text}</span>
                )
            )}
        </>
    );
}

function Row({
    line,
    search,
    timestamps,
    className,
}: {
    line: LogLine;
    search: string;
    timestamps: boolean;
    className?: string;
}) {
    return (
        <div
            className={cn(
                'whitespace-pre-wrap break-all',
                line.level ? levelClass[line.level] : 'text-foreground',
                className
            )}
        >
            {timestamps && <span className='mr-2 select-none text-muted-foreground'>{formatClock(line.at)}</span>}
            <Highlighted text={displayText(line)} search={search} />
            {line.fields && (
                <span className='ml-2 text-muted-foreground'>
                    {Object.entries(line.fields)

                        .map(([key, value]) => `${key}=${value}`)
                        .join(' ')}
                </span>
            )}
        </div>
    );
}

/** The console as DOM text: searchable, filterable, with stack traces collapsed into one block. */
export default function LogViewer({ viewer, className }: { viewer: ServerLogViewerModel; className?: string }) {
    const scroller = useRef<HTMLDivElement>(null);
    const [following, setFollowing] = useState(true);
    const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set());

    useLayoutEffect(() => {
        const element = scroller.current;

        if (element && following) {
            element.scrollTop = element.scrollHeight;
        }
    }, [viewer.entries, following]);

    useEffect(() => {
        // A search or filter change starts reading from the newest match.
        setFollowing(true);
    }, [viewer.search]);

    const toggle = (id: number) =>
        setExpanded((current) => {
            const next = new Set(current);

            if (!next.delete(id)) {
                next.add(id);
            }

            return next;
        });

    return (
        <div className={cn('relative flex min-h-0 flex-1 flex-col', className)}>
            <div
                ref={scroller}
                role='log'
                aria-label='Console output'
                tabIndex={0}
                onScroll={(event) => {
                    const element = event.currentTarget;

                    setFollowing(element.scrollHeight - element.scrollTop - element.clientHeight < FOLLOW_SLACK_PX);
                }}
                className='min-h-0 flex-1 overflow-y-auto p-2 font-mono text-xs leading-5'
            >
                {viewer.entries.length === 0 && (
                    <p className='text-muted-foreground'>
                        {viewer.total === 0 ? 'No output yet.' : 'No lines match the search and filters.'}
                    </p>
                )}
                {viewer.entries.map((entry) => {
                    if (entry.kind === 'line') {
                        return (
                            <Row
                                key={entry.id}
                                line={entry.line}
                                search={viewer.search}
                                timestamps={viewer.timestamps}
                            />
                        );
                    }

                    const open = expanded.has(entry.id);

                    return (
                        <div key={entry.id}>
                            <button
                                type='button'
                                aria-expanded={open}
                                onClick={() => toggle(entry.id)}
                                className='flex w-full items-start gap-1 text-left'
                            >
                                <Icon
                                    icon={ChevronRight}
                                    size={14}
                                    className={cn('mt-1 shrink-0 text-muted-foreground', open && 'rotate-90')}
                                />
                                <Row
                                    line={entry.head}
                                    search={viewer.search}
                                    timestamps={viewer.timestamps}
                                    className='flex-1 text-destructive'
                                />
                                <span className='shrink-0 select-none text-muted-foreground'>
                                    {entry.body.length} {entry.body.length === 1 ? 'line' : 'lines'}
                                </span>
                            </button>
                            {open && (
                                <div className='ml-5 border-l border-border pl-2'>
                                    {entry.body.map((line) => (
                                        <Row
                                            key={line.id}
                                            line={line}
                                            search={viewer.search}
                                            timestamps={false}
                                            className='text-muted-foreground'
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
            {!following && (
                <button
                    type='button'
                    aria-label='Scroll to bottom'
                    onClick={() => setFollowing(true)}
                    className='absolute bottom-3 right-5 z-10 rounded-full bg-popover/90 p-2 text-foreground shadow-lg transition-colors hover:bg-popover'
                >
                    <Icon icon={ChevronsDown} size={16} />
                </button>
            )}
        </div>
    );
}
