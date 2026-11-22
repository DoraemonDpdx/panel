import { Check, Server as ServerIcon, X } from 'lucide-react';
import {
    Button,
    Checkbox,
    cn,
    Empty,
    EmptyContent,
    EmptyDescription,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
    ListRow,
    NewLinkButton,
    PageHeading,
    Pagination,
    Skeleton,
    Switch,
} from '@/sdk';
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
    type UiTone,
    type ViewProps,
} from '@/sdk/theme';
import { WorkloadIcon } from './WorkloadIcon';

/** Running is good, starting and stopping are on their way, and anything else is down. */
function status({ state }: ServerListItem): UiTone {
    if (state.kind !== 'ready' || state.power === 'offline') {
        return 'danger';
    }

    return state.power === 'running' ? 'success' : 'warning';
}

function ServerRow({ item, model, className }: { item: ServerListItem; model: ServerListModel; className?: string }) {
    const { server } = item;
    return (
        <div className={cn('relative flex items-center gap-2', className)}>
            <Checkbox
                checked={model.selection.has(item.uuid)}
                onChange={() => model.actions.toggleSelected(item.uuid)}
                aria-label={`Select ${item.name}`}
                className='shrink-0'
            />
            <ListRow
                destination={{ to: '/server/$id', params: { id: item.identifier } }}
                aria-label={item.name}
                status={status(item)}
                className='grid min-w-0 flex-1 grid-cols-12 gap-4'
            >
                <Slot name='dashboard.serverRow.before' data={server} />
                <div className='col-span-12'>
                    <View name='dashboard.serverCard' server={server} />
                </div>
                <Slot name='dashboard.serverRow.metrics.after' data={server} />
                <Slot name='dashboard.serverRow.after' data={server} />
            </ListRow>
        </div>
    );
}

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
            <Empty className='border bg-card'>
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
        <Empty className='border bg-card'>
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
                    <ol className='list-decimal space-y-1 pl-5 text-left text-sm text-muted-foreground'>
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
        <button
            type='button'
            aria-pressed={pressed}
            onClick={onClick}
            className={cn(
                'inline-flex items-center gap-1.5 rounded-md border px-3 py-1 text-sm',
                pressed ? 'bg-accent text-accent-foreground' : 'bg-card'
            )}
        >
            {children}
        </button>
    );
}

/** All, plus each workload present on the page; hidden while every server is of one kind. */
function WorkloadFilterRow({ model }: { model: ServerListModel }) {
    if (model.workloads.length < 2) {
        return null;
    }

    const options = ['all', ...model.workloads] as const;

    return (
        <div role='group' aria-label='Filter by type' className='flex flex-wrap gap-2'>
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
        <div className='mb-4 space-y-3'>
            <div role='group' aria-label='Filter by status' className='flex flex-wrap gap-2'>
                {DASHBOARD_STATUS_FILTERS.map((option) => (
                    <Chip
                        key={option}
                        pressed={model.statusFilter === option}
                        onClick={() => actions.setStatusFilter(option)}
                    >
                        {STATUS_FILTER_LABELS[option]}
                        <span className='text-muted-foreground'>{model.statusCounts[option]}</span>
                    </Chip>
                ))}
            </div>
            <WorkloadFilterRow model={model} />
            <div className='flex flex-wrap items-center justify-between gap-3'>
                <div role='group' aria-label='Group by' className='flex flex-wrap items-center gap-2'>
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

const SIGNALS = [
    { signal: 'start', label: 'Start' },
    { signal: 'stop', label: 'Stop' },
    { signal: 'restart', label: 'Restart' },
] as const;

/** Start, Stop and Restart for the selection, and each server's result afterwards. */
function BulkBar({ model }: { model: ServerListModel }) {
    const { selection, bulk, actions } = model;

    if (selection.size === 0 && bulk.results.length === 0 && !bulk.running) {
        return null;
    }

    return (
        <div className='mb-4 rounded-md border bg-card p-3' role='region' aria-label='Bulk actions'>
            <div className='flex flex-wrap items-center gap-2'>
                <span className='mr-2 text-sm'>{selection.size} selected</span>
                {SIGNALS.map(({ signal, label }) => (
                    <Button
                        key={signal}
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
                    <div className='flex items-center justify-between text-sm'>
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
                            <li key={result.uuid} className='flex items-center gap-2'>
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
        <section aria-label={entry.label || undefined} className='mb-4'>
            {entry.label && (
                <h3 className='mb-2 text-sm font-medium text-muted-foreground'>
                    {entry.label} <span className='font-normal'>({entry.items.length})</span>
                </h3>
            )}
            <div className='space-y-2'>
                {entry.items.map((item) => (
                    <ServerRow key={item.uuid} item={item} model={model} />
                ))}
            </div>
        </section>
    );
}

function SubuserNote() {
    return (
        <p className='mb-4 rounded-md border bg-card p-3 text-sm text-muted-foreground'>
            You can see these servers because their owners invited you. What you can do on each depends on the
            permissions you were given.
        </p>
    );
}

function LoadingList() {
    return (
        <div className='space-y-2' aria-busy='true'>
            {[0, 1, 2].map((index) => (
                <Skeleton key={index} kind='row' label='Loading servers' />
            ))}
        </div>
    );
}

export default function ServerList({ model, className }: ViewProps<'dashboard.serverList'>) {
    const others = model.scope === 'others';
    const { pagination } = model;

    return (
        <div className={className}>
            <PageHeading
                title='Servers'
                className='mb-4'
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
                    {model.totals.servers > 0 && <Toolbar model={model} />}
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
