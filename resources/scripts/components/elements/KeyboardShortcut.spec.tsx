/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import KeyboardShortcut, { keyLabel, splitKeys } from './KeyboardShortcut';
import ShortcutsOverlay from './ShortcutsOverlay';
import { getShortcuts, registerShortcut, useRegisteredShortcut } from './shortcuts';

afterEach(() => {
    cleanup();
    document.getElementById('modal-portal')?.remove();
});

function Registered({ onRun, keys = 'g' }: { onRun?: () => void; keys?: string }) {
    useRegisteredShortcut({ id: 'test.go', keys, description: 'Go somewhere', group: 'Navigation', handler: onRun });

    return null;
}

describe('KeyboardShortcut', () => {
    it('splits combinations and labels keys per platform', () => {
        expect(splitKeys('mod+shift+k')).toEqual(['mod', 'shift', 'k']);
        expect(splitKeys('+')).toEqual(['+']);
        expect(keyLabel('mod', true)).toBe('⌘');
        expect(keyLabel('mod', false)).toBe('Ctrl');
        expect(keyLabel('k')).toBe('K');
    });

    it('draws a keycap per key and names the combination', () => {
        const { container } = render(<KeyboardShortcut keys='shift+/' />);

        expect(container.querySelector('kbd')).toHaveAttribute('aria-label', 'Shift + /');
        expect(container.querySelectorAll('[data-part="key"]')).toHaveLength(2);
    });
});

describe('shortcut registry', () => {
    it('lists a shortcut while mounted and runs its handler', () => {
        const run = vi.fn();
        const { unmount } = render(<Registered onRun={run} />);

        expect(getShortcuts().map((shortcut) => shortcut.id)).toContain('test.go');

        fireEvent.keyDown(window, { key: 'g' });
        expect(run).toHaveBeenCalledTimes(1);

        unmount();
        expect(getShortcuts().map((shortcut) => shortcut.id)).not.toContain('test.go');

        fireEvent.keyDown(window, { key: 'g' });
        expect(run).toHaveBeenCalledTimes(1);
    });

    it('only lists a shortcut registered without a handler', () => {
        const run = vi.fn();

        render(<Registered />);
        fireEvent.keyDown(window, { key: 'g' });

        expect(getShortcuts().map((shortcut) => shortcut.id)).toContain('test.go');
        expect(run).not.toHaveBeenCalled();
    });

    it('leaves keys typed in a field to the field', () => {
        const run = vi.fn();

        render(
            <>
                <Registered onRun={run} />
                <input aria-label='Name' />
            </>
        );
        fireEvent.keyDown(screen.getByLabelText('Name'), { key: 'g' });

        expect(run).not.toHaveBeenCalled();
    });

    it('lets a later registration of an id replace the earlier one', () => {
        const unregister = registerShortcut({ id: 'dup', keys: 'a', description: 'A' });
        const second = registerShortcut({ id: 'dup', keys: 'b', description: 'B' });

        expect(getShortcuts().filter((shortcut) => shortcut.id === 'dup')).toHaveLength(1);

        unregister();
        expect(getShortcuts().some((shortcut) => shortcut.id === 'dup')).toBe(true);
        second();
        expect(getShortcuts().some((shortcut) => shortcut.id === 'dup')).toBe(false);
    });
});

describe('ShortcutsOverlay', () => {
    it('opens on ? and lists registered shortcuts by group', () => {
        render(
            <>
                <Registered />
                <ShortcutsOverlay />
            </>
        );

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

        act(() => {
            fireEvent.keyDown(window, { key: '?', shiftKey: true });
        });

        const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });

        expect(dialog).toHaveTextContent('Navigation');
        expect(dialog).toHaveTextContent('Go somewhere');
        expect(dialog).toHaveTextContent('Show keyboard shortcuts');
    });

    it('is controlled when given open', () => {
        const onClose = vi.fn();

        render(<ShortcutsOverlay open onClose={onClose} />);
        fireEvent.click(screen.getByRole('button'));

        expect(onClose).toHaveBeenCalled();
    });
});
