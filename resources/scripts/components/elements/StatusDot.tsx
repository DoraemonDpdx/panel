import Spinner from '@/components/elements/Spinner';
import { replaceable, useSkin } from '@/themes/skins';

/** The states a server, node or project shows; `starting` and `stopping` are the transitions. */
export type StatusDotStatus = 'running' | 'starting' | 'stopping' | 'offline' | 'suspended';

export interface StatusDotProps {
    status: StatusDotStatus;
    /** The text name of the state. Defaults to the English name of `status`. */
    label?: string;
    /** Draws the label as text beside the dot; otherwise it names the dot for assistive technology only. */
    showLabel?: boolean;
    className?: string;
}

export const STATUS_LABELS = {
    running: 'Running',
    starting: 'Starting',
    stopping: 'Stopping',
    offline: 'Offline',
    suspended: 'Suspended',
} satisfies Record<StatusDotStatus, string>;

export const isTransitional = (status: StatusDotStatus): boolean => status === 'starting' || status === 'stopping';

/**
 * A flat status dot. A transition shows the panel's `Spinner` in its place: the dot itself never pulses.
 * The state is also the label, so colour is never the only signal.
 */
function CoreStatusDot({ status, label, showLabel = false, className }: StatusDotProps) {
    const ui = useSkin('StatusDot', { status, labelled: showLabel });
    const text = label ?? STATUS_LABELS[status];

    return (
        <span {...ui('root', className)} {...(showLabel ? {} : { role: 'img', 'aria-label': text })}>
            {isTransitional(status) ? <Spinner size='small' /> : <span {...ui('dot')} aria-hidden />}
            {showLabel && <span {...ui('label')}>{text}</span>}
        </span>
    );
}

const StatusDot = replaceable('StatusDot', CoreStatusDot);

export default StatusDot;
