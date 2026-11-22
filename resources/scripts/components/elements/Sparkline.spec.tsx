/** @vitest-environment jsdom */

import { act, cleanup, render, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import Sparkline, { pushSample, sampleDeltas, sparklineGeometry, useSparklineBuffer } from './Sparkline';

afterEach(cleanup);

describe('pushSample', () => {
    it('appends without mutating the buffer', () => {
        const buffer = [1, 2];

        expect(pushSample(buffer, 3)).toEqual([1, 2, 3]);
        expect(buffer).toEqual([1, 2]);
    });

    it('drops the oldest samples beyond the size', () => {
        expect(pushSample([1, 2, 3], 4, 3)).toEqual([2, 3, 4]);
    });

    it('ignores a value that is not a finite number', () => {
        expect(pushSample([1, 2], Number.NaN)).toEqual([1, 2]);
    });
});

describe('sampleDeltas', () => {
    it('measures the change between totals and never goes negative', () => {
        expect(sampleDeltas([10, 15, 5, 25])).toEqual([5, 0, 20]);
        expect(sampleDeltas([4])).toEqual([]);
    });
});

describe('sparklineGeometry', () => {
    it('draws nothing for fewer than two samples', () => {
        expect(sparklineGeometry([])).toBeNull();
        expect(sparklineGeometry([5])).toBeNull();
    });

    it('puts the newest sample on the right edge and scales to max', () => {
        const geometry = sparklineGeometry([0, 100], { max: 100, size: 2 });

        expect(geometry?.line).toBe('M0.00,24.00 L100.00,0.00');
    });

    it('keeps a short buffer at its true width, aligned right', () => {
        const geometry = sparklineGeometry([0, 0], { max: 100, size: 101 });

        expect(geometry?.line).toBe('M99.00,24.00 L100.00,24.00');
    });
});

describe('useSparklineBuffer', () => {
    it('appends once per fresh sample, even when the value repeats', () => {
        const { result, rerender } = renderHook(({ value, sample }) => useSparklineBuffer(value, { sample }), {
            initialProps: { value: 5, sample: 1 },
        });

        expect(result.current).toEqual([5]);

        rerender({ value: 5, sample: 1 });
        expect(result.current).toEqual([5]);

        rerender({ value: 5, sample: 2 });
        expect(result.current).toEqual([5, 5]);
    });

    it('keeps at most `size` samples', () => {
        const { result, rerender } = renderHook(({ value }) => useSparklineBuffer(value, { size: 3 }), {
            initialProps: { value: 1 },
        });

        for (const value of [2, 3, 4]) {
            rerender({ value });
        }

        expect(result.current).toEqual([2, 3, 4]);
    });

    it('empties while inactive', () => {
        const { result, rerender } = renderHook(({ active }) => useSparklineBuffer(7, { active }), {
            initialProps: { active: true },
        });

        expect(result.current).toEqual([7]);

        act(() => rerender({ active: false }));
        expect(result.current).toEqual([]);
    });
});

describe('Sparkline', () => {
    it('marks the tone and draws a line for skins', () => {
        const { container } = render(<Sparkline values={[1, 3, 2]} tone='warning' label='CPU' />);
        const root = container.querySelector('svg')!;

        expect(root).toHaveAttribute('data-ui', 'sparkline');
        expect(root).toHaveAttribute('data-tone', 'warning');
        expect(root).toHaveAttribute('aria-label', 'CPU');
        expect(container.querySelector('[data-part="line"]')).toHaveAttribute('d', expect.stringMatching(/^M/));
    });

    it('draws no line and is hidden from assistive technology without a label or samples', () => {
        const { container } = render(<Sparkline values={[1]} />);

        expect(container.querySelector('[data-part="line"]')).not.toBeInTheDocument();
        expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    });
});
