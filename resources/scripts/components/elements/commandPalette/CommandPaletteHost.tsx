import { useMemo, useState } from 'react';
import CommandPalette from '@/components/elements/CommandPalette';
import { useRegisteredShortcut } from '@/components/elements/shortcuts';
import { closeCommandPalette, openCommandPalette, useCommandPaletteOpen } from './store';
import { groupItems, pushRecent, rankItems, readRecents, type PaletteItem } from './search';
import { usePaletteItems } from './usePaletteItems';

/** The palette wired to the panel's data; mounted only while open, so the closed search needs no backend. */
function PaletteBody() {
    const open = useCommandPaletteOpen();
    const [query, setQuery] = useState('');
    const { userId, items, run } = usePaletteItems(open);
    const [recents, setRecents] = useState<string[]>(() => readRecents(userId));

    const sections = useMemo(
        () => groupItems(rankItems(items, query, recents), query, recents),
        [items, query, recents]
    );

    const select = (item: PaletteItem) => {
        setRecents(pushRecent(userId, item.id));
        run(item);
        closeCommandPalette();
    };

    return (
        <CommandPalette
            open={open}
            onClose={closeCommandPalette}
            query={query}
            onQueryChange={setQuery}
            sections={sections}
            onSelect={select}
        />
    );
}

/** Registers `mod+k` and mounts the palette once it opens. Mounted once, by the search view in the app layout. */
export default function CommandPaletteHost() {
    const open = useCommandPaletteOpen();

    useRegisteredShortcut({
        id: 'palette.open',
        keys: 'mod+k',
        description: 'Open the command palette',
        group: 'General',
        handler: openCommandPalette,
    });

    return open ? <PaletteBody /> : null;
}
