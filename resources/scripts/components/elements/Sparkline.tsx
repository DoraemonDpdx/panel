import { useEffect, useRef, useState } from 'react';
import { replaceable, useSkin, type UiTone } from '@/themes/skins';

/** Samples a sparkline keeps unless told otherwise; at one sample a second that is the last minute. */
export const SPARKLINE_SIZE = 60;

/** Appends a sample to a rolling buffer, dropping the oldest ones beyond `size`. Never mutates `buffer`. */
export function pushSample(buffer: readonly number[], value: number, size: number = SPARKLINE_SIZE): number[] {
    if (!Number.isFinite(value)) {
        return buffer.slice(-size);
    }

    const next = buffer.length >= size ? buffer.slice(buffer.length - size + 1) : buffer.slice();

    next.push(value);

    return next;
}

/** The change between neighbouring samples of a running total, such as network bytes; never below 0. */
export function sampleDeltas(totals: readonly number[]): number[] {
    return totals.slice(1).map((total, index) => Math.max(0, total - totals[index]));
}

export interface SparklineGeometry {
    readonly line: string;
    readonly area: string;
}

const WIDTH = 100;
const HEIGHT = 24;

/**
 * The SVG path of a line through `values`, spread over a 100 by 24 box with the newest value on the right.
 * `max` fixes the top of the scale (such as 100 for a percentage); otherwise the largest value sets it.
 * Fewer than two values draw nothing. A buffer shorter than `size` is drawn at its true width from the right.
 */
export function sparklineGeometry(
    values: readonly number[],
    { min = 0, max, size = SPARKLINE_SIZE }: { min?: number; max?: number; size?: number } = {}
): SparklineGeometry | null {
    if (values.length < 2) {
        return null;
    }

    const top = max ?? Math.max(...values, min + 1);
    const span = top - min || 1;
    const step = WIDTH / Math.max(size - 1, 1);
    const offset = WIDTH - step * (values.length - 1);
    const point = (value: number, index: number) => {
        const clamped = Math.min(Math.max(value, min), top);
        const x = offset + step * index;
        const y = HEIGHT - ((clamped - min) / span) * HEIGHT;

        return `${x.toFixed(2)},${y.toFixed(2)}`;
    };

    const points = values.map(point);

    const line = `M${points.join(' L')}`;
    const first = points[0].split(',')[0];

    return { line, area: `${line} L${WIDTH},${HEIGHT} L${first},${HEIGHT} Z` };
}

/**
 * A rolling buffer of the values a component is given. A sample is appended each time `sample` changes
 * (pass whatever identifies a fresh reading, such as the stats object), so a repeated value still counts.
 * `active: false` empties the buffer, such as while a server is offline.
 */
export function useSparklineBuffer(
    value: number,
    { sample = value, size = SPARKLINE_SIZE, active = true }: { sample?: unknown; size?: number; active?: boolean } = {}
): readonly number[] {
    const [buffer, setBuffer] = useState<readonly number[]>([]);
    const last = useRef<unknown>(undefined);

    useEffect(() => {
        if (!active) {
            last.current = undefined;
            setBuffer((current) => (current.length ? [] : current));

            return;
        }

        if (Object.is(last.current, sample)) {
            return;
        }

        last.current = sample;
        setBuffer((current) => pushSample(current, value, size));
    }, [value, sample, size, active]);

    return buffer;
}

export interface SparklineProps {
    /** Samples, oldest first. */
    values: readonly number[];
    /** The top of the scale, such as 100 for a percentage; defaults to the largest value. */
    max?: number;
    min?: number;
    /** The number of samples a full line holds, which sets the spacing between them. */
    size?: number;
    tone?: UiTone;
    /** Names the line for assistive technology, such as "CPU, last minute". */
    label?: string;
    className?: string;
}

/** A tiny line of recent values. Not animated: it redraws when a new sample arrives. */
function CoreSparkline({
    values,
    max,
    min,
    size = SPARKLINE_SIZE,
    tone = 'neutral',
    label,
    className,
}: SparklineProps) {
    const ui = useSkin('Sparkline', { tone, empty: values.length < 2 });
    const geometry = sparklineGeometry(values, { min, max, size });

    return (
        <svg
            {...ui('root', className)}
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            preserveAspectRatio='none'
            role={label ? 'img' : undefined}
            aria-label={label}
            aria-hidden={label ? undefined : true}
        >
            {geometry && <path {...ui('area')} d={geometry.area} />}
            {geometry && <path {...ui('line')} d={geometry.line} fill='none' vectorEffect='non-scaling-stroke' />}
        </svg>
    );
}

const Sparkline = replaceable('Sparkline', CoreSparkline);

export default Sparkline;
