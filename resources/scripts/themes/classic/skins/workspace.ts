import type { CompleteSkin } from '@/sdk/theme';

/**
 * Flat dots: green is running, and only running. A transition shows the Spinner instead of the dot, so the
 * dot never animates. Under increased contrast the ring makes the dot's edge solid.
 */
export const statusDot = {
    root: {
        base: 'inline-flex items-center gap-2 align-middle text-sm text-foreground',
        variants: { labelled: { false: 'leading-none' } },
    },
    dot: {
        base: 'block size-2.5 shrink-0 rounded-full ring-1 ring-inset ring-foreground/20 contrast-more:ring-2 contrast-more:ring-foreground',
        variants: {
            status: {
                running: 'bg-success',
                starting: 'bg-warning',
                stopping: 'bg-warning',
                offline: 'bg-muted-foreground',
                suspended: 'bg-destructive',
            },
        },
    },
    label: 'leading-none',
} satisfies CompleteSkin<'StatusDot'>;

export const drawer = {
    backdrop: [
        'fixed inset-0 z-40 bg-background/50 transition-opacity duration-150 ease-out motion-reduce:transition-none',
        'data-starting-style:opacity-0 data-ending-style:opacity-0 data-ending-style:ease-in',
    ].join(' '),
    viewport: 'pointer-events-none fixed inset-0 z-50 overflow-hidden',
    root: {
        base: [
            'pointer-events-auto absolute inset-y-0 flex max-w-full flex-col bg-card text-card-foreground shadow-xl',
            'border-border outline-hidden transition-transform duration-150 ease-out motion-reduce:transition-none',
            'data-ending-style:ease-in',
        ].join(' '),
        variants: {
            side: {
                right: 'right-0 border-l data-starting-style:translate-x-full data-ending-style:translate-x-full',
                left: 'left-0 border-r data-starting-style:-translate-x-full data-ending-style:-translate-x-full',
            },
            size: { sm: 'w-80', md: 'w-[28rem]', lg: 'w-[40rem]' },
        },
    },
    header: 'flex items-start justify-between gap-4 border-b border-border px-5 py-4',
    heading: 'min-w-0',
    title: 'font-header text-lg font-semibold text-foreground',
    description: 'mt-1 text-sm text-muted-foreground',
    closeButton: 'size-8 shrink-0 p-0 inline-flex items-center justify-center',
    closeIcon: 'size-4',
    body: 'min-h-0 flex-1 overflow-y-auto px-5 py-4',
    footer: 'flex items-center justify-end gap-3 border-t border-border px-5 py-3',
} satisfies CompleteSkin<'Drawer'>;

export const tabs = {
    root: { base: 'flex', variants: { orientation: { horizontal: 'flex-col', vertical: 'flex-row gap-4' } } },
    list: {
        base: 'flex gap-1 border-border',
        variants: { orientation: { horizontal: 'border-b overflow-x-auto', vertical: 'flex-col border-r pr-2' } },
    },
    tab: {
        base: [
            'inline-flex items-center gap-2 whitespace-nowrap rounded-sm px-3 py-2 text-sm font-medium text-muted-foreground',
            'transition-colors duration-100 motion-reduce:transition-none outline-hidden',
            'hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
            'data-selected:text-foreground border-b-2 border-transparent data-selected:border-primary',
            'data-disabled:cursor-not-allowed data-disabled:opacity-50',
            'contrast-more:data-selected:underline',
        ].join(' '),
        variants: {
            orientation: { vertical: 'justify-start border-b-0 border-r-2 data-selected:border-primary' },
        },
    },
    panel: 'min-w-0 flex-1 pt-4 outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
} satisfies CompleteSkin<'Tabs'>;

export const breadcrumb = {
    root: 'text-sm',
    list: 'flex flex-wrap items-center gap-1.5 text-muted-foreground',
    item: 'inline-flex items-center gap-1.5',
    link: 'rounded-sm underline-offset-4 transition-colors duration-100 hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none',
    current: 'font-medium text-foreground',
    separator: 'text-muted-foreground/60 select-none',
} satisfies CompleteSkin<'Breadcrumb'>;

export const stepper = {
    root: '',
    list: 'flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-6',
    item: 'min-w-0 sm:flex-1',
    step: {
        base: 'flex w-full items-start gap-3 rounded-sm text-left outline-hidden',
        variants: { status: { upcoming: 'text-muted-foreground' } },
        compoundVariants: [{ status: ['complete', 'current'], class: 'text-foreground' }],
    },
    marker: {
        base: 'flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
        variants: {
            status: {
                complete: 'border-success bg-success text-success-foreground',
                current: 'border-primary bg-primary text-primary-foreground',
                upcoming: 'border-border bg-muted text-muted-foreground',
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
} satisfies CompleteSkin<'Stepper'>;

/** A plain fill. No shimmer, no pulse: loading is shown by the kind alone. */
export const skeleton = {
    root: {
        base: 'block bg-muted',
        variants: {
            kind: {
                line: 'h-3.5 w-full rounded-sm',
                block: 'h-24 w-full rounded-sm',
                circle: 'size-10 shrink-0 rounded-full',
                row: 'flex items-center gap-4 rounded-sm bg-transparent p-4',
                card: 'flex flex-col gap-3 rounded-sm bg-transparent p-5',
                chart: 'h-48 w-full rounded-sm bg-transparent',
            },
        },
    },
    body: 'flex min-w-0 flex-1 flex-col gap-2',
} satisfies CompleteSkin<'Skeleton'>;

export const keyboardShortcut = {
    root: 'inline-flex items-center gap-1 align-middle font-mono',
    key: 'inline-flex min-w-5 items-center justify-center rounded-sm border border-border bg-muted px-1 text-xs leading-5 text-muted-foreground contrast-more:border-foreground contrast-more:text-foreground',
} satisfies CompleteSkin<'KeyboardShortcut'>;

export const shortcutsOverlay = {
    root: { base: 'space-y-5', variants: { empty: { true: 'text-sm text-muted-foreground' } } },
    group: '',
    heading: 'mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground',
    list: 'divide-y divide-border',
    item: 'flex items-center justify-between gap-4 py-2 text-sm',
    description: 'text-foreground',
} satisfies CompleteSkin<'ShortcutsOverlay'>;

export const secretField = {
    root: 'space-y-1.5',
    label: 'block text-sm font-medium text-foreground',
    control: '',
    description: {
        base: 'text-xs text-muted-foreground',
        variants: { empty: { true: 'italic' } },
    },
} satisfies CompleteSkin<'SecretField'>;

/** The palette sits on a card with a plain-fill list; nothing animates on open. */
export const commandPalette = {
    backdrop: 'fixed inset-0 z-40 bg-background/50',
    viewport: 'pointer-events-none fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]',
    root: 'pointer-events-auto flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-md border border-border bg-card text-card-foreground shadow-xl outline-hidden',
    search: 'flex items-center gap-3 border-b border-border px-4',
    searchIcon: 'size-4 shrink-0 text-muted-foreground',
    input: 'h-12 w-full bg-transparent text-base text-foreground outline-hidden placeholder:text-muted-foreground',
    list: 'min-h-0 flex-1 overflow-y-auto p-2',
    group: 'pb-2',
    heading: 'px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground',
    item: [
        'flex cursor-pointer items-center justify-between gap-3 rounded-sm px-3 py-2 text-sm text-foreground',
        'aria-selected:bg-muted aria-selected:ring-2 aria-selected:ring-ring aria-selected:ring-inset',
    ].join(' '),
    itemLabel: 'min-w-0 truncate',
    itemHint: 'shrink-0 truncate text-xs text-muted-foreground',
    empty: 'px-3 py-6 text-center text-sm text-muted-foreground',
    footer: 'flex items-center gap-4 border-t border-border px-4 py-2 text-xs text-muted-foreground',
    footerHint: 'inline-flex items-center gap-1',
} satisfies CompleteSkin<'CommandPalette'>;
