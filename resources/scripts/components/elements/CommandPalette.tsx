import { useEffect, useId, useRef, useState } from 'react';
import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { Search } from 'lucide-react';
import { moveIndex, type PaletteItem, type PaletteSection } from '@/components/elements/commandPalette/search';
import KeyboardShortcut from '@/components/elements/KeyboardShortcut';
import { replaceable, useSkin } from '@/themes/skins';

const optionIdFor = (baseId: string, index: number) => `${baseId}-option-${index}`;

export interface CommandPaletteProps {
    open: boolean;
    onClose: () => void;
    query: string;
    onQueryChange: (query: string) => void;
    /** Grouped results; the arrow keys walk them in order. */
    sections: readonly PaletteSection[];
    onSelect: (item: PaletteItem) => void;
}

/**
 * The palette: a glass frame (the skin decides) around a plain-fill results list. It opens without animating.
 * Focus is trapped in the dialog and returns to what opened it; Esc closes it.
 */
function CoreCommandPalette({ open, onClose, query, onQueryChange, sections, onSelect }: CommandPaletteProps) {
    const flat = sections.flatMap((section) => section.items);
    const [active, setActive] = useState(0);
    const listRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const baseId = useId();
    const ui = useSkin('CommandPalette', { empty: flat.length === 0 });
    const current = flat.length === 0 ? -1 : Math.min(active, flat.length - 1);

    useEffect(() => setActive(0), [query, open]);

    useEffect(() => {
        listRef.current
            ?.querySelector(`[id="${optionIdFor(baseId, current)}"]`)
            ?.scrollIntoView?.({ block: 'nearest' });
    }, [current, baseId]);

    const onKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setActive(moveIndex(current, event.key === 'ArrowDown' ? 1 : -1, flat.length));
        } else if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            setActive(event.key === 'Home' ? 0 : Math.max(flat.length - 1, 0));
        } else if (event.key === 'Enter' && flat[current]) {
            event.preventDefault();
            onSelect(flat[current]);
        }
    };

    let index = -1;

    return (
        <BaseDialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
            <BaseDialog.Portal>
                <BaseDialog.Backdrop {...ui('backdrop')} />
                <div {...ui('viewport')}>
                    <BaseDialog.Popup {...ui('root')} initialFocus={inputRef} aria-label='Command palette'>
                        <BaseDialog.Title className='sr-only'>Command palette</BaseDialog.Title>
                        <div {...ui('search')}>
                            <Search {...ui('searchIcon')} aria-hidden />
                            <input
                                ref={inputRef}
                                {...ui('input')}
                                role='combobox'
                                aria-expanded
                                aria-controls={`${baseId}-list`}
                                aria-activedescendant={current >= 0 ? optionIdFor(baseId, current) : undefined}
                                aria-label='Search servers, pages and actions'
                                placeholder='Search servers, pages and actions'
                                autoComplete='off'
                                spellCheck={false}
                                value={query}
                                onChange={(event) => onQueryChange(event.target.value)}
                                onKeyDown={onKeyDown}
                            />
                        </div>
                        <div ref={listRef} id={`${baseId}-list`} role='listbox' aria-label='Results' {...ui('list')}>
                            {flat.length === 0 && <p {...ui('empty')}>Nothing matches “{query.trim()}”.</p>}
                            {sections.map((section) => (
                                <div key={section.heading} role='group' aria-label={section.heading} {...ui('group')}>
                                    <p {...ui('heading')} aria-hidden>
                                        {section.heading}
                                    </p>
                                    {section.items.map((item) => {
                                        index += 1;
                                        const position = index;

                                        return (
                                            <div
                                                key={item.id}
                                                id={optionIdFor(baseId, position)}
                                                role='option'
                                                aria-selected={position === current}
                                                {...ui('item')}
                                                onMouseMove={() => position !== current && setActive(position)}
                                                onClick={() => onSelect(item)}
                                            >
                                                <span {...ui('itemLabel')}>{item.label}</span>
                                                {item.hint && <span {...ui('itemHint')}>{item.hint}</span>}
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                        <div {...ui('footer')} aria-hidden>
                            <span {...ui('footerHint')}>
                                <KeyboardShortcut keys='arrowup' />
                                <KeyboardShortcut keys='arrowdown' /> navigate
                            </span>
                            <span {...ui('footerHint')}>
                                <KeyboardShortcut keys='enter' /> select
                            </span>
                            <span {...ui('footerHint')}>
                                <KeyboardShortcut keys='escape' /> close
                            </span>
                        </div>
                    </BaseDialog.Popup>
                </div>
            </BaseDialog.Portal>
        </BaseDialog.Root>
    );
}

const CommandPalette = replaceable('CommandPalette', CoreCommandPalette);

export default CommandPalette;
