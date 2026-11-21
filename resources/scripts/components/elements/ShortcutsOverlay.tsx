import { useState } from 'react';
import { Dialog } from '@/components/elements/dialog';
import KeyboardShortcut from '@/components/elements/KeyboardShortcut';
import { useRegisteredShortcut, useShortcuts } from '@/components/elements/shortcuts';
import { useSkin } from '@/themes/skins';

export interface ShortcutsOverlayProps {
    /** Controls the overlay; leave both out and `?` toggles it. */
    open?: boolean;
    onClose?: () => void;
}

const DEFAULT_GROUP = 'General';

/** The `?` overlay: every shortcut registered with `useShortcut`, grouped. Mount it once, in the app shell. */
export default function ShortcutsOverlay({ open, onClose }: ShortcutsOverlayProps) {
    const [internal, setInternal] = useState(false);
    const shortcuts = useShortcuts();
    const ui = useSkin('ShortcutsOverlay', { empty: shortcuts.length === 0 });
    const controlled = open !== undefined;
    const visible = controlled ? open : internal;
    const close = () => (controlled ? onClose?.() : setInternal(false));

    useRegisteredShortcut({
        id: 'shortcuts.overlay',
        keys: '?',
        description: 'Show keyboard shortcuts',
        group: DEFAULT_GROUP,
        handler: () => (controlled ? undefined : setInternal((current) => !current)),
    });

    const groups = new Map<string, typeof shortcuts>();

    for (const shortcut of shortcuts) {
        const name = shortcut.group ?? DEFAULT_GROUP;

        groups.set(name, [...(groups.get(name) ?? []), shortcut]);
    }

    return (
        <Dialog open={visible} onClose={close} title='Keyboard shortcuts'>
            <div {...ui('root')}>
                {[...groups].map(([name, items]) => (
                    <section key={name} {...ui('group')} aria-label={name}>
                        <h3 {...ui('heading')}>{name}</h3>
                        <ul {...ui('list')}>
                            {items.map((shortcut) => (
                                <li key={shortcut.id} {...ui('item')}>
                                    <span {...ui('description')}>{shortcut.description}</span>
                                    <KeyboardShortcut keys={shortcut.keys} />
                                </li>
                            ))}
                        </ul>
                    </section>
                ))}
            </div>
        </Dialog>
    );
}
