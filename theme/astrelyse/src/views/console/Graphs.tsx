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

import { AreaChart, bytesToString, ChartCard, type ChartSeries } from '@pterodactyl/sdk';
import { cn, type ViewProps } from '@pterodactyl/sdk/theme';

const IN = 'var(--chart-2)';
const OUT = 'var(--chart-1)';

const VALUE_SERIES: ChartSeries[] = [{ dataKey: 'value', color: OUT }];
const NETWORK_SERIES: ChartSeries[] = [
    { dataKey: 'tx', color: OUT },
    { dataKey: 'rx', color: IN },
];

/** A legend that names its series in words; the swatch only backs the word up. */
function Legend() {
    return (
        <ul className='flex items-center gap-3 text-xs text-muted-foreground'>
            <li className='flex items-center gap-1.5'>
                <span aria-hidden className='size-2 rounded-full' style={{ background: IN }} />
                In
            </li>
            <li className='flex items-center gap-1.5'>
                <span aria-hidden className='size-2 rounded-full' style={{ background: OUT }} />
                Out
            </li>
        </ul>
    );
}

/** Three chart cards. The plots slide with live data; the cards around them do not move. */
export default function Graphs({ model, className }: ViewProps<'server.graphs'>) {
    const { live, windowMs } = model;

    return (
        <div className={cn('ast-graphs grid grid-cols-1 gap-4 md:grid-cols-3', className)}>
            <ChartCard title='CPU load'>
                <AreaChart
                    data={model.cpu.points}
                    series={VALUE_SERIES}
                    live={live}
                    windowMs={windowMs}
                    suggestedMax={model.cpu.limit}
                    tickFormatter={(value) => `${value.toFixed(2)}%`}
                />
            </ChartCard>
            <ChartCard title='Memory'>
                <AreaChart
                    data={model.memory.points}
                    series={VALUE_SERIES}
                    live={live}
                    windowMs={windowMs}
                    suggestedMax={model.memory.limit}
                    tickFormatter={(value) => `${value}MiB`}
                />
            </ChartCard>
            <ChartCard title='Network' legend={<Legend />}>
                <AreaChart
                    data={model.network.points}
                    series={NETWORK_SERIES}
                    live={live}
                    windowMs={windowMs}
                    tickFormatter={bytesToString}
                />
            </ChartCard>
        </div>
    );
}

/* ― Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse ― */
