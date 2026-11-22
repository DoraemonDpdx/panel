/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import Skeleton from './Skeleton';

afterEach(cleanup);

describe('Skeleton', () => {
    it('draws a static, hidden kind with its size', () => {
        const { container } = render(<Skeleton kind='circle' width={32} height={32} />);
        const kind = container.firstElementChild!;

        expect(kind).toHaveAttribute('aria-hidden', 'true');
        expect(kind).toHaveAttribute('data-kind', 'circle');
        expect(kind).toHaveStyle({ width: '32px', height: '32px' });
        expect(kind.className).not.toMatch(/animate|shimmer|pulse/);
    });

    it('announces a composite as one busy region', () => {
        render(<Skeleton kind='row' label='Loading servers' />);

        const region = screen.getByRole('status', { name: 'Loading servers' });

        expect(region).toHaveAttribute('aria-busy', 'true');
        expect(region.querySelectorAll('[data-kind="line"]')).toHaveLength(2);
        expect(region.querySelectorAll('[data-kind="circle"]')).toHaveLength(1);
    });

    it('draws the lines of a card and the plot of a chart', () => {
        const { container } = render(
            <>
                <Skeleton kind='card' lines={4} />
                <Skeleton kind='chart' label='Loading chart' />
            </>
        );

        expect(container.querySelectorAll('[data-kind="card"] [data-kind="line"]')).toHaveLength(5);
        expect(screen.getByRole('status', { name: 'Loading chart' }).querySelector('[data-kind="block"]')).toBeTruthy();
    });
});
