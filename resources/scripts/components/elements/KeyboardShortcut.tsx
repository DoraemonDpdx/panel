import { replaceable, useSkin } from '@/themes/skins';

export interface KeyboardShortcutProps {
    /** A combination such as `mod+k`, `shift+/` or `?`. `mod` is Cmd on macOS and Ctrl elsewhere. */
    keys: string;
    className?: string;
}

export const isMac = (): boolean => /mac|iphone|ipad/i.test(navigator.userAgent);

const SYMBOLS = new Map([
    ['mod', { mac: '⌘', other: 'Ctrl' }],
    ['ctrl', { mac: '⌃', other: 'Ctrl' }],
    ['alt', { mac: '⌥', other: 'Alt' }],
    ['shift', { mac: '⇧', other: 'Shift' }],
    ['enter', { mac: '↵', other: 'Enter' }],
    ['escape', { mac: 'Esc', other: 'Esc' }],
    ['esc', { mac: 'Esc', other: 'Esc' }],
    ['arrowup', { mac: '↑', other: '↑' }],
    ['arrowdown', { mac: '↓', other: '↓' }],
    ['arrowleft', { mac: '←', other: '←' }],
    ['arrowright', { mac: '→', other: '→' }],
]);

/** The keycap text of one key of a combination. */
export function keyLabel(key: string, mac = isMac()): string {
    const known = SYMBOLS.get(key.toLowerCase());

    if (known) {
        return mac ? known.mac : known.other;
    }

    return key.length === 1 ? key.toUpperCase() : key.charAt(0).toUpperCase() + key.slice(1);
}

/** The keys of a combination, in order: `mod+k` is `['mod', 'k']`; a lone `+` key is `+`. */
export function splitKeys(keys: string): string[] {
    return keys === '+' ? ['+'] : keys.split('+').filter(Boolean);
}

/** A keyboard shortcut drawn as keycaps, for tooltips, menus and the `?` overlay. */
function CoreKeyboardShortcut({ keys, className }: KeyboardShortcutProps) {
    const ui = useSkin('KeyboardShortcut', {});
    const parts = splitKeys(keys);

    return (
        <kbd {...ui('root', className)} aria-label={parts.map((key) => keyLabel(key, false)).join(' + ')}>
            {parts.map((key) => (
                <span key={key} {...ui('key')} aria-hidden>
                    {keyLabel(key)}
                </span>
            ))}
        </kbd>
    );
}

const KeyboardShortcut = replaceable('KeyboardShortcut', CoreKeyboardShortcut);

export default KeyboardShortcut;
