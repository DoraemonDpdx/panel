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

import type { HTMLAttributes, ReactNode } from 'react';
import { Clock, CloudDownload, CloudUpload, Cpu, HardDrive, MemoryStick, TriangleAlert, Wifi, type LucideIcon } from 'lucide-react';
import { bytesToString, CopyOnClick, Sparkline, sampleDeltas, useSparklineBuffer, type SparklineProps } from '@pterodactyl/sdk';
import { cn, type ServerRunState, type ServerStatMetric, type UiTone, type ViewProps } from '@pterodactyl/sdk/theme';

/** "1d 2h 3m", or "2h 3m 4s" under a day. */
function duration(seconds: number): string {
    const days = Math.floor(seconds / 86_400);
    const hours = Math.floor(seconds / 3600) % 24;
    const minutes = Math.floor(seconds / 60) % 60;

    return days > 0 ? `${days}d ${hours}h ${minutes}m` : `${hours}h ${minutes}m ${Math.floor(seconds) % 60}s`;
}

function uptimeText(state: ServerRunState | null, uptime: number): string {
    if (state === null) {
        return 'Offline';
    }

    return uptime > 0 ? duration(uptime / 1000) : state.charAt(0).toUpperCase() + state.slice(1);
}

const meterTone = { warning: 'bg-warning', danger: 'bg-destructive' } as const;

interface TileProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
    readonly icon: LucideIcon;
    readonly label: string;
    readonly value: ReactNode;
    readonly limit?: ReactNode;
    /** The share of the limit in use, 0 to 100; null draws no meter. */
    readonly percent?: number | null;
    readonly alarm?: ServerStatMetric['alarm'];
    /** A live line of recent readings, drawn under the value. */
    readonly trend?: ReactNode;
    readonly className?: string;
}

/** An inner tile is a plain fill: the stats card around it is the one piece of glass. */
/** Extra props reach the root, which is how CopyOnClick makes a tile copyable. */
function Tile({ icon: Icon, label, value, limit, percent = null, alarm = null, trend, className, ...rest }: TileProps) {
    return (
        <div {...rest} className={cn('fill flex min-w-0 flex-col justify-between gap-2 rounded-2xl p-3', className)}>
            <div className='flex items-center gap-2 text-xs text-muted-foreground'>
                <Icon className='size-3.5 shrink-0' aria-hidden />
                <span className='truncate'>{label}</span>
                {alarm && (
                    <span className={cn('ml-auto inline-flex items-center gap-1', alarm === 'danger' ? 'text-destructive' : 'text-warning')}>
                        <TriangleAlert className='size-3.5' aria-hidden />
                        <span>{alarm === 'danger' ? 'Critical' : 'High'}</span>
                    </span>
                )}
            </div>
            <div className='truncate font-mono text-base font-semibold text-foreground tabular-nums'>
                {value}
                {limit != null && <span className='ml-1.5 text-xs font-normal text-muted-foreground'>{limit}</span>}
            </div>
            {trend}
            {percent !== null && (
                <div
                    role='meter'
                    aria-label={label}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(percent)}
                    className='h-1 overflow-hidden rounded-full bg-white/10'
                >
                    <div className={cn('h-full rounded-full', alarm ? meterTone[alarm] : 'bg-primary')} style={{ width: `${percent}%` }} />
                </div>
            )}
        </div>
    );
}

const tone = (metric: ServerStatMetric): UiTone => metric.alarm ?? 'neutral';

/** The sparkline is the one place a reading shows its recent past; offline there is nothing to draw. */
function Trend({ offline, ...props }: SparklineProps & { readonly offline: boolean }) {
    return offline ? null : <Sparkline {...props} className={cn('h-7 w-full', props.className)} />;
}

/** Rolling samples of each reading, sampled on the same clock; empty while the server is offline. */
function useStatsHistory(model: ViewProps<'server.stats'>['model']) {
    const options = { sample: model, active: model.state !== 'offline' };
    const rx = useSparklineBuffer(model.network.rx, options);
    const tx = useSparklineBuffer(model.network.tx, options);

    return {
        cpu: useSparklineBuffer(model.cpu.value, options),
        memory: useSparklineBuffer(model.memory.value, options),
        disk: useSparklineBuffer(model.disk.value, options),
        rx: sampleDeltas(rx),
        tx: sampleDeltas(tx),
    };
}

const share = ({ value, limit }: ServerStatMetric) => (limit > 0 ? Math.min((value / limit) * 100, 100) : null);
const limitText = (limit: string | null) => (limit ? `of ${limit}` : 'Unlimited');
const bytesLimit = (limit: number) => (limit ? bytesToString(limit) : null);

/** Live resource values as tiles on one material card, each with a sparkline of the last minute. The numbers change; nothing else moves. */
export default function Stats({ model, className }: ViewProps<'server.stats'>) {
    const offline = model.state === 'offline';
    const address = model.address ?? 'n/a';
    const { cpu, memory, disk, network } = model;
    const history = useStatsHistory(model);

    return (
        <section aria-label='Server resources' className={cn('ast-stats mat rounded-3xl p-2', className)}>
            <div className='grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2'>
                <CopyOnClick text={address}>
                    <Tile icon={Wifi} label='Address' value={address} className='col-span-2' />
                </CopyOnClick>
                <Tile
                    icon={Clock}
                    label='Uptime'
                    value={uptimeText(model.state, model.uptime)}
                    className='col-span-2'
                />
                <Tile
                    icon={Cpu}
                    label='CPU load'
                    value={offline ? '0%' : `${cpu.value.toFixed(1)}%`}
                    limit={limitText(cpu.limit ? `${cpu.limit}%` : null)}
                    percent={share(cpu) ?? 0}
                    alarm={cpu.alarm}
                    trend={<Trend offline={offline} values={history.cpu} max={cpu.limit || undefined} tone={tone(cpu)} label='CPU load, last minute' />}
                />
                <Tile
                    icon={MemoryStick}
                    label='Memory'
                    value={offline ? '0 B' : bytesToString(memory.value)}
                    limit={limitText(bytesLimit(memory.limit))}
                    percent={share(memory) ?? 0}
                    alarm={memory.alarm}
                    trend={<Trend offline={offline} values={history.memory} max={memory.limit || undefined} tone={tone(memory)} label='Memory, last minute' />}
                />
                <Tile
                    icon={HardDrive}
                    label='Disk'
                    value={bytesToString(disk.value)}
                    limit={limitText(bytesLimit(disk.limit))}
                    percent={share(disk) ?? 0}
                    alarm={disk.alarm}
                    trend={<Trend offline={offline} values={history.disk} max={disk.limit || undefined} tone={tone(disk)} label='Disk, last minute' />}
                />
                <Tile
                    icon={CloudDownload}
                    label='Network in'
                    value={offline ? 'Offline' : bytesToString(network.rx)}
                    trend={<Trend offline={offline} values={history.rx} label='Inbound traffic, last minute' />}
                />
                <Tile
                    icon={CloudUpload}
                    label='Network out'
                    value={offline ? 'Offline' : bytesToString(network.tx)}
                    trend={<Trend offline={offline} values={history.tx} label='Outbound traffic, last minute' />}
                    className='col-span-2 sm:col-span-4 xl:col-span-2'
                />
            </div>
        </section>
    );
}

/* ― Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse ― */
