import { Badge, Card, NamedIcon, PageHeading, PanelLink, Skeleton, Spinner, Tabs, fromNow } from '@/sdk';
import type { ServerSoftwareModel, SoftwareOperationView, ViewProps } from '@/sdk/theme';
import MaintenancePanel from './MaintenancePanel';
import { ModpacksPanel, WorldsPanel } from './ContentPanels';
import TypePanel from './TypePanel';
import { EmptyNote, InlineError, Skeletons, Thumb } from './shared';

function StatusChip({ operation }: { operation: SoftwareOperationView }) {
    let tone: 'info' | 'danger' | 'success' = 'success';

    if (operation.active) {
        tone = 'info';
    } else if (operation.failed) {
        tone = 'danger';
    }

    return (
        <Badge variant='soft' tone={tone} role='status' aria-live='polite' className='gap-1.5'>
            {operation.active && <Spinner size='small' />}
            {operation.label}
            {!operation.active && operation.at && <span className='font-normal'>· {fromNow(operation.at)}</span>}
        </Badge>
    );
}

function OperationStatus({ model }: { model: ServerSoftwareModel }) {
    const { operation } = model.header;

    if (!operation) {
        return null;
    }

    return (
        <div className='flex flex-wrap items-center gap-x-3 gap-y-1'>
            <StatusChip operation={operation} />
            {(operation.active || operation.failed) && (
                <PanelLink
                    destination={model.consoleDestination}
                    className='text-sm text-muted-foreground underline hover:text-foreground'
                >
                    View install log
                </PanelLink>
            )}
            {operation.failed && operation.error && (
                <span className='min-w-0 text-sm break-words text-muted-foreground'>{operation.error}</span>
            )}
            {operation.note && <span className='min-w-0 text-sm text-muted-foreground'>{operation.note}</span>}
        </div>
    );
}

function CurrentCard({ model }: { model: ServerSoftwareModel }) {
    const { header } = model;

    return (
        <Card>
            <div className='flex flex-wrap items-center gap-x-6 gap-y-3'>
                <div className='flex min-w-0 items-center gap-3'>
                    <Badge variant='soft' className='size-10 shrink-0 justify-center text-base' aria-hidden>
                        <NamedIcon name={header.icon} />
                    </Badge>
                    <div className='min-w-0'>
                        <p className='text-xs text-muted-foreground'>Currently running</p>
                        <p className='font-medium break-words'>{header.version}</p>
                    </div>
                </div>
                {header.modpack && (
                    <div className='flex min-w-0 items-center gap-3'>
                        <Thumb url={header.modpack.iconUrl} title={header.modpack.title} />
                        <div className='min-w-0'>
                            <p className='text-xs text-muted-foreground'>Modpack</p>
                            <p className='font-medium break-words'>
                                {header.modpack.title}
                                {header.modpack.version && (
                                    <span className='font-normal text-muted-foreground'> {header.modpack.version}</span>
                                )}
                            </p>
                        </div>
                    </div>
                )}
                <OperationStatus model={model} />
            </div>
        </Card>
    );
}

export default function Software({ model, className }: ViewProps<'server.software'>) {
    const heading = (
        <PageHeading
            title='Software'
            description='Choose what your server runs, install modpacks and worlds, and repair or reset its files.'
        />
    );

    if (model.error) {
        return (
            <div className={className}>
                {heading}
                {model.error.kind === 'unsupported' ? (
                    <EmptyNote title='Not available'>{model.error.message}</EmptyNote>
                ) : (
                    <InlineError message={model.error.message} retry={model.retry} />
                )}
            </div>
        );
    }

    if (model.loading) {
        return (
            <div className={className}>
                {heading}
                <div className='flex flex-col gap-4' aria-busy>
                    <Skeleton kind='row' />
                    <Skeletons count={4} />
                </div>
            </div>
        );
    }

    return (
        <div className={`${className ?? ''} min-w-0 max-w-full`}>
            {heading}
            <div className='mb-4'>
                <CurrentCard model={model} />
            </div>
            <Tabs value={model.tab} onValueChange={(tab) => model.setTab(tab as typeof model.tab)}>
                <Tabs.List aria-label='Software sections'>
                    <Tabs.Tab value='type'>Server type</Tabs.Tab>
                    <Tabs.Tab value='modpacks'>Modpacks</Tabs.Tab>
                    <Tabs.Tab value='worlds'>Worlds</Tabs.Tab>
                    {model.canManage && <Tabs.Tab value='maintenance'>Maintenance</Tabs.Tab>}
                </Tabs.List>
                <Tabs.Panel value='type' className='min-w-0 pt-4'>
                    <TypePanel model={model} />
                </Tabs.Panel>
                <Tabs.Panel value='modpacks' className='min-w-0 pt-4'>
                    <ModpacksPanel model={model} />
                </Tabs.Panel>
                <Tabs.Panel value='worlds' className='min-w-0 pt-4'>
                    <WorldsPanel model={model} />
                </Tabs.Panel>
                {model.canManage && (
                    <Tabs.Panel value='maintenance' className='min-w-0 pt-4'>
                        <MaintenancePanel model={model} />
                    </Tabs.Panel>
                )}
            </Tabs>
        </div>
    );
}
