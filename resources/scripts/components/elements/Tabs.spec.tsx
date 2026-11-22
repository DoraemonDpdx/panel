/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Tabs from './Tabs';

afterEach(cleanup);

function Example({ onValueChange }: { onValueChange?: (value: string) => void }) {
    return (
        <Tabs defaultValue='files' onValueChange={onValueChange}>
            <Tabs.List aria-label='Server sections'>
                <Tabs.Tab value='files'>Files</Tabs.Tab>
                <Tabs.Tab value='backups'>Backups</Tabs.Tab>
                <Tabs.Tab value='logs' disabled>
                    Logs
                </Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value='files'>File list</Tabs.Panel>
            <Tabs.Panel value='backups'>Backup list</Tabs.Panel>
        </Tabs>
    );
}

describe('Tabs', () => {
    it('exposes the tab roles and ties each tab to its panel', () => {
        render(<Example />);

        const list = screen.getByRole('tablist', { name: 'Server sections' });
        const files = screen.getByRole('tab', { name: 'Files' });
        const panel = screen.getByRole('tabpanel');

        expect(list).toHaveAttribute('data-ui', 'tabs');
        expect(files).toHaveAttribute('aria-selected', 'true');
        expect(files).toHaveAttribute('aria-controls', panel.id);
        expect(panel).toHaveAttribute('aria-labelledby', files.id);
        expect(panel).toHaveTextContent('File list');
        expect(screen.getByRole('tab', { name: 'Backups' })).toHaveAttribute('aria-selected', 'false');
    });

    it('keeps one tab stop and moves between tabs with the arrow keys', async () => {
        const change = vi.fn();

        render(<Example onValueChange={change} />);

        const files = screen.getByRole('tab', { name: 'Files' });
        const backups = screen.getByRole('tab', { name: 'Backups' });

        expect(files).toHaveAttribute('tabindex', '0');
        expect(backups).toHaveAttribute('tabindex', '-1');

        files.focus();
        fireEvent.keyDown(files, { key: 'ArrowRight' });
        await waitFor(() => expect(backups).toHaveFocus());

        fireEvent.keyDown(backups, { key: 'ArrowLeft' });
        await waitFor(() => expect(files).toHaveFocus());
    });

    it('selects a tab on click and shows its panel', () => {
        const change = vi.fn();

        render(<Example onValueChange={change} />);
        fireEvent.click(screen.getByRole('tab', { name: 'Backups' }));

        expect(change).toHaveBeenCalledWith('backups', expect.anything());
        expect(screen.getByRole('tabpanel')).toHaveTextContent('Backup list');
    });

    it('carries the orientation as state', () => {
        render(
            <Tabs defaultValue='a' orientation='vertical'>
                <Tabs.List aria-label='x'>
                    <Tabs.Tab value='a'>A</Tabs.Tab>
                </Tabs.List>
            </Tabs>
        );

        expect(screen.getByRole('tab')).toHaveAttribute('data-orientation', 'vertical');
        expect(screen.getByRole('tablist')).toHaveAttribute('aria-orientation', 'vertical');
    });
});
