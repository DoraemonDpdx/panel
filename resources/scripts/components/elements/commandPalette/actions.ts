import type { PanelDestination } from '@/sdk/navigation';
import type { PaletteAction } from './search';

export interface PaletteActionDeps {
    navigate: (destination: PanelDestination) => unknown;
    sendPower: (uuid: string, signal: 'start' | 'stop' | 'restart') => unknown;
    createBackup: (uuid: string) => unknown;
    notify: (message: string) => void;
}

const VERBS = { start: 'Starting', stop: 'Stopping', restart: 'Restarting' } as const;

/** Runs a palette action through the existing power, backup and navigation APIs. */
export function runPaletteAction(action: PaletteAction, deps: PaletteActionDeps): void {
    switch (action.type) {
        case 'navigate':
            void deps.navigate(action.destination);

            return;
        case 'power':
            void deps.sendPower(action.uuid, action.signal);
            deps.notify(`${VERBS[action.signal]} ${action.name}`);

            return;
        case 'backup':
            void deps.createBackup(action.uuid);
            deps.notify(`Backing up ${action.name}`);

            return;
    }
}
