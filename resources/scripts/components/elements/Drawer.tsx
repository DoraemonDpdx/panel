import React, { useRef } from 'react';
import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import Button from '@/components/elements/Button';
import { useSkin } from '@/themes/skins';

export type DrawerSide = 'right' | 'left';
export type DrawerSize = 'sm' | 'md' | 'lg';

export interface DrawerProps {
    open: boolean;
    onClose: () => void;
    /** Names the drawer; required, since it is the dialog's accessible name. */
    title: React.ReactNode;
    description?: React.ReactNode;
    /** The edge it slides in from. */
    side?: DrawerSide;
    size?: DrawerSize;
    /** Actions along the bottom edge, such as Save and Cancel buttons. */
    footer?: React.ReactNode;
    /** Ignores Esc, the backdrop and outside presses; the close button still calls `onClose`. */
    preventExternalClose?: boolean;
    hideCloseIcon?: boolean;
    className?: string;
    children?: React.ReactNode;
}

const focusableSelector =
    ':is(input, select, textarea, button, a[href], [tabindex]):not([disabled]):not([tabindex="-1"])';

/**
 * A side sheet for details and short forms, a lighter step than a dialog. It is modal: focus is trapped
 * inside, Esc closes it, and focus returns to what opened it. It uses the dialog's Base UI portal, so
 * the focus handling is the same as `Dialog`'s.
 */
export default function Drawer({
    open,
    onClose,
    title,
    description,
    side = 'right',
    size = 'md',
    footer,
    preventExternalClose,
    hideCloseIcon,
    className,
    children,
}: DrawerProps) {
    const popupRef = useRef<HTMLDivElement>(null);
    const bodyRef = useRef<HTMLDivElement>(null);
    const ui = useSkin('Drawer', { side, size, described: !!description, footer: !!footer });

    const initialFocus = (interactionType: string) => {
        if (interactionType === 'touch') {
            return popupRef.current;
        }

        // The close button is first in tab order only when there is nothing else to act on.
        const first = bodyRef.current?.querySelector<HTMLElement>(focusableSelector);

        return first ?? true;
    };

    return (
        <BaseDialog.Root
            open={open}
            onOpenChange={(next) => {
                if (!next && !preventExternalClose) {
                    onClose();
                }
            }}
        >
            <BaseDialog.Portal>
                <BaseDialog.Backdrop {...ui('backdrop')} />
                <div {...ui('viewport')}>
                    <BaseDialog.Popup ref={popupRef} {...ui('root', className)} initialFocus={initialFocus}>
                        <div {...ui('header')}>
                            <div {...ui('heading')}>
                                <BaseDialog.Title {...ui('title')}>{title}</BaseDialog.Title>
                                {description && (
                                    <BaseDialog.Description {...ui('description')}>
                                        {description}
                                    </BaseDialog.Description>
                                )}
                            </div>
                            {!hideCloseIcon && (
                                <Button.Text
                                    type='button'
                                    size='xsmall'
                                    aria-label='Close'
                                    onClick={onClose}
                                    className={ui.classes('closeButton')}
                                >
                                    <X {...ui('closeIcon')} aria-hidden />
                                </Button.Text>
                            )}
                        </div>
                        <div ref={bodyRef} {...ui('body')}>
                            {children}
                        </div>
                        {footer && <div {...ui('footer')}>{footer}</div>}
                    </BaseDialog.Popup>
                </div>
            </BaseDialog.Portal>
        </BaseDialog.Root>
    );
}
