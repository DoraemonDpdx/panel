/** @vitest-environment jsdom */

import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Drawer from './Drawer';

afterEach(() => {
    cleanup();
    document.getElementById('modal-portal')?.remove();
});

const noop = () => {};

function Harness({ onClose = noop, ...props }: Partial<React.ComponentProps<typeof Drawer>>) {
    const [open, setOpen] = useState(false);

    return (
        <>
            <button onClick={() => setOpen(true)}>Open</button>
            <Drawer
                open={open}
                title='Details'
                description='Everything about it'
                footer={<button>Save</button>}
                onClose={() => {
                    onClose();
                    setOpen(false);
                }}
                {...props}
            >
                <input aria-label='Name' />
            </Drawer>
        </>
    );
}

describe('Drawer', () => {
    it('renders nothing while closed', () => {
        render(<Harness />);

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('is a named, described modal dialog with its side and size', () => {
        render(<Drawer open onClose={() => {}} title='Details' description='Everything' side='left' size='lg' />);

        const dialog = screen.getByRole('dialog', { name: 'Details' });

        expect(dialog).toHaveAccessibleDescription('Everything');
        expect(dialog).toHaveAttribute('data-ui', 'drawer');
        expect(dialog).toHaveAttribute('data-side', 'left');
        expect(dialog).toHaveAttribute('data-size', 'lg');
    });

    it('moves focus to the first field and closes on Esc', async () => {
        const close = vi.fn();

        render(<Harness onClose={close} />);
        fireEvent.click(screen.getByText('Open'));

        await waitFor(() => expect(screen.getByLabelText('Name')).toHaveFocus());

        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
        expect(close).toHaveBeenCalledTimes(1);
    });

    it('closes from the close button, and can hide it', () => {
        const close = vi.fn();
        const { rerender } = render(<Drawer open onClose={close} title='Details' />);

        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(close).toHaveBeenCalledTimes(1);

        rerender(<Drawer open onClose={close} title='Details' hideCloseIcon />);
        expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    });

    it('ignores Esc when external close is prevented', () => {
        const close = vi.fn();

        render(<Drawer open onClose={close} title='Busy' preventExternalClose />);
        fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

        expect(close).not.toHaveBeenCalled();
    });

    it('renders the footer actions', () => {
        render(<Drawer open onClose={() => {}} title='T' footer={<button>Save</button>} />);

        expect(screen.getByRole('button', { name: 'Save' }).parentElement).toHaveAttribute('data-part', 'footer');
    });
});
