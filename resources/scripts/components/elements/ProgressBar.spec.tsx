/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import ProgressBar, { thresholdTone } from './ProgressBar';

afterEach(cleanup);

const indicatorTone = () => screen.getByRole('progressbar').getAttribute('data-tone');

describe('thresholdTone', () => {
    it.each([
        [0, 'success'],
        [69.9, 'success'],
        [70, 'warning'],
        [90, 'warning'],
        [90.1, 'danger'],
        [100, 'danger'],
    ] as const)('%s%% is %s', (value, tone) => {
        expect(thresholdTone(value)).toBe(tone);
    });

    it('has no tone without a reading', () => {
        expect(thresholdTone(null)).toBeNull();
    });

    it('honours custom limits', () => {
        expect(thresholdTone(55, { warning: 50, danger: 80 })).toBe('warning');
    });
});

describe('ProgressBar threshold', () => {
    it('keeps the given tone when no threshold is set', () => {
        render(<ProgressBar value={95} tone='info' label='Disk' />);

        expect(indicatorTone()).toBe('info');
    });

    it('defaults to neutral without a threshold or tone', () => {
        render(<ProgressBar value={95} label='Disk' />);

        expect(indicatorTone()).toBe('neutral');
    });

    it.each([
        [30, 'success'],
        [80, 'warning'],
        [95, 'danger'],
    ] as const)('%s%% turns %s with a threshold', (value, tone) => {
        render(<ProgressBar value={value} threshold label='Disk' />);

        expect(indicatorTone()).toBe(tone);
    });

    it('falls back to the tone when there is no reading', () => {
        render(<ProgressBar value={null} threshold tone='info' label='Disk' />);

        expect(screen.getByRole('progressbar')).toHaveAttribute('data-tone', 'info');
    });
});
