import { describe, expect, it, vi } from 'vitest';
import { runPaletteAction, type PaletteActionDeps } from './actions';

const deps = (): PaletteActionDeps => ({
    navigate: vi.fn(),
    sendPower: vi.fn(),
    createBackup: vi.fn(),
    notify: vi.fn(),
});

describe('runPaletteAction', () => {
    it('navigates', () => {
        const d = deps();
        const destination = { to: '/account' } as const;

        runPaletteAction({ type: 'navigate', destination }, d);

        expect(d.navigate).toHaveBeenCalledWith(destination);
        expect(d.sendPower).not.toHaveBeenCalled();
    });

    it('sends the chosen power signal to the chosen server', () => {
        const d = deps();

        runPaletteAction({ type: 'power', uuid: 'u-1', signal: 'restart', name: 'Survival' }, d);

        expect(d.sendPower).toHaveBeenCalledWith('u-1', 'restart');
        expect(d.notify).toHaveBeenCalledWith('Restarting Survival');
    });

    it('creates a backup', () => {
        const d = deps();

        runPaletteAction({ type: 'backup', uuid: 'u-2', name: 'Skyblock' }, d);

        expect(d.createBackup).toHaveBeenCalledWith('u-2');
        expect(d.notify).toHaveBeenCalledWith('Backing up Skyblock');
    });
});
