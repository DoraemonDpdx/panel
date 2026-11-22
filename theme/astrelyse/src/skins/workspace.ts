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

/*
 * Workspace primitives (plan section 7). Density is a token: --ast-pad-y / --ast-gap come from src/styles/kit.css and
 * change with the admin's `density` setting, so these recipes never branch on it. Nothing here animates by itself;
 * transitions are 100-120ms colour changes, dropped under motion-reduce.
 */

/**
 * A flat dot. kit.css gives offline a hollow ring and suspended a rounded square, so the five states differ by kind as
 * well as colour; a transition shows the panel's Spinner instead of the dot.
 */
export const statusDot = skin('StatusDot', {
    root: 'inline-flex items-center gap-2 align-middle text-sm text-foreground',
    dot: {
        base: 'block size-2.5 shrink-0 rounded-full',
        variants: {
            status: {
                running: 'bg-success',
                starting: 'bg-warning',
                stopping: 'bg-warning',
                offline: 'bg-ast-ink-3',
                suspended: 'bg-destructive',
            },
        },
    },
    label: 'leading-none',
});

/** A material layer that floats over the page, flush with its edge. Slide is 100ms and dropped under reduced motion. */
export const drawer = skin('Drawer', {
    backdrop: [
        'fixed inset-0 z-40 bg-black/55 backdrop-blur-[3px] transition-opacity duration-100 ease-out',
        'data-starting-style:opacity-0 data-ending-style:opacity-0 motion-reduce:transition-none',
    ].join(' '),
    viewport: 'pointer-events-none fixed inset-0 z-50 overflow-hidden',
    root: {
        base: [
            'mat mat-float pointer-events-auto absolute inset-y-0 flex max-w-[calc(100vw-1rem)] flex-col overflow-hidden text-popover-foreground',
            '[--lg-tint:rgb(10_12_26/0.88)] outline-hidden transition-transform duration-100 ease-out motion-reduce:transition-none',
        ].join(' '),
        variants: {
            side: {
                right: 'right-2 rounded-3xl data-starting-style:translate-x-[110%] data-ending-style:translate-x-[110%]',
                left: 'left-2 rounded-3xl data-starting-style:-translate-x-[110%] data-ending-style:-translate-x-[110%]',
            },
            size: { sm: 'w-80', md: 'w-[28rem]', lg: 'w-[40rem]' },
        },
    },
    header: 'flex items-start justify-between gap-4 border-b border-border px-6 py-4',
    heading: 'min-w-0',
    title: 'font-header text-xl font-normal tracking-tight text-foreground',
    description: 'mt-1 text-sm leading-relaxed text-muted-foreground',
    closeButton: 'group size-8 shrink-0 p-0 inline-flex items-center justify-center',
    closeIcon: 'size-4 text-muted-foreground transition-colors duration-100 group-hover:text-foreground',
    body: 'min-h-0 flex-1 overflow-y-auto px-6 py-5',
    footer: 'flex items-center justify-end gap-3 border-t border-border bg-black/15 px-6 py-4',
});

/** A capsule row on a plain fill; the selected tab is a lavender-edged fill with a heavier label and an underline bar (kit.css). */
export const tabs = skin('Tabs', {
    root: { base: 'flex', variants: { orientation: { horizontal: 'flex-col', vertical: 'flex-row gap-4' } } },
    list: {
        base: 'fill flex gap-1 rounded-full p-1',
        variants: {
            orientation: { horizontal: 'w-fit max-w-full overflow-x-auto', vertical: 'flex-col rounded-3xl' },
        },
    },
    tab: [
        'inline-flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-(--ast-pad-y) text-sm font-medium text-muted-foreground outline-hidden',
        'transition-colors duration-100 motion-reduce:transition-none hover:bg-white/8 hover:text-foreground',
        'data-selected:bg-white/12 data-selected:font-semibold data-selected:text-foreground',
        'data-disabled:cursor-not-allowed data-disabled:opacity-50 data-disabled:hover:bg-transparent',
    ].join(' '),
    panel: 'min-w-0 flex-1 pt-5 outline-hidden',
});

export const breadcrumb = skin('Breadcrumb', {
    root: 'text-sm',
    list: 'flex flex-wrap items-center gap-1.5 text-muted-foreground',
    item: 'inline-flex items-center gap-1.5',
    link: 'rounded-md px-1 underline-offset-4 transition-colors duration-100 hover:text-foreground hover:underline motion-reduce:transition-none',
    current: 'px-1 font-medium text-foreground',
    separator: 'select-none text-ast-ink-3',
});

/** The status is the marker's fill, its check and the label weight, plus text for assistive technology. */
export const stepper = skin('Stepper', {
    root: '',
    list: 'flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-6',
    item: 'min-w-0 sm:flex-1',
    step: {
        base: 'flex w-full items-start gap-3 rounded-2xl p-2 text-left outline-hidden transition-colors duration-100 motion-reduce:transition-none',
        variants: { status: { upcoming: 'text-muted-foreground' } },
        compoundVariants: [{ status: ['complete', 'current'], class: 'text-foreground' }],
    },
    marker: {
        base: 'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ring-1 ring-inset',
        variants: {
            status: {
                complete: 'bg-success text-success-foreground ring-success',
                current: 'bg-ast-lav text-[#0a0c14] ring-ast-lav',
                upcoming: 'bg-white/6 text-muted-foreground ring-white/20',
            },
        },
    },
    check: 'size-4',
    text: 'flex min-w-0 flex-col pt-0.5',
    label: {
        base: 'text-sm leading-5',
        variants: { status: { current: 'font-semibold', complete: 'font-medium', upcoming: 'font-normal' } },
    },
    description: 'text-xs text-muted-foreground',
});

/** A plain fill, never glass and never animated: a list can run to hundreds of rows. */
export const skeleton = skin('Skeleton', {
    root: {
        base: 'block bg-white/8',
        variants: {
            kind: {
                line: 'h-3.5 w-full rounded-full',
                block: 'h-24 w-full rounded-2xl',
                circle: 'size-10 shrink-0 rounded-full',
                row: 'flex items-center gap-4 rounded-2xl bg-transparent p-4',
                card: 'flex flex-col gap-3 rounded-3xl bg-transparent p-5',
                chart: 'h-48 w-full rounded-2xl bg-transparent',
            },
        },
    },
    body: 'flex min-w-0 flex-1 flex-col gap-2',
});

export const keyboardShortcut = skin('KeyboardShortcut', {
    root: 'inline-flex items-center gap-1 align-middle font-mono',
    key: 'inline-flex min-w-5 items-center justify-center rounded-md bg-white/10 px-1.5 text-[0.7rem] leading-5 text-muted-foreground ring-1 ring-inset ring-white/12',
});

export const shortcutsOverlay = skin('ShortcutsOverlay', {
    root: { base: 'space-y-5', variants: { empty: { true: 'text-sm text-muted-foreground' } } },
    group: '',
    heading: 'mb-2 text-xs font-medium tracking-wide text-muted-foreground',
    list: 'divide-y divide-border',
    item: 'flex items-center justify-between gap-4 py-2 text-sm',
    description: 'text-foreground',
});

export const secretField = skin('SecretField', {
    root: 'space-y-1.5',
    label: 'block text-sm font-medium text-foreground',
    control: '',
    description: 'text-xs text-muted-foreground',
});


/**
 * Liquid Glass frame (`mat mat-float`, one blur) around a plain-fill list: rows are `fill`, never glass. Nothing
 * animates on open. Reduced transparency and increased contrast are handled by `.mat` in theme.css; the selected
 * row also gets a lavender edge so it never relies on tint alone.
 */
export const commandPalette = skin('CommandPalette', {
    backdrop: 'fixed inset-0 z-40 bg-black/55 backdrop-blur-[3px]',
    viewport: 'pointer-events-none fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]',
    root: [
        'mat mat-float pointer-events-auto flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl',
        'text-popover-foreground [--lg-tint:rgb(10_12_26/0.94)] outline-hidden',
    ].join(' '),
    search: 'flex items-center gap-3 border-b border-border px-5',
    searchIcon: 'size-4 shrink-0 text-muted-foreground',
    input: 'h-14 w-full bg-transparent text-base text-foreground outline-hidden placeholder:text-muted-foreground',
    list: 'm-2 min-h-0 flex-1 overflow-y-auto rounded-2xl bg-[#0e1124] p-2 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]',
    group: 'pb-2',
    heading: 'px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground',
    item: [
        'flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm text-foreground',
        'aria-selected:bg-white/10 aria-selected:shadow-[inset_2px_0_0_var(--lav)] contrast-more:aria-selected:bg-white/20',
    ].join(' '),
    itemLabel: 'min-w-0 truncate',
    itemHint: 'shrink-0 truncate text-xs text-muted-foreground',
    empty: 'px-3 py-6 text-center text-sm text-muted-foreground',
    footer: 'flex items-center gap-4 border-t border-border px-5 py-2.5 text-xs text-muted-foreground',
    footerHint: 'inline-flex items-center gap-1',
});

export const workspaceSkins = {
    StatusDot: statusDot,
    Drawer: drawer,
    CommandPalette: commandPalette,
    Tabs: tabs,
    Breadcrumb: breadcrumb,
    Stepper: stepper,
    Skeleton: skeleton,
    KeyboardShortcut: keyboardShortcut,
    ShortcutsOverlay: shortcutsOverlay,
    SecretField: secretField,
} satisfies ThemeSkins;

/* ― Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse ― */
