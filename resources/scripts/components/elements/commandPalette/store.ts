import { useSyncExternalStore } from 'react';

let open = false;
const listeners = new Set<() => void>();

const set = (next: boolean) => {
    if (open !== next) {
        open = next;
        for (const listener of listeners) {
            listener();
        }
    }
};

export const openCommandPalette = () => set(true);
export const closeCommandPalette = () => set(false);

const subscribe = (listener: () => void) => {
    listeners.add(listener);

    return () => {
        listeners.delete(listener);
    };
};

/** Whether the palette is open; shared so the search trigger and `mod+k` open the same palette. */
export const useCommandPaletteOpen = (): boolean =>
    useSyncExternalStore(
        subscribe,
        () => open,
        () => open
    );
