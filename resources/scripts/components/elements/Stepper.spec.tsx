/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Stepper from './Stepper';

afterEach(cleanup);

const steps = [
    { id: 'a', label: 'Source' },
    { id: 'b', label: 'Build', description: 'Pick a runtime' },
    { id: 'c', label: 'Deploy' },
];

describe('Stepper', () => {
    it('marks the current step and says each state in text', () => {
        render(<Stepper steps={steps} current={1} />);

        expect(screen.getByRole('navigation', { name: 'Progress' })).toBeInTheDocument();
        expect(screen.getAllByRole('listitem')).toHaveLength(3);
        expect(screen.getByText('Build').closest('[aria-current="step"]')).toBeInTheDocument();
        expect(screen.getByText('(completed)')).toBeInTheDocument();
        expect(screen.getByText('(current step)')).toBeInTheDocument();
        expect(screen.getByText('Pick a runtime')).toBeInTheDocument();
    });

    it('carries the status as state on the item', () => {
        const { container } = render(<Stepper steps={steps} current={1} />);

        expect(
            [...container.querySelectorAll('[data-part="item"]')].map((item) => item.getAttribute('data-status'))
        ).toEqual(['complete', 'current', 'upcoming']);
    });

    it('is not interactive without onStepSelect', () => {
        render(<Stepper steps={steps} current={2} />);

        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('lets finished steps be revisited with a roving tab stop', () => {
        const select = vi.fn();

        render(<Stepper steps={steps} current={2} onStepSelect={select} />);

        const [first, second, third] = screen.getAllByRole('button');

        expect(screen.getAllByRole('button')).toHaveLength(3);
        expect(first).toHaveAttribute('tabindex', '-1');
        expect(third).toHaveAttribute('tabindex', '0');

        third!.focus();
        fireEvent.keyDown(third!, { key: 'ArrowLeft' });
        expect(second).toHaveFocus();
        fireEvent.keyDown(second!, { key: 'Home' });
        expect(first).toHaveFocus();
        fireEvent.keyDown(first!, { key: 'End' });
        expect(third).toHaveFocus();

        fireEvent.click(first!);
        expect(select).toHaveBeenCalledWith(0);
    });

    it('leaves upcoming steps unselectable', () => {
        render(<Stepper steps={steps} current={0} onStepSelect={() => {}} />);

        expect(screen.getAllByRole('button')).toHaveLength(1);
    });
});
