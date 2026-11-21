import { Star } from 'lucide-react';
import { cn, ListRow, StatusDot, type StatusDotStatus } from '@/sdk';
import { Slot, WORKLOAD_LABELS, type ServerCardModel, type ViewProps } from '@/sdk/theme';
import { WorkloadIcon } from './WorkloadIcon';

/** The dot of a card: its power state, a suspension, or `null` while there is nothing to say. */
function dotStatus({ state, sending }: ServerCardModel): StatusDotStatus | null {
    if (state.kind === 'unavailable') {
        return state.reason === 'suspended' ? 'suspended' : null;
    }

    if (state.kind !== 'ready') {
        return null;
    }

    if (state.power === 'running') {
        return 'running';
    }

    if (state.power === 'offline') {
        return sending ? 'starting' : 'offline';
    }

    return state.power === 'stopping' ? 'stopping' : 'starting';
}

/** A control inside a row that is itself a link: it must not follow the link. */
const stopLink = (event: { preventDefault: () => void; stopPropagation: () => void }) => {
    event.preventDefault();
    event.stopPropagation();
};

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
            className={cn('shrink-0 text-muted-foreground hover:text-foreground', className)}
        >
            <Star size='1em' className={model.pinned ? 'fill-current text-foreground' : undefined} aria-hidden />
        </button>
    );
}

export default function ServerCardIdentity({ model, server, className }: ViewProps<'dashboard.serverCard.identity'>) {
    const status = dotStatus(model);

    return (
        <div className={cn('flex items-center col-span-12 sm:col-span-5 lg:col-span-6', className)}>
            <ListRow.Icon className='mr-4'>
                <span title={WORKLOAD_LABELS[model.workload]}>
                    <WorkloadIcon workload={model.workload} size='1em' className='inline-block' />
                </span>
            </ListRow.Icon>
            <div className='min-w-0'>
                <div className='flex items-center gap-2'>
                    {status && <StatusDot status={status} />}
                    <ListRow.Title>{model.name}</ListRow.Title>
                    <PinButton model={model} />
                </div>
                {!!model.description && <ListRow.Description>{model.description}</ListRow.Description>}
            </div>
            <Slot name='dashboard.serverRow.name.after' data={server} />
        </div>
    );
}
