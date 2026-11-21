import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import {
    Alert,
    Badge,
    Button,
    Dialog,
    Empty,
    EmptyContent,
    EmptyDescription,
    EmptyHeader,
    EmptyTitle,
    Label,
    ListRow,
    Select,
    Skeleton,
    type SelectProps,
} from '@/sdk';

export const compact = new Intl.NumberFormat('en', { notation: 'compact' });

/** A select named for assistive technology; the name is shown only when `visible`. */
export function NamedSelect({ label, visible, ...props }: { label: string; visible?: boolean } & SelectProps) {
    const id = useId();

    return (
        <div className='flex min-w-0 flex-col gap-1'>
            <Label htmlFor={id} className={visible ? undefined : 'sr-only'}>
                {label}
            </Label>
            <Select id={id} {...props} />
        </div>
    );
}

export function Thumb({ url, title }: { url: string | null; title: string }) {
    return url ? (
        <img src={url} alt='' loading='lazy' className='size-10 shrink-0 rounded-sm object-cover' />
    ) : (
        <Badge variant='soft' className='size-10 shrink-0 justify-center text-base' aria-hidden>
            {title.charAt(0).toUpperCase()}
        </Badge>
    );
}

export function ExternalLinkText({ href, children }: { href: string; children: ReactNode }) {
    return (
        <a
            href={href}
            target='_blank'
            rel='noopener noreferrer'
            className='inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground'
        >
            {children}
            <ExternalLink className='size-3' aria-hidden />
        </a>
    );
}

export function Skeletons({ count }: { count: number }) {
    return (
        <div className='flex flex-col gap-2' aria-busy role='status' aria-label='Loading'>
            {Array.from({ length: count }, (_, index) => (
                <Skeleton key={index} kind='row' />
            ))}
        </div>
    );
}

/** An error in place, never the full-page illustration. */
export function InlineError({ message, retry }: { message: string; retry?: () => void }) {
    return (
        <div className='flex items-start gap-2'>
            <Alert type='danger' className='min-w-0 flex-1'>
                {message}
            </Alert>
            {retry && (
                <Button size='xsmall' isSecondary color='grey' onClick={retry}>
                    Retry
                </Button>
            )}
        </div>
    );
}

export function EmptyNote({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
    return (
        <Empty size='compact'>
            <EmptyHeader>
                <EmptyTitle>{title}</EmptyTitle>
                {children && <EmptyDescription>{children}</EmptyDescription>}
            </EmptyHeader>
            {action && <EmptyContent>{action}</EmptyContent>}
        </Empty>
    );
}

export interface RadioOption {
    readonly value: string;
    readonly content: ReactNode;
}

/** One choice of several, as rows: arrow keys move the selection, and only the chosen row is in the tab order. */
export function RadioList({
    label,
    options,
    value,
    onChange,
    disabled,
    className = 'flex flex-col gap-2',
}: {
    label: string;
    options: readonly RadioOption[];
    value: string | null;
    onChange: (value: string) => void;
    disabled?: boolean;
    className?: string;
}) {
    const group = useRef<HTMLDivElement>(null);
    const ids = options.map((option) => option.value);
    const move = (event: KeyboardEvent<HTMLElement>) => {
        const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];

        if (step === undefined || disabled) {
            return;
        }

        event.preventDefault();

        const index = Math.max(0, ids.indexOf(value ?? ''));
        const next = ids[(index + step + ids.length) % ids.length];

        if (next !== undefined) {
            onChange(next);
            group.current?.querySelector<HTMLElement>(`[data-value='${CSS.escape(next)}']`)?.focus();
        }
    };

    return (
        <div
            ref={group}
            role='radiogroup'
            aria-label={label}
            aria-disabled={disabled || undefined}
            className={className}
        >
            {options.map((option) => {
                const selected = option.value === value;

                return (
                    <ListRow
                        key={option.value}
                        role='radio'
                        data-value={option.value}
                        aria-checked={selected}
                        aria-disabled={disabled || undefined}
                        tabIndex={selected || (value === null && option.value === ids[0]) ? 0 : -1}
                        onClick={() => !disabled && onChange(option.value)}
                        onKeyDown={move}
                        className='flex cursor-pointer flex-col items-start! gap-1 text-left aria-checked:ring-2 aria-checked:ring-ring focus-visible:outline-2 aria-disabled:cursor-not-allowed aria-disabled:opacity-60'
                    >
                        {option.content}
                    </ListRow>
                );
            })}
        </div>
    );
}

/** A confirmation that is not a deletion: its action is the primary one, or the danger one when `danger`. */
export function ConfirmDialog({
    title,
    confirm,
    danger,
    pending,
    disabled,
    onConfirm,
    onClose,
    children,
}: {
    title: string;
    confirm: string;
    danger?: boolean;
    pending?: boolean;
    disabled?: boolean;
    onConfirm: () => void;
    onClose: () => void;
    children: ReactNode;
}) {
    const Action = danger ? Button.Danger : Button;

    return (
        <Dialog open onClose={onClose} title={title} preventExternalClose={pending} hideCloseIcon={pending}>
            <div className='flex flex-col gap-3'>{children}</div>
            <Dialog.Footer>
                <Button.Text disabled={pending} onClick={onClose}>
                    Cancel
                </Button.Text>
                <Action isLoading={pending} disabled={disabled} onClick={onConfirm}>
                    {confirm}
                </Action>
            </Dialog.Footer>
        </Dialog>
    );
}
