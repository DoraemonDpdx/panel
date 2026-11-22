/*
 * ==========================================================================
 *  ____  ____  ____  __  __
 * |  _ \|  _ \|  _ \ \ \/ /
 * | | | | |_) | | | | \  /
 * | |_| |  __/| |_| | /  \
 * |____/|_|   |____/ /_/\_\
 *
 * BUILT BY  DPDX DEVELOPMENT  ·  BENGALURU, INDIA  ·  dpdx.in
 * BUILT FOR ASTRELYSE
 * ==========================================================================
 *
 * PROPRIETARY & CONFIDENTIAL. This file belongs to DPDX. A customer who receives
 * it inside a site, panel theme or bot built and shipped by DPDX may run it as
 * delivered, but does not own it, and no right to copy, modify, resell or reuse
 * it elsewhere is granted without prior written authorisation from DPDX.
 */

import { skin, type ThemeSkins } from '@pterodactyl/sdk/theme';

/**
 * Inputs are filled, never clear glass (PANEL_DESIGN 1.4): dense text needs a near-solid ground. The shape is a
 * capsule for one line and rounded-2xl for many. Focus is a lavender ring that lands in 100ms with a brighter hairline,
 * and an error is a red hairline plus a ring plus an icon (kit.css), so it never relies on colour alone.
 */
const field = [
    'w-full min-w-0 appearance-none outline-hidden',
    'border border-input-border bg-input text-sm text-foreground placeholder:text-muted-foreground',
    'transition-[background-color,border-color,box-shadow] duration-100 ease-out motion-reduce:transition-none',
    'hover:not-disabled:border-ast-lav/35',
    'focus:border-ast-lav focus:bg-white/8 focus:ring-[3px] focus:ring-ast-lav/35',
    'disabled:cursor-default disabled:opacity-60 read-only:cursor-text read-only:bg-white/3',
].join(' ');

const fieldVariants = {
    light: { true: 'bg-sunken text-foreground focus:bg-sunken' },
    error: {
        true: 'border-destructive text-foreground ring-1 ring-destructive/70 hover:not-disabled:border-destructive focus:border-destructive focus:ring-[3px] focus:ring-destructive/45',
    },
};

const line = { base: `${field} h-10 rounded-full px-4`, variants: fieldVariants };
const block = { base: `${field} min-h-24 resize-y rounded-2xl px-4 py-3 leading-relaxed`, variants: fieldVariants };

export const input = skin('Input', { root: line });

export const textArea = skin('TextArea', { root: block });

export const numberInput = skin('NumberInput', { root: '', input: line });

export const fileInput = skin('FileInput', {
    root: [
        'block w-full min-w-0 rounded-full border border-input-border bg-input p-1.5 text-sm text-foreground',
        'file:mr-3 file:rounded-full file:border-0 file:bg-white/10 file:px-4 file:py-1.5 file:text-sm file:font-medium file:text-foreground',
        'enabled:cursor-pointer enabled:file:cursor-pointer enabled:hover:file:bg-white/16',
        'transition-[border-color] duration-100 enabled:hover:border-ast-lav/35 motion-reduce:transition-none',
        'focus-visible:border-ast-lav focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ast-lav/35',
        'disabled:cursor-default disabled:opacity-60',
    ].join(' '),
});

/**
 * The trigger row is a filled field like Input. The popup floats over arbitrary content, so it is a floating material
 * layer (`mat mat-float`); its items are plain fills with an instant highlight, and a selected item carries a check as
 * well as a tint. z-99999 on the positioner and the anchor sizing on the popup are classic's, kept.
 */
export const select = skin('Select', {
    root: {
        base: [
            'relative flex w-full items-center rounded-full border border-input-border bg-input text-sm text-foreground',
            'transition-[background-color,border-color,box-shadow] duration-100 ease-out motion-reduce:transition-none',
            'hover:border-ast-lav/35 data-popup-open:border-ast-lav/50',
            'focus-within:border-ast-lav focus-within:bg-white/8 focus-within:ring-[3px] focus-within:ring-ast-lav/35',
            'data-disabled:cursor-default data-disabled:opacity-60',
        ].join(' '),
        variants: {
            multiple: { true: 'rounded-2xl' },
            error: {
                true: 'border-destructive ring-1 ring-destructive/70 hover:border-destructive focus-within:border-destructive focus-within:ring-[3px] focus-within:ring-destructive/45',
            },
        },
    },
    input: {
        base: [
            'w-full min-w-0 appearance-none border-0 bg-transparent px-4 py-2.5 pr-10 text-sm text-foreground outline-hidden',
            'placeholder:text-muted-foreground focus:ring-0 focus:outline-hidden disabled:cursor-default',
        ].join(' '),
        compoundVariants: [
            { multiple: true, selected: true, class: 'pl-0' },
            { richLabel: true, class: 'absolute inset-0 h-full' },
            { richLabel: true, searching: false, class: 'text-transparent' },
        ],
    },
    trigger:
        'absolute right-0 top-0 flex h-full w-10 items-center justify-center border-0 bg-transparent p-0 text-muted-foreground [&_svg]:size-4 [&_svg]:shrink-0',
    positioner: 'z-99999 min-w-(--anchor-width) outline-none',
    popup: [
        'mat mat-float rounded-2xl py-1.5 text-sm text-popover-foreground',
        'w-(--anchor-width) max-w-(--available-width) max-h-[min(18rem,var(--available-height))]',
    ].join(' '),
    list: 'max-h-72 overflow-y-auto overscroll-contain px-1.5 outline-none',
    item: [
        'flex cursor-pointer select-none items-center justify-between gap-3 rounded-xl px-3 py-2 outline-hidden',
        'transition-colors duration-100 motion-reduce:transition-none',
        'data-highlighted:bg-white/10 data-highlighted:text-foreground data-selected:font-medium data-selected:text-ast-lav',
        'data-disabled:cursor-default data-disabled:opacity-50',
    ].join(' '),
    itemLabel: 'min-w-0',
    indicator: 'shrink-0 text-ast-lav [&_svg]:size-4',
    empty: 'px-3 py-2 text-sm text-muted-foreground empty:p-0',
    group: '',
    groupLabel: 'px-3 pb-1 pt-2 text-xs font-medium text-muted-foreground empty:hidden',
    summary: 'pointer-events-none whitespace-nowrap px-4 py-2.5 text-sm text-foreground',
    preview: {
        base: 'pointer-events-none flex min-w-0 flex-1 items-center px-4 py-2 pr-10 text-sm',
        variants: { searching: { true: 'invisible' } },
    },
});

/** A rounded square that fills with brand blue and shows a check: shape and glyph, not only colour, say "on". */
export const checkbox = skin('Checkbox', {
    root: [
        'flex size-[18px] shrink-0 cursor-pointer items-center justify-center rounded-md text-white',
        'border border-input-border bg-input transition-colors duration-100 motion-reduce:transition-none',
        'hover:border-ast-lav/60',
        'data-checked:border-ast-lav/50 data-checked:bg-ast-blue data-indeterminate:border-ast-lav/50 data-indeterminate:bg-ast-blue',
        'data-disabled:cursor-default data-disabled:opacity-60',
        '[&_svg]:size-3.5',
    ].join(' '),
    indicator: 'flex items-center justify-center',
});

/** Same 48x24 footprint as classic. The thumb moves in 100ms; under reduced motion it jumps. */
export const switchSkin = skin('Switch', {
    root: { base: 'flex gap-4', variants: { described: { true: 'items-start', false: 'items-center' } } },
    control: [
        'group relative inline-block h-6 w-12 shrink-0 cursor-pointer select-none rounded-full border p-0',
        'border-input-border bg-input transition-colors duration-100 motion-reduce:transition-none',
        'hover:border-ast-lav/60 active:bg-white/12',
        'data-checked:border-ast-lav/50 data-checked:bg-ast-blue',
        'data-disabled:cursor-default data-disabled:opacity-60',
    ].join(' '),
    thumb: [
        'absolute left-0.5 top-1/2 block size-4.5 -translate-y-1/2 rounded-full bg-ast-lav shadow-sm',
        'transition-[left] duration-100 ease-out motion-reduce:transition-none',
        'group-data-checked:left-[calc(100%_-_1.125rem_-_0.125rem)] group-data-checked:bg-white',
    ].join(' '),
    text: 'min-w-0 flex-1',
    label: 'mb-0 cursor-pointer',
    description: 'input-help',
});

export const label = skin('Label', {
    root: {
        base: 'mb-1.5 block text-sm font-medium text-foreground',
        variants: { light: { true: 'text-muted-foreground' } },
    },
});

export const formSkins = {
    Input: input,
    TextArea: textArea,
    NumberInput: numberInput,
    FileInput: fileInput,
    Select: select,
    Checkbox: checkbox,
    Switch: switchSkin,
    Label: label,
} satisfies ThemeSkins;

/* ― Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse ― */
