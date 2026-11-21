import { useEffect } from 'react';
import { setHttpProgress, useHttpProgress } from '@/state/httpProgress';
import { randomInt } from '@/helpers';
import { replaceable, useSkin, type UiTone } from '@/themes/skins';

/** `meter` shows a value in a track; `page` is the loading bar along the top of the page. */
export type ProgressBarVariant = 'meter' | 'page';

export interface ProgressBarProps {
    /** Percent complete from 0 to 100; `null` shows the track alone. */
    value: number | null;
    variant?: ProgressBarVariant;
    /** Defaults to `accent` for the page bar and `neutral` otherwise. */
    tone?: UiTone;
    /**
     * Picks the tone from the value: `success` below `warning` (70%), `warning` up to `danger` (90%), `danger`
     * above. `true` uses those defaults. Overrides `tone`; without it `tone` is used as before.
     */
    threshold?: boolean | ProgressBarThresholds;
    /** Names a meter for assistive technology. */
    label?: string;
    className?: string;
}

export interface ProgressBarThresholds {
    /** Percent from which the bar is amber (exclusive of the green range below it). */
    warning: number;
    /** Percent above which the bar is red. */
    danger: number;
}

export const DEFAULT_PROGRESS_THRESHOLDS: ProgressBarThresholds = { warning: 70, danger: 90 };

/** `success` below `warning`, `warning` up to and including `danger`, `danger` above; `null` has no reading. */
export function thresholdTone(
    value: number | null,
    thresholds: ProgressBarThresholds = DEFAULT_PROGRESS_THRESHOLDS
): UiTone | null {
    if (value === null || Number.isNaN(value)) {
        return null;
    }

    if (value < thresholds.warning) {
        return 'success';
    }

    return value <= thresholds.danger ? 'warning' : 'danger';
}

function CoreProgressBar({ value, variant = 'meter', tone, threshold, label, className }: ProgressBarProps) {
    const meter = variant === 'meter';
    const automatic = threshold
        ? thresholdTone(value, threshold === true ? DEFAULT_PROGRESS_THRESHOLDS : threshold)
        : null;
    const ui = useSkin('ProgressBar', { variant, tone: automatic ?? tone ?? (meter ? 'neutral' : 'accent') });

    return (
        <div
            {...ui('root', className)}
            role={meter ? 'progressbar' : undefined}
            aria-label={meter ? label : undefined}
            aria-valuemin={meter ? 0 : undefined}
            aria-valuemax={meter ? 100 : undefined}
            aria-valuenow={meter ? (value ?? undefined) : undefined}
        >
            {value !== null && <div {...ui('indicator')} style={{ width: `${value}%` }} />}
        </div>
    );
}

const ProgressBar = replaceable('ProgressBar', CoreProgressBar);

export default ProgressBar;

/** The page loading bar, driven by the panel's HTTP requests. */
export function HttpProgressBar() {
    const { progress, continuous } = useHttpProgress();
    const visible = (progress || 0) > 0;

    useEffect(() => {
        if (progress !== 100) {
            return;
        }

        const timeout = setTimeout(() => setHttpProgress(undefined), 500);

        return () => clearTimeout(timeout);
    }, [progress]);

    useEffect(() => {
        if (!continuous) {
            return;
        }

        if (!progress || progress === 0) {
            setHttpProgress(randomInt(20, 30));

            return;
        }

        if (progress >= 90) {
            setHttpProgress(90);

            return;
        }

        const timeout = setTimeout(() => setHttpProgress(progress + randomInt(1, 5)), 500);

        return () => clearTimeout(timeout);
    }, [continuous, progress]);

    return <ProgressBar variant='page' value={visible ? (progress ?? 100) : null} />;
}
