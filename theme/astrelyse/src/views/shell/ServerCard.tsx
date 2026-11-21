/*
 * ==========================================================================
 *  ____  ____  ____  __  __
 * |  _ \|  _ \|  _ \ \ \/ /
 * | | | | |_) | | | | \  /
 * | |_| |  __/| |_| | /  \
 * |____/|_|   |____/ /_/\_\
 *
 * BUILT BY  DPDX DEVELOPMENT  ·  BENGALURU, INDIA  ·  dpdx.in
 * BUILT FOR ASTRELYSE
 * ==========================================================================
 *
 * PROPRIETARY & CONFIDENTIAL. This file belongs to DPDX. A customer who receives
 * it inside a site, panel theme or bot built and shipped by DPDX may run it as
 * delivered, but does not own it, and no right to copy, modify, resell or reuse
 * it elsewhere is granted without prior written authorisation from DPDX.
 */

import { AudioLines, Bot, Copy, Database, Gamepad2, Globe, Server as ServerIcon, Star } from 'lucide-react';
import type { LucideIcon, LucideProps } from 'lucide-react';
import {
    bytesToString,
    cn,
    CopyOnClick,
    Sparkline,
    Spinner,
    StatusDot,
    useSparklineBuffer,
    type StatusDotStatus,
} from '@pterodactyl/sdk';
import {
    Slot,
    View,
    WORKLOAD_LABELS,
    type WorkloadProfile,
    type ServerCardModel,
    type ServerCardState,
    type ServerStatMetric,
    type ViewProps,
} from '@pterodactyl/sdk/theme';

const unavailable = {
    suspended: ['Suspended', 'danger'],
    'connection-error': ['Connection error', 'danger'],
    maintenance: ['Maintenance', 'warning'],
    transferring: ['Transferring', 'neutral'],
    installing: ['Installing', 'neutral'],
    'restoring-backup': ['Restoring backup', 'neutral'],
    unavailable: ['Unavailable', 'neutral'],
} as const;

const power = {
    running: ['Running', 'online'],
    starting: ['Starting', 'warning'],
    stopping: ['Stopping', 'warning'],
    offline: ['Offline', 'neutral'],
} as const;

/** The live state as a label and a tone. Green is reserved for a running server. */
function describe(state: ServerCardState): readonly [string, string] {
    if (state.kind === 'loading') return ['Loading', 'neutral'];
    if (state.kind === 'unavailable') return unavailable[state.reason];

    return power[state.power];
}

const workloadIcons = {
    game: Gamepad2,
    bot: Bot,
    web: Globe,
    database: Database,
    lavalink: AudioLines,
    generic: ServerIcon,
} as const satisfies Record<WorkloadProfile, LucideIcon>;

/** The icon of a workload profile. */
export function WorkloadIcon({ workload, ...props }: LucideProps & { workload: WorkloadProfile }) {
    const Icon = workloadIcons[workload];

    return <Icon aria-hidden {...props} />;
}

/** The dot of a card: its power state, a suspension, or `null` while there is nothing to say. */
function dotStatus({ state, sending }: ServerCardModel): StatusDotStatus | null {
    if (state.kind === 'unavailable') return state.reason === 'suspended' ? 'suspended' : null;
    if (state.kind !== 'ready') return null;
    if (state.power === 'running') return 'running';
    if (state.power === 'offline') return sending ? 'starting' : 'offline';

    return state.power === 'stopping' ? 'stopping' : 'starting';
}

/** A control inside a card that is itself a link: it must not follow the link. */
const stopLink = (event: { preventDefault: () => void; stopPropagation: () => void }) => {
    event.preventDefault();
    event.stopPropagation();
};

export function StateChip({ state, status }: { state: ServerCardState; status?: StatusDotStatus | null }) {
    const [label, tone] = describe(state);

    return (
        <span className='sh-chip' data-tone={tone}>
            {status ? <StatusDot status={status} /> : <span className='sh-chip-dot' aria-hidden />}
            {label}
        </span>
    );
}

export function PinButton({ model, className }: { model: ServerCardModel; className?: string }) {
    const label = model.pinned ? `Unpin ${model.name}` : `Pin ${model.name}`;

    return (
        <button
            type='button'
            aria-label={label}
            title={label}
            aria-pressed={model.pinned}
            onClick={(event) => {
                stopLink(event);
                model.actions.togglePin();
            }}
            className={cn('sh-pin', className)}
        >
            <Star size='1em' className={model.pinned ? 'fill-current' : undefined} aria-hidden />
        </button>
    );
}

/** Name, description and live state; the name slot follows the name. */
export function ServerCardIdentity({ model, server, className }: ViewProps<'dashboard.serverCard.identity'>) {
    return (
        <div className={cn('flex min-w-0 items-start gap-3', className)}>
            <span
                className='fill flex size-11 shrink-0 items-center justify-center rounded-2xl text-muted-foreground'
                title={WORKLOAD_LABELS[model.workload]}
            >
                <WorkloadIcon workload={model.workload} size={18} />
            </span>
            <div className='min-w-0 flex-1'>
                <div className='flex min-w-0 items-center gap-2'>
                    <h3 className='min-w-0 truncate text-base font-medium text-foreground'>{model.name}</h3>
                    <PinButton model={model} />
                    <Slot name='dashboard.serverRow.name.after' data={server} />
                </div>
                {!!model.description && (
                    <p className='mt-0.5 truncate text-sm text-muted-foreground'>{model.description}</p>
                )}
            </div>
            <StateChip state={model.state} status={dotStatus(model)} />
        </div>
    );
}

export function ServerCardAddress({ model, className }: ViewProps<'dashboard.serverCard.address'>) {
    return (
        <div className={cn('flex min-w-0 items-center gap-2', className)}>
            <p className='min-w-0 truncate font-mono text-sm text-muted-foreground'>
                {model.address ?? 'No address assigned'}
            </p>
            {model.address && (
                // The card sits in a link; a click here copies and must not navigate.
                <span onClick={stopLink} className='shrink-0'>
                    <CopyOnClick text={model.address}>
                        <button
                            type='button'
                            aria-label={`Copy address ${model.address}`}
                            className='sh-pin'
                        >
                            <Copy size='1em' aria-hidden />
                        </button>
                    </CopyOnClick>
                </span>
            )}
        </div>
    );
}

const tile = (value: ServerStatMetric) => (value.alarm === 'danger' ? 'danger' : value.alarm === 'warning' ? 'warning' : 'ok');

function Metric({
    label,
    value,
    limit,
    metric,
    trend,
}: {
    label: string;
    value: string;
    limit: string;
    metric: ServerStatMetric;
    trend?: React.ReactNode;
}) {
    const pct = metric.limit > 0 ? Math.min(100, (metric.value / metric.limit) * 100) : 0;

    return (
        <div className='fill min-w-0 rounded-2xl px-3 py-2.5' data-metric={tile(metric)}>
            <div className='flex items-center justify-between gap-2'>
                <p className='text-xs text-muted-foreground'>{label}</p>
                {trend}
            </div>
            <p className='mt-0.5 truncate font-mono text-sm text-foreground'>
                {value}
                {metric.limit > 0 && <span className='text-muted-foreground'> of {limit}</span>}
            </p>
            {metric.limit === 0 && <p className='truncate text-xs text-muted-foreground'>Unlimited</p>}
            <div className='sh-meter' aria-hidden>
                <span style={{ width: `${pct}%` }} />
            </div>
        </div>
    );
}

/** CPU, memory and disk, or why there is no reading. */
export function ServerCardMetrics({ model, className }: ViewProps<'dashboard.serverCard.metrics'>) {
    const { state } = model;
    const cpu = useSparklineBuffer(state.kind === 'ready' ? state.cpu.value : 0, {
        sample: model.sample,
        active: state.kind === 'ready',
    });

    if (state.kind === 'loading') {
        return (
            <div className={cn('flex h-[5.5rem] items-center justify-center', className)}>
                <Spinner size='small' />
            </div>
        );
    }

    if (state.kind === 'unavailable') {
        return (
            <p className={cn('fill rounded-2xl px-3 py-4 text-center text-sm text-muted-foreground', className)}>
                {unavailable[state.reason][0]}: no usage to show
            </p>
        );
    }

    const limit = (value: number, format: (v: number) => string) => (value === 0 ? 'unlimited' : format(value));

    return (
        <div className={cn('grid grid-cols-1 gap-2 sm:grid-cols-3', className)}>
            <Metric
                label='CPU'
                value={`${state.cpu.value.toFixed(0)}%`}
                limit={limit(state.cpu.limit, (v) => `${v}%`)}
                metric={state.cpu}
                trend={
                    <Sparkline
                        values={cpu}
                        max={100}
                        tone={state.cpu.alarm === 'danger' ? 'danger' : 'neutral'}
                        label='CPU, recent'
                        className='h-4 w-14'
                    />
                }
            />
            <Metric
                label='Memory'
                value={bytesToString(state.memory.value)}
                limit={limit(state.memory.limit, bytesToString)}
                metric={state.memory}
            />
            <Metric
                label='Disk'
                value={bytesToString(state.disk.value)}
                limit={limit(state.disk.limit, bytesToString)}
                metric={state.disk}
            />
        </div>
    );
}

/** The card's body: its pieces are views of their own, so a theme can replace one and keep the others. */
export default function ServerCard({ model, server, className }: ViewProps<'dashboard.serverCard'>) {
    return (
        <div className={cn('flex flex-col gap-4', className)}>
            <View name='dashboard.serverCard.identity' model={model} server={server} />
            <View name='dashboard.serverCard.address' model={model} server={server} />
            <View name='dashboard.serverCard.metrics' model={model} server={server} />
        </div>
    );
}

export type { ServerCardModel };

/* ― Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse ― */
