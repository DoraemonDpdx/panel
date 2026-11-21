import { useEffect, useRef } from 'react';
import { Search as SearchIcon } from 'lucide-react';
import { cn, CommandPaletteHost, Icon, openCommandPalette, Tooltip } from '@/sdk';
import type { ViewProps } from '@/sdk/theme';

/**
 * The search trigger and the command palette it opens. The palette (`mod+k`) searches servers, pages and actions;
 * the model's own `mod+/` shortcut and trigger open it too.
 */
export default function Search({ model, className }: ViewProps<'app.search'>) {
    // The model's own `mod+/` opens its search; hand that over to the palette. A model that starts open (a
    // fixture) is left alone.
    const wasOpen = useRef(model.open);

    useEffect(() => {
        if (model.open && !wasOpen.current) {
            openCommandPalette();
            model.close();
        }

        wasOpen.current = model.open;
    }, [model]);

    return (
        <>
            <CommandPaletteHost />
            <Tooltip placement='bottom' content='Search'>
                <button
                    type='button'
                    aria-label='Search'
                    aria-keyshortcuts={model.shortcut.aria}
                    className={cn('navigation-link', className)}
                    onClick={openCommandPalette}
                >
                    <Icon icon={SearchIcon} />
                </button>
            </Tooltip>
        </>
    );
}
