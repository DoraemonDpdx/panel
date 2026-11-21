import { useEffect, useSyncExternalStore } from 'react';
import { useShortcut } from '@/plugins/useShortcut';

export interface ShortcutDefinition {
    /** Unique id; registering it again replaces the earlier entry. */
    id: string;
    /** A combination such as `mod+k`, `g` or `?`. */
    keys: string;
    description: string;
    /** The heading the `?` overlay lists it under. */
    group?: string;
    /** When given, the shortcut also runs it on the key press; otherwise the shortcut is only listed. */
    handler?: (event: KeyboardEvent) => void;
}

const registry = new Map<string, ShortcutDefinition>();
const listeners = new Set<() => void>();
let snapshot: readonly ShortcutDefinition[] = [];

function publish(): void {
    snapshot = [...registry.values()];
    for (const listener of listeners) {
        listener();
    }
}

/** Adds a shortcut to the registry and returns its unregister function. */
export function registerShortcut(definition: ShortcutDefinition): () => void {
    registry.set(definition.id, definition);
    publish();

    return () => {
        if (registry.get(definition.id) === definition) {
            registry.delete(definition.id);
            publish();
        }
    };
}

export function getShortcuts(): readonly ShortcutDefinition[] {
    return snapshot;
}

const subscribe = (listener: () => void) => {
    listeners.add(listener);

    return () => {
        listeners.delete(listener);
    };
};

/** Every registered shortcut, re-rendering as they change. */
export function useShortcuts(): readonly ShortcutDefinition[] {
    return useSyncExternalStore(subscribe, getShortcuts, getShortcuts);
}

/**
 * Lists a shortcut in the `?` overlay while the calling component is mounted. With a `handler` it also binds the
 * key through the panel's `useShortcut` (so keys typed in fields, dialogs and menus stay theirs); without one it
 * only lists a shortcut some other code already handles.
 */
export function useRegisteredShortcut(definition: ShortcutDefinition): void {
    const { id, keys, description, group, handler } = definition;

    useEffect(() => registerShortcut({ id, keys, description, group }), [id, keys, description, group]);
    useShortcut(keys, (event) => handler?.(event), { when: !!handler });
}
