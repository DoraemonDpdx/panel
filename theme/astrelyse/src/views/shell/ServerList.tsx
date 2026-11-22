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

import { Check, Server as ServerIcon, X } from 'lucide-react';
import {
    Button,
    Checkbox,
    Empty,
    EmptyContent,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
    NewLinkButton,
    PageHeading,
    PanelLink,
    Pagination,
    Skeleton,
    Switch,
} from '@pterodactyl/sdk';
import {
    DASHBOARD_GROUPS,
    DASHBOARD_STATUS_FILTERS,
    GROUP_LABELS,
    Slot,
    STATUS_FILTER_LABELS,
    View,
    WORKLOAD_LABELS,
    type ListGroup,
    type ServerListItem,
    type ServerListModel,
    type ViewProps,
} from '@pterodactyl/sdk/theme';
import { WorkloadIcon } from './ServerCard';

/**
 * One server: a material card whose whole surface is the link. The content sits above the link, so the row slots'
 * own controls stay clickable; hover tints the link, which lands in 120ms and moves nothing.
 */
function ServerTile({ item, model }: { item: ServerListItem; model: ServerListModel }) {
    const { server } = item;
    const selected = model.selection.has(item.uuid);

    return (
        <article className='mat sh-tile rounded-3xl' data-selected={selected || undefined}>
            <PanelLink
                destination={{ to: '/server/$id', params: { id: item.identifier } }}
                aria-label={item.name}
                className='sh-tile-link'
            />
            <div className='sh-tile-select'>
                <Checkbox
                    checked={selected}
                    onChange={() => model.actions.toggleSelected(item.uuid)}
                    aria-label={`Select ${item.name}`}
                />
            </div>
            <div className='sh-tile-body'>
                <Slot name='dashboard.serverRow.before' data={server} />
                <View
                    name='dashboard.serverCard'
                    server={server}
                    className='sh-card-row'
                />
                <Slot name='dashboard.serverRow.metrics.after' data={server} />
                <Slot name='dashboard.serverRow.after' data={server} />
            </div>
        </article>
    );
}

/** The first-run steps, shown to anyone who has no servers of their own yet. */
const STEPS = [
    'Ask your host for a server, or create one if you manage this panel.',
    'Wait for it to finish installing; it shows up here as soon as it exists.',
    'Open it to reach the console, files and settings.',
];

function NoServers({ model }: { model: ServerListModel }) {
    const others = model.scope === 'others';
    const filtered = model.statusFilter !== 'all' || model.workloadFilter !== 'all';

    if (filtered && model.totals.servers > 0) {
        return (
            <Empty className='mat rounded-3xl'>
                <EmptyHeader>
                    <EmptyTitle>No servers match</EmptyTitle>
                    <EmptyDescription>Nothing on this page fits the current filters.</EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                    <Button
                        onClick={() => {
                            model.actions.setStatusFilter('all');
                            model.actions.setWorkloadFilter('all');
                        }}
                    >
                        Clear filters
                    </Button>
                </EmptyContent>
            </Empty>
        );
    }

    return (
        <Empty className='mat rounded-3xl'>
            <EmptyHeader>
                <EmptyMedia variant='icon'>
                    <ServerIcon />
                </EmptyMedia>
                <EmptyTitle>{others ? 'No other servers' : 'No servers yet'}</EmptyTitle>
                <EmptyDescription>
                    {others
                        ? 'There are no servers owned by other users.'
                        : 'Servers you own or are invited to will appear here.'}
                </EmptyDescription>
            </EmptyHeader>
            {!others && (
                <EmptyContent>
                    <ol className='sh-steps'>
                        {STEPS.map((step) => (
                            <li key={step}>{step}</li>
                        ))}
                    </ol>
                    {model.canCreateServers && <NewLinkButton to='/panel/servers/new'>New server</NewLinkButton>}
                </EmptyContent>
            )}
        </Empty>
    );
}

function Chip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button type='button' aria-pressed={pressed} onClick={onClick} className='sh-filter'>
            {children}
        </button>
    );
}

/** All, plus each workload present on the page; hidden while every server is of one kind. */
function WorkloadFilterRow({ model }: { model: ServerListModel }) {
    if (model.workloads.length < 2) return null;

    const options = ['all', ...model.workloads] as const;

    return (
        <div role='group' aria-label='Filter by type' className='sh-toolbar-row'>
            {options.map((option) => (
                <Chip
                    key={option}
                    pressed={model.workloadFilter === option}
                    onClick={() => model.actions.setWorkloadFilter(option)}
                >
                    {option !== 'all' && <WorkloadIcon workload={option} size='1em' />}
                    {option === 'all' ? 'All' : WORKLOAD_LABELS[option]}
                </Chip>
            ))}
        </div>
    );
}

function Toolbar({ model }: { model: ServerListModel }) {
    const { actions } = model;

    return (
        <div className='sh-toolbar'>
            <div role='group' aria-label='Filter by status' className='sh-toolbar-row'>
                {DASHBOARD_STATUS_FILTERS.map((option) => (
                    <Chip
                        key={option}
                        pressed={model.statusFilter === option}
                        onClick={() => actions.setStatusFilter(option)}
                    >
                        {STATUS_FILTER_LABELS[option]}
                        <span className='sh-filter-count'>{model.statusCounts[option]}</span>
                    </Chip>
                ))}
            </div>
            <WorkloadFilterRow model={model} />
            <div className='flex flex-wrap items-center justify-between gap-3'>
                <div role='group' aria-label='Group by' className='sh-toolbar-row'>
                    <span className='text-sm text-muted-foreground'>Group by</span>
                    {DASHBOARD_GROUPS.map((option) => (
                        <Chip key={option} pressed={model.group === option} onClick={() => actions.setGroup(option)}>
                            {GROUP_LABELS[option]}
                        </Chip>
                    ))}
                </div>
            </div>
        </div>
    );
}

// Green is for go/online only: Start is green, Stop is red and Restart is neutral.
const SIGNALS = [
    { signal: 'start', label: 'Start', color: 'green' },
    { signal: 'stop', label: 'Stop', color: 'red' },
    { signal: 'restart', label: 'Restart', color: 'grey' },
] as const;

/** Start, Stop and Restart for the selection, and each server's result afterwards. */
function BulkBar({ model }: { model: ServerListModel }) {
    const { selection, bulk, actions } = model;

    if (selection.size === 0 && bulk.results.length === 0 && !bulk.running) return null;

    return (
        <div className='fill sh-bulk' role='region' aria-label='Bulk actions'>
            <div className='flex flex-wrap items-center gap-2'>
                <span className='mr-2 text-sm text-foreground'>{selection.size} selected</span>
                {SIGNALS.map(({ signal, label, color }) => (
                    <Button
                        key={signal}
                        color={color}
                        disabled={selection.size === 0 || bulk.running}
                        onClick={() => void actions.runBulk(signal)}
                    >
                        {label}
                    </Button>
                ))}
                <Button.Text disabled={bulk.running} onClick={actions.selectAll}>
                    Select all
                </Button.Text>
                <Button.Text disabled={selection.size === 0 || bulk.running} onClick={actions.clearSelection}>
                    Clear
                </Button.Text>
            </div>
            {bulk.results.length > 0 && (
                <div className='mt-3'>
                    <div className='flex items-center justify-between text-sm text-foreground'>
                        <span>
                            {bulk.running
                                ? `Sending ${bulk.signal}…`
                                : `${bulk.results.filter((result) => result.ok).length} of ${bulk.results.length} succeeded`}
                        </span>
                        {!bulk.running && (
                            <button type='button' aria-label='Dismiss results' onClick={actions.dismissBulk}>
                                <X size='1em' aria-hidden />
                            </button>
                        )}
                    </div>
                    <ul className='mt-2 space-y-1 text-sm' aria-live='polite'>
                        {bulk.results.map((result) => (
                            <li key={result.uuid} className='flex items-center gap-2 text-foreground'>
                                {result.ok ? (
                                    <Check size='1em' className='text-success' aria-label='Succeeded' />
                                ) : (
                                    <X size='1em' className='text-destructive' aria-label='Failed' />
                                )}
                                <span>{result.name}</span>
                                {result.message && <span className='text-muted-foreground'>{result.message}</span>}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}

function Group({ entry, model }: { entry: ListGroup<ServerListItem>; model: ServerListModel }) {
    return (
        <section aria-label={entry.label || undefined} className='mb-5'>
            {entry.label && (
                <h3 className='mb-2 text-sm font-medium text-muted-foreground'>
                    {entry.label} <span className='font-normal'>({entry.items.length})</span>
                </h3>
            )}
            <div className='flex flex-col gap-3'>
                {entry.items.map((item) => (
                    <ServerTile key={item.uuid} item={item} model={model} />
                ))}
            </div>
        </section>
    );
}

function SubuserNote() {
    return (
        <p className='fill sh-note'>
            You can see these servers because their owners invited you. What you can do on each depends on the
            permissions you were given.
        </p>
    );
}

function LoadingList() {
    return (
        <div className='flex flex-col gap-3' aria-busy='true'>
            {[0, 1, 2].map((index) => (
                <div key={index} className='mat rounded-3xl p-5'>
                    <Skeleton kind='row' label='Loading servers' />
                </div>
            ))}
        </div>
    );
}

export default function ServerList({ model, className }: ViewProps<'dashboard.serverList'>) {
    const others = model.scope === 'others';
    const { pagination, totals } = model;

    return (
        <div className={className}>
            <PageHeading
                title='Servers'
                description={
                    pagination
                        ? `${totals.servers} total, ${totals.runningOnPage} running on this page`
                        : undefined
                }
                className='mb-5'
                actions={
                    model.canViewOthers && (
                        <Switch
                            checked={others}
                            onChange={() => model.actions.setScope(others ? 'mine' : 'others')}
                            label={others ? "Showing others' servers" : 'Showing your servers'}
                            controlPosition='end'
                            className='gap-2'
                        />
                    )
                }
            />
            <Slot name='dashboard.before' />
            {pagination ? (
                <>
                    {totals.servers > 0 && <Toolbar model={model} />}
                    {model.subuserOnly && <SubuserNote />}
                    <BulkBar model={model} />
                    <Pagination
                        data={{
                            data: [...model.servers],
                            meta: {
                                pagination: {
                                    total: pagination.total,
                                    count: pagination.count,
                                    per_page: pagination.perPage,
                                    current_page: pagination.currentPage,
                                    total_pages: pagination.totalPages,
                                },
                            },
                        }}
                        onPageSelect={model.actions.setPage}
                    >
                        {({ items }) =>
                            items.length > 0 ? (
                                model.groups.map((entry) => <Group key={entry.key} entry={entry} model={model} />)
                            ) : (
                                <NoServers model={model} />
                            )
                        }
                    </Pagination>
                </>
            ) : (
                <LoadingList />
            )}
            <Slot name='dashboard.after' />
        </div>
    );
}

/* ― Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse ― */
