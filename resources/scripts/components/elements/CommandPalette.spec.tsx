/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CommandPalette from './CommandPalette';
import type { PaletteItem } from './commandPalette/search';

const item = (id: string, label: string, kind: PaletteItem['kind'] = 'page'): PaletteItem => ({
    id,
    kind,
    label,
    action: { type: 'navigate', destination: { to: '/' } },
});

const sections = [
    { heading: 'Servers', items: [item('a', 'Alpha', 'server'), item('b', 'Beta', 'server')] },
    { heading: 'Pages', items: [item('c', 'Console')] },
];

afterEach(cleanup);

function setup(overrides = {}) {
    const props = {
        open: true,
        onClose: vi.fn(),
        query: '',
        onQueryChange: vi.fn(),
        sections,
        onSelect: vi.fn(),
        ...overrides,
    };

    render(<CommandPalette {...props} />);

    return { props, input: screen.getByRole('combobox') };
}

describe('CommandPalette', () => {
    it('focuses the input and marks the first option active', async () => {
        const { input } = setup();

        await waitFor(() => expect(input).toHaveFocus());
        expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
    });

    it('moves with arrow keys, wrapping, and selects with Enter', () => {
        const { props, input } = setup();

        fireEvent.keyDown(input, { key: 'ArrowDown' });
        expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');
        fireEvent.keyDown(input, { key: 'ArrowDown' });
        fireEvent.keyDown(input, { key: 'ArrowDown' });
        expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
        fireEvent.keyDown(input, { key: 'ArrowUp' });
        fireEvent.keyDown(input, { key: 'Enter' });

        expect(props.onSelect).toHaveBeenCalledWith(sections[1]!.items[0]);
    });

    it('selects by click and reports typing', () => {
        const { props, input } = setup();

        fireEvent.click(screen.getByText('Beta'));
        fireEvent.change(input, { target: { value: 'be' } });

        expect(props.onSelect).toHaveBeenCalledWith(sections[0]!.items[1]);
        expect(props.onQueryChange).toHaveBeenCalledWith('be');
    });

    it('closes on Escape and shows an empty state', () => {
        const { props } = setup({ sections: [], query: 'zzz' });

        fireEvent.keyDown(document.activeElement!, { key: 'Escape' });

        expect(props.onClose).toHaveBeenCalled();
        expect(screen.getByText(/Nothing matches/)).toBeInTheDocument();
    });
});
