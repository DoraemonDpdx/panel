import { useCallback, useMemo, useState, useSyncExternalStore, type RefObject } from 'react';
import type { Terminal } from 'ghostty-web';
import { usePersistedState } from '@/plugins/usePersistedState';
import type { ConsoleLog } from './consoleLog';
import { filterEntries, groupLogEntries, toPlainText, type LogFilter } from './logParser';
import type { ServerConsoleToolbar, ServerLogViewerModel } from './toolbarTypes';

export type { ServerConsoleToolbar, ServerLogViewerModel } from './toolbarTypes';

/** The newest entries the structured view draws; older ones stay in the download. */
export const MAX_VISIBLE_ENTRIES = 2_000;

const noFilters: LogFilter[] = [];

/** Whether the structured view replaces the terminal canvas right now. */
export const isViewerActive = (
    toolbar: Pick<ServerConsoleToolbar, 'structured' | 'search' | 'filters' | 'timestamps'>
) => toolbar.structured || toolbar.search.length > 0 || toolbar.filters.length > 0 || toolbar.timestamps;

export function downloadText(name: string, text: string) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');

    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

/** The toolbar's state, and the lines the structured view shows when the toolbar asks for it. */
export function useConsoleToolbar(serverId: string, log: ConsoleLog, terminal: RefObject<Terminal | null>) {
    const [search, setSearch] = useState('');
    const [filters, setFilters] = useState<LogFilter[]>(noFilters);
    const [storedTimestamps, setTimestamps] = usePersistedState<boolean>(`${serverId}:console_timestamps`, false);
    const [storedStructured, setStructured] = usePersistedState<boolean>(`${serverId}:console_structured`, false);
    const version = useSyncExternalStore(log.subscribe, log.getSnapshot);
    const timestamps = storedTimestamps ?? false;
    const structured = storedStructured ?? false;
    const paused = log.paused;

    const toggleFilter = useCallback(
        (filter: LogFilter) =>
            setFilters((current) =>
                current.includes(filter) ? current.filter((value) => value !== filter) : [...current, filter]
            ),
        []
    );
    const clearFilters = useCallback(() => setFilters(noFilters), []);
    const setPaused = useCallback((value: boolean) => log.setPaused(value), [log]);
    const clear = useCallback(() => {
        terminal.current?.clear();
        log.clear();
    }, [log, terminal]);
    const download = useCallback(
        () =>
            downloadText(
                `console-${new Date().toISOString().slice(0, 19).replaceAll(':', '-')}.log`,
                toPlainText(log.getLines(), timestamps)
            ),
        [log, timestamps]
    );

    const toolbar = useMemo<ServerConsoleToolbar>(
        () => ({
            search,
            setSearch,
            filters,
            toggleFilter,
            clearFilters,
            timestamps,
            setTimestamps: (value) => setTimestamps(value),
            structured,
            setStructured: (value) => setStructured(value),
            paused,
            setPaused,
            clear,
            download,
        }),
        [
            search,
            filters,
            toggleFilter,
            clearFilters,
            timestamps,
            setTimestamps,
            structured,
            setStructured,
            paused,
            setPaused,
            clear,
            download,
        ]
    );

    const active = isViewerActive(toolbar);
    const viewer = useMemo<ServerLogViewerModel | null>(() => {
        if (!active) {
            return null;
        }

        const lines = log.getLines();
        const entries = filterEntries(groupLogEntries(lines), { filters: new Set(filters), search });

        return {
            entries: entries.slice(-MAX_VISIBLE_ENTRIES),
            total: lines.length,
            search,
            timestamps,
            paused,
        };
        // `version` stands for the lines, which the log mutates in place.
        // oxlint-disable-next-line react-hooks/exhaustive-deps
    }, [active, log, version, filters, search, timestamps, paused]);

    return { toolbar, viewer };
}
