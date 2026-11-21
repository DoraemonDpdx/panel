import { Clock, Download, ListTree, Pause, Play, Search, Trash2, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Icon, cn } from '@/sdk';
import type { LogFilter, ServerConsoleToolbar } from '@/sdk/theme';

const chips: { filter: LogFilter; label: string }[] = [
    { filter: 'error', label: 'Errors' },
    { filter: 'warn', label: 'Warnings' },
    { filter: 'info', label: 'Info' },
    { filter: 'debug', label: 'Debug' },
    { filter: 'players', label: 'Players' },
];

const controlClass =
    'inline-flex h-7 items-center justify-center gap-1 rounded-full px-2 text-xs transition-colors duration-100 hover:bg-muted hover:text-foreground disabled:opacity-50';

function ToolButton({
    icon,
    label,
    pressed,
    onClick,
}: {
    icon: LucideIcon;
    label: string;
    pressed?: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type='button'
            title={label}
            aria-label={label}
            aria-pressed={pressed}
            onClick={onClick}
            className={cn(controlClass, pressed ? 'bg-muted text-foreground' : 'text-muted-foreground')}
        >
            <Icon icon={icon} size={14} />
        </button>
    );
}

/** Search, filter chips and the pause, clear, download and view switches above the console. */
export default function ConsoleToolbar({ toolbar }: { toolbar: ServerConsoleToolbar }) {
    return (
        <div role='toolbar' aria-label='Console tools' className='flex flex-wrap items-center gap-2 px-1 pb-2'>
            <div className='relative min-w-40 flex-1 sm:max-w-xs'>
                <Icon
                    icon={Search}
                    size={14}
                    className='pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground'
                />
                <input
                    type='search'
                    value={toolbar.search}
                    onChange={(event) => toolbar.setSearch(event.currentTarget.value)}
                    placeholder='Search the log'
                    aria-label='Search the log'
                    className='h-8 w-full rounded-full bg-muted/70 pl-8 pr-8 text-xs text-foreground outline-hidden focus:ring-1 focus:ring-accent'
                />
                {toolbar.search && (
                    <button
                        type='button'
                        aria-label='Clear search'
                        onClick={() => toolbar.setSearch('')}
                        className='absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground'
                    >
                        <Icon icon={X} size={14} />
                    </button>
                )}
            </div>
            <div className='flex flex-wrap items-center gap-1' role='group' aria-label='Filter the log'>
                {chips.map(({ filter, label }) => {
                    const pressed = toolbar.filters.includes(filter);

                    return (
                        <button
                            key={filter}
                            type='button'
                            aria-pressed={pressed}
                            onClick={() => toolbar.toggleFilter(filter)}
                            className={cn(
                                controlClass,
                                pressed ? 'bg-accent text-accent-foreground' : 'bg-muted/70 text-muted-foreground'
                            )}
                        >
                            {label}
                        </button>
                    );
                })}
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
