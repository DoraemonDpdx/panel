/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SecretField from './SecretField';

const clipboard = vi.hoisted(() => ({ copy: vi.fn<(text: string) => Promise<boolean>>() }));

vi.mock('@/lib/clipboard', () => ({ default: clipboard.copy }));

afterEach(() => {
    cleanup();
    document.getElementById('modal-portal')?.remove();
});
beforeEach(() => {
    const portal = document.createElement('div');

    portal.id = 'modal-portal';
    document.body.append(portal);
    clipboard.copy.mockReset();
    clipboard.copy.mockResolvedValue(true);
});

describe('SecretField', () => {
    it('labels a masked input and shows the description', () => {
        render(<SecretField label='API key' value='sk-123' description='Shown once' />);

        expect(screen.getByLabelText('API key')).toHaveAttribute('type', 'password');
        expect(screen.getByText('Shown once')).toBeInTheDocument();
    });

    it('calls onReveal each time it is revealed, not when hidden or copied', async () => {
        const reveal = vi.fn();

        render(<SecretField label='API key' value='sk-123' onReveal={reveal} />);

        await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy api key' })));
        expect(reveal).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: 'Show api key' }));
        expect(reveal).toHaveBeenCalledTimes(1);
        expect(screen.getByLabelText('API key')).toHaveAttribute('type', 'text');

        fireEvent.click(screen.getByRole('button', { name: 'Hide api key' }));
        expect(reveal).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole('button', { name: 'Show api key' }));
        expect(reveal).toHaveBeenCalledTimes(2);
    });

    it('copies the value without revealing it', async () => {
        render(<SecretField label='API key' value='sk-123' />);

        await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy api key' })));

        expect(clipboard.copy).toHaveBeenCalledWith('sk-123');
        expect(screen.getByLabelText('API key')).toHaveAttribute('type', 'password');
    });

    it('marks an empty field and disables its actions', () => {
        const { container } = render(<SecretField label='Token' value={null} />);

        expect(container.firstElementChild).toHaveAttribute('data-empty', '');
        expect(screen.getByRole('button', { name: 'Show token' })).toBeDisabled();
    });
});
