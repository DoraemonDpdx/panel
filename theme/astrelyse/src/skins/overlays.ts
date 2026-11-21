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
 * Overlays are floating material layers (`mat mat-float`). Enter and exit are an opacity and a small scale in 100ms,
 * removed under reduced motion; nothing blocks the pointer. Classic's z-index and positioning classes are carried over
 * on every part, because a recipe replaces the one below it whole.
 */
export const dialog = skin('Dialog', {
    // One blur on one element: the page behind a dialog is dimmed and lightly frosted. kit.css drops the blur under
    // prefers-reduced-transparency.
    backdrop: [
        'fixed inset-0 z-40 bg-black/55 backdrop-blur-[3px] transition-opacity duration-100 ease-out',
        'data-starting-style:opacity-0 data-ending-style:opacity-0 motion-reduce:transition-none',
    ].join(' '),
    viewport: 'fixed inset-0 z-50 overflow-y-auto',
    container: 'flex min-h-full items-center justify-center p-4 text-center',
    root: [
        'mat mat-float relative mx-auto flex w-full max-w-xl flex-col overflow-hidden rounded-3xl text-left text-popover-foreground',
        'max-h-[calc(100dvh-2rem)] [--lg-tint:rgb(10_12_26/0.84)]',
        'transition-[opacity,scale] duration-100 ease-out motion-reduce:transition-none',
        'data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0',
    ].join(' '),
    body: 'flex min-h-0 flex-1 overflow-y-auto p-6 pb-0',
    content: 'min-w-0 flex-1',
    header: 'flex items-center',
    heading: '',
    title: {
        base: 'pr-4 font-header text-xl font-normal tracking-tight text-foreground',
        variants: { described: { true: 'mb-2', false: 'mb-5' } },
    },
    description: 'mb-5 text-sm leading-relaxed text-muted-foreground',
    spacer: 'invisible h-6',
    // Footer buttons are right-aligned, with a hairline above so they read as the dialog's action row.
    footer: 'flex items-center justify-end gap-3 border-t border-border bg-black/15 px-6 py-4',
    close: 'absolute right-0 top-0 m-4',
    closeButton: 'group size-8 p-0 inline-flex items-center justify-center',
    closeIcon: 'size-4 text-muted-foreground transition-colors duration-100 group-hover:text-foreground',
    icon: {
        base: 'mr-4 flex size-10 shrink-0 items-center justify-center rounded-full ring-1 ring-inset',
        variants: {
            type: {
                danger: 'bg-destructive/15 text-destructive ring-destructive/35',
                warning: 'bg-warning/15 text-warning ring-warning/35',
                success: 'bg-success/15 text-success ring-success/35',
                info: 'bg-ast-lav/12 text-ast-lav ring-ast-lav/35',
            },
        },
    },
    iconGlyph: 'size-5',
});

/** Small and near-solid. Classic's arrow becomes nothing: a tooltip near its target needs no pointer. */
export const tooltip = skin('Tooltip', {
    root: 'pointer-events-none z-9999 max-w-[24rem] rounded-xl bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md',
    arrow: 'hidden',
});

/** z-9999 on the positioner and the transform origin on the root are classic's, kept. */
export const dropdownMenu = skin('DropdownMenu', {
    trigger: '',
    positioner: 'z-9999 outline-hidden',
    root: [
        'mat mat-float min-w-56 rounded-2xl p-1.5 text-sm text-popover-foreground outline-hidden',
        'origin-(--transform-origin) transition-[opacity,scale] duration-100 ease-out motion-reduce:transition-none',
        'data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0',
    ].join(' '),
});

/**
 * Items are plain fills with an instant highlight. A checked item gets a lavender edge and a heavier label, so the
 * state survives without colour; a danger item is red text and a red-tinted highlight.
 */
export const dropdownMenuItem = skin('DropdownMenuItem', {
    root: {
        base: [
            'group flex w-full cursor-pointer select-none gap-3 rounded-xl px-2.5 py-2 text-foreground outline-hidden',
            'transition-colors duration-100 motion-reduce:transition-none',
            'data-highlighted:bg-white/10 data-highlighted:text-foreground',
        ].join(' '),
        variants: {
            described: { true: 'items-start', false: 'items-center' },
            danger: { true: 'text-destructive data-highlighted:bg-destructive/12 data-highlighted:text-destructive' },
            checked: { true: 'bg-white/6 font-medium shadow-[inset_2px_0_0_var(--lav)]' },
        },
    },
    icon: {
        base: [
            'flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/6 text-muted-foreground',
            'transition-colors duration-100 group-data-highlighted:bg-white/10 group-data-highlighted:text-foreground',
        ].join(' '),
        variants: {
            described: { true: 'mt-0.5' },
            danger: {
                true: 'bg-destructive/10 text-destructive group-data-highlighted:bg-destructive/15 group-data-highlighted:text-destructive',
            },
        },
    },
    glyph: 'size-4',
    text: 'flex min-w-0 flex-1 flex-col',
    label: 'truncate text-sm font-medium leading-5',
    description: {
        base: 'mt-0.5 text-xs leading-4 text-muted-foreground',
        variants: { danger: { true: 'text-destructive/80' } },
    },
});

export const overlaySkins = {
    Dialog: dialog,
    Tooltip: tooltip,
    DropdownMenu: dropdownMenu,
    DropdownMenuItem: dropdownMenuItem,
} satisfies ThemeSkins;

/* ― Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse ― */
