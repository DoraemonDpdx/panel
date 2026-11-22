import { CheckCircle2, Info, ShieldAlert, TriangleAlert, type LucideIcon } from 'lucide-react';
import React from 'react';
import { replaceable, useSkin } from '@/themes/skins';

export type AlertType = 'success' | 'info' | 'warning' | 'danger';

export interface AlertProps {
    type: AlertType;
    title?: React.ReactNode;
    className?: string;
    /** A control for the banner, such as a Retry or Convert button; it sits inside the banner, centred on its height. */
    action?: React.ReactNode;
    children: React.ReactNode;
}

const icons = {
    success: CheckCircle2,
    info: Info,
    warning: TriangleAlert,
    danger: ShieldAlert,
} satisfies Record<AlertType, LucideIcon>;

function CoreAlert({ type, title, className, action, children }: AlertProps) {
    const ui = useSkin('Alert', { type });
    const AlertIcon = icons[type];

    return (
        <div role='alert' {...ui('root', className)}>
            <AlertIcon aria-hidden {...ui('icon')} />
            <div {...ui('body')}>
                {title && <p {...ui('title')}>{title}</p>}
                <div {...ui('content')}>{children}</div>
            </div>
            {action && <div className='ml-3 flex shrink-0 items-center self-center'>{action}</div>}
        </div>
    );
}

const Alert = replaceable('Alert', CoreAlert);

export default Alert;
