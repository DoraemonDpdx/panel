/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import StatusDot from './StatusDot';

afterEach(cleanup);

describe('StatusDot', () => {
    it('names the state and marks it for skins', () => {
        render(<StatusDot status='running' />);

        const dot = screen.getByRole('img', { name: 'Running' });

        expect(dot).toHaveAttribute('data-ui', 'status-dot');
        expect(dot).toHaveAttribute('data-status', 'running');
        expect(dot.querySelector('[data-part="dot"]')).toBeInTheDocument();
    });

    it.each(['starting', 'stopping'] as const)('shows a spinner instead of a dot while %s', (status) => {
        const { container } = render(<StatusDot status={status} />);

        expect(container.querySelector('[data-ui="spinner"]')).toBeInTheDocument();
        expect(container.querySelector('[data-part="dot"]')).not.toBeInTheDocument();
    });

    it.each(['offline', 'suspended'] as const)('draws a flat dot for %s', (status) => {
        const { container } = render(<StatusDot status={status} />);

        expect(container.querySelector('[data-part="dot"]')).toBeInTheDocument();
        expect(container.querySelector('[data-ui="spinner"]')).not.toBeInTheDocument();
    });

    it('draws the label as text on request, with a custom name', () => {
        render(<StatusDot status='suspended' showLabel label='Paused by admin' />);

        expect(screen.getByText('Paused by admin')).toHaveAttribute('data-part', 'label');
        expect(screen.queryByRole('img')).not.toBeInTheDocument();
    });
});
