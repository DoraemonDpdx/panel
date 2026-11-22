/*
 * ==========================================================================
 *  ____  ____  ____  __  __
 * |  _ \|  _ \|  _ \ \ \/ /
 * | | | | |_) | | | | \  /
 * | |_| |  __/| |_| | /  \
 * |____/|_|   |____/ /_/\_\
 *
 * BUILT BY  DPDX DEVELOPMENT  ·  BENGALURU, INDIA  ·  dpdx.in
 * BUILT FOR ASTRELYSE
 * ==========================================================================
 *
 * PROPRIETARY & CONFIDENTIAL. This file belongs to DPDX. A customer who receives
 * it inside a site, panel theme or bot built and shipped by DPDX may run it as
 * delivered, but does not own it, and no right to copy, modify, resell or reuse
 * it elsewhere is granted without prior written authorisation from DPDX.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronRight, ChevronsDown } from 'lucide-react';
import { Icon, cn } from '@pterodactyl/sdk';
import {
    displayText,
    formatClock,
    splitHighlights,
    type LogLevel,
    type LogLine,
    type ServerLogViewerModel,
} from '@pterodactyl/sdk/theme';

/** Level is told by a word's colour and, for the two that matter, by weight; the text itself is always on ink. */
const levelClass = {
    error: 'text-destructive',
    warn: 'text-warning',
    info: 'text-foreground',
    debug: 'text-muted-foreground',
} satisfies Record<LogLevel, string>;

const FOLLOW_SLACK_PX = 24;

function Highlighted({ text, search }: { readonly text: string; readonly search: string }) {
    return (
        <>
            {splitHighlights(text, search).map((part) =>
                part.match ? (
                    <mark key={part.offset} className='ast-mark'>
                        {part.text}
                    </mark>
                ) : (
                    <span key={part.offset}>{part.text}</span>
                )
            )}
        </>
    );
}

interface RowProps {
    readonly line: LogLine;
    readonly search: string;
    readonly timestamps: boolean;
    readonly className?: string;
}

function Row({ line, search, timestamps, className }: RowProps) {
    return (
        <div className={cn('break-all whitespace-pre-wrap', line.level ? levelClass[line.level] : 'text-foreground', className)}>
            {timestamps && <span className='mr-2 text-muted-foreground select-none'>{formatClock(line.at)}</span>}
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

/** The console as DOM text: searchable, filterable, with each stack trace folded into one block. */
export default function LogViewer({ viewer, className }: { readonly viewer: ServerLogViewerModel; readonly className?: string }) {
    const scroller = useRef<HTMLDivElement>(null);
    const [following, setFollowing] = useState(true);
    const [expanded, setExpanded] = useState<ReadonlySet<number>>(new Set());

    useLayoutEffect(() => {
        const element = scroller.current;

        if (element && following) {
            element.scrollTop = element.scrollHeight;
        }
    }, [viewer.entries, following]);

    // A new search starts reading from the newest match.
    useEffect(() => setFollowing(true), [viewer.search]);

    const toggle = (id: number) =>
        setExpanded((current) => {
            const next = new Set(current);

            if (!next.delete(id)) {
                next.add(id);
            }

            return next;
        });

    return (
        <div className={cn('ast-log relative flex min-h-0 flex-1 flex-col', className)}>
            <div
                ref={scroller}
                role='log'
                aria-label='Console output'
                tabIndex={0}
                onScroll={(event) => {
                    const element = event.currentTarget;

                    setFollowing(element.scrollHeight - element.scrollTop - element.clientHeight < FOLLOW_SLACK_PX);
                }}
                className='min-h-0 flex-1 overflow-y-auto p-3 font-mono text-xs leading-5'
            >
                {viewer.entries.length === 0 && (
                    <p className='text-muted-foreground'>
                        {viewer.total === 0 ? 'No output yet.' : 'No lines match the search and filters.'}
                    </p>
                )}
                {viewer.entries.map((entry) => {
                    if (entry.kind === 'line') {
                        return <Row key={entry.id} line={entry.line} search={viewer.search} timestamps={viewer.timestamps} />;
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
                                <span className='shrink-0 text-muted-foreground select-none'>
                                    {entry.body.length} {entry.body.length === 1 ? 'line' : 'lines'}
                                </span>
                            </button>
                            {open && (
                                <div className='ml-5 border-l border-white/10 pl-2'>
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
                    className='ast-latest absolute right-5 bottom-3 z-10 inline-flex size-8 items-center justify-center rounded-full text-foreground'
                >
                    <Icon icon={ChevronsDown} size={16} />
                </button>
            )}
        </div>
    );
}

/* ― Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse ― */
