import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card, Icon, SpinnerOverlay, cn } from '@/sdk';

interface PromptCardProps {
    /** The prompt is showing; a closed prompt renders nothing. */
    open: boolean;
    title: string;
    icon?: LucideIcon;
    /** The prompt is saving, so it cannot be dismissed. */
    pending?: boolean;
    onClose: () => void;
    className?: string;
    children: ReactNode;
}

/**
 * A dismissible Material card stacked in a corner of the console. It appears instantly, with no
 * animation, and never blocks the console behind it.
 */
export default function PromptCard({
    open,
    title,
    icon,
    pending = false,
    onClose,
    className,
    children,
}: PromptCardProps) {
    if (!open) {
        return null;
    }

    return (
        <Card
            title={title}
            icon={icon}
            className={cn('pointer-events-auto w-full shadow-lg', className)}
            bodyClassName='flex flex-col gap-3 text-sm'
            actions={
                <button
                    type='button'
                    aria-label='Dismiss'
                    onClick={onClose}
                    disabled={pending}
                    className='rounded-sm p-1 text-muted-foreground transition-colors duration-100 hover:text-foreground disabled:opacity-50'
                >
                    <Icon icon={X} size={16} />
                </button>
            }
        >
            <SpinnerOverlay visible={pending} />
            {children}
        </Card>
    );
}

/** The row of buttons at the end of a card. */
export const PromptActions = ({ children }: { children: ReactNode }) => (
    <div className='flex flex-wrap items-center justify-end gap-2'>{children}</div>
);
