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

import { Clock, Download, ListTree, Pause, Play, Search, Trash2, X, type LucideIcon } from 'lucide-react';
import { Icon, cn } from '@pterodactyl/sdk';
import type { LogFilter, ServerConsoleToolbar } from '@pterodactyl/sdk/theme';

const chips: { filter: LogFilter; label: string }[] = [
    { filter: 'error', label: 'Errors' },
    { filter: 'warn', label: 'Warnings' },
    { filter: 'info', label: 'Info' },
    { filter: 'debug', label: 'Debug' },
    { filter: 'players', label: 'Players' },
];

interface ToolButtonProps {
    readonly icon: LucideIcon;
    readonly label: string;
    readonly pressed?: boolean;
    readonly onClick: () => void;
}

/** A round icon button; `pressed` is stated with aria-pressed and drawn as a filled disc, never by colour alone. */
function ToolButton({ icon, label, pressed, onClick }: ToolButtonProps) {
    return (
        <button
            type='button'
            title={label}
            aria-label={label}
            aria-pressed={pressed}
            onClick={onClick}
            className='ast-tool size-8 justify-center'
        >
            <Icon icon={icon} size={15} />
        </button>
    );
}

/** Search, filter chips and the pause, timestamps, structured view, download and clear switches above the console. */
export default function ConsoleToolbar({ toolbar }: { readonly toolbar: ServerConsoleToolbar }) {
    return (
        <div role='toolbar' aria-label='Console tools' className='ast-toolbar flex flex-wrap items-center gap-2 px-1'>
            <div className='ast-search fill relative h-9 min-w-40 flex-1 rounded-full sm:max-w-xs'>
                <Icon
                    icon={Search}
                    size={14}
                    className='pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground'
                />
                <input
                    type='search'
                    value={toolbar.search}
                    onChange={(event) => toolbar.setSearch(event.currentTarget.value)}
                    placeholder='Search the log'
                    aria-label='Search the log'
                    className='h-full w-full rounded-full border-0 bg-transparent pr-8 pl-9 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:ring-0'
                />
                {toolbar.search && (
                    <button
                        type='button'
                        aria-label='Clear search'
                        onClick={() => toolbar.setSearch('')}
                        className='absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground hover:text-foreground'
                    >
                        <Icon icon={X} size={14} />
                    </button>
                )}
            </div>
            <div className='flex flex-wrap items-center gap-1' role='group' aria-label='Filter the log'>
                {chips.map(({ filter, label }) => (
                    <button
                        key={filter}
                        type='button'
                        aria-pressed={toolbar.filters.includes(filter)}
                        onClick={() => toolbar.toggleFilter(filter)}
                        className={cn('ast-tool ast-tool-chip h-8 px-3')}
                    >
                        {label}
                    </button>
                ))}
            </div>
            <div className='ml-auto flex items-center gap-0.5'>
                <ToolButton
                    icon={toolbar.paused ? Play : Pause}
                    label={toolbar.paused ? 'Resume output' : 'Pause output'}
                    pressed={toolbar.paused}
                    onClick={() => toolbar.setPaused(!toolbar.paused)}
                />
                <ToolButton
                    icon={Clock}
                    label='Timestamps'
                    pressed={toolbar.timestamps}
                    onClick={() => toolbar.setTimestamps(!toolbar.timestamps)}
                />
                <ToolButton
                    icon={ListTree}
                    label='Structured view'
                    pressed={toolbar.structured}
                    onClick={() => toolbar.setStructured(!toolbar.structured)}
                />
                <ToolButton icon={Download} label='Download log' onClick={toolbar.download} />
                <ToolButton icon={Trash2} label='Clear console' onClick={toolbar.clear} />
            </div>
        </div>
    );
}

/* ― Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse ― */
