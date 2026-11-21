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

import { skin, type ThemeSkins, type UiTone } from '@pterodactyl/sdk/theme';

const fading = { fetching: { true: 'opacity-60' } };

/**
 * A table is a material container; its head is a quiet darker band, its rows are plain fills with an instant hover
 * (no backdrop-filter per row, no zebra), and a refetch dims the body instead of blanking it.
 */
export const table = skin('Table', {
    root: '@container mat overflow-hidden rounded-2xl',
    empty: { base: 'flex transition-opacity duration-100', variants: fading },
    scroller: 'overflow-x-auto scrollbar-thin scrollbar-thumb-(--scrollbar-thumb)',
    table: 'w-full border-collapse text-left text-sm',
    head: 'border-b border-border bg-black/15',
    headerRow: '',
    headerCell: 'h-10 whitespace-nowrap px-4 text-xs font-medium tracking-wide text-muted-foreground',
    body: { base: 'divide-y divide-border transition-opacity duration-100', variants: fading },
    row: 'transition-colors duration-100 hover:bg-white/6 motion-reduce:transition-none',
    cell: 'px-4 py-3 align-middle text-foreground',
});

/**
 * `page` is added to each page Button, already a glass capsule. The current page is the one Button the primitive
 * renders as primary (green), but green means "go" and "online" only, so it is retinted lavender here (dark text,
 * which the tinted-glass class already sets) and underlined, so the current page is marked by more than colour.
 */
export const pagination = skin('Pagination', {
    root: 'mt-4 flex justify-center',
    page: {
        base: 'size-10 p-0 not-last-of-type:mr-1.5',
        variants: {
            current: {
                true: 'font-semibold underline decoration-2 underline-offset-4 [--lg-drop:0_14px_40px_-14px_rgb(184_184_255/0.5)] [--lg-tint:rgb(184_184_255/0.88)] hover:not-disabled:[--lg-tint:rgb(184_184_255/0.98)]',
            },
        },
    },
});

export const code = skin('Code', {
    root: {
        base: 'inline-block rounded-lg px-1.5 py-0.5 font-mono text-[0.92em] text-foreground ring-1 ring-inset ring-white/8',
        variants: { dark: { true: 'bg-white/8', false: 'bg-sunken' } },
    },
});

/** The toast is a floating material layer, with a glyph (kit.css) so copied and failed differ by more than colour. */
export const copyOnClick = skin('CopyOnClick', {
    root: 'fixed bottom-0 right-0 z-50 m-4',
    status: {
        base: 'mat mat-float rounded-2xl px-4 py-3 text-sm text-foreground',
        variants: { status: { copied: '', failed: 'text-destructive' } },
    },
    message: '',
    target: 'cursor-pointer',
});

export const avatar = skin('Avatar', { root: 'shrink-0 rounded-full ring-1 ring-white/15' });

/** Icon box and mobile bar by tone. Soft fills with a tinted glyph: green appears only for success. */
const tileFill = {
    neutral: 'bg-white/8 text-foreground',
    success: 'bg-success/15 text-success',
    warning: 'bg-warning/15 text-warning',
    danger: 'bg-destructive/15 text-destructive',
    info: 'bg-ast-lav/15 text-ast-lav',
    accent: 'bg-ast-blue/25 text-[#8ea6ff]',
} satisfies Record<UiTone, string>;

const bar = {
    neutral: 'bg-white/30',
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-destructive',
    info: 'bg-ast-lav',
    accent: 'bg-ast-blue',
} satisfies Record<UiTone, string>;

const inlineInk = {
    neutral: 'text-muted-foreground',
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-destructive',
    info: 'text-ast-lav',
    accent: 'text-[#8ea6ff]',
} satisfies Record<UiTone, string>;

/**
 * Usage reads against a limit (PANEL_DESIGN 7): `limit` is body-size muted text beside the value, and the tone bar
 * stays visible at every width. A tile is a material container; an inline stat is bare text. Values use tabular figures so live numbers do not jitter. */
export const stat = skin('Stat', {
    root: {
        variants: {
            variant: {
                tile: 'mat relative flex items-center rounded-2xl px-3 py-2 md:p-3 lg:p-4',
                inline: 'flex flex-wrap justify-center',
            },
        },
    },
    indicator: ({ variant, tone }) =>
        variant === 'tile' ? `absolute inset-y-3 left-0 w-1 rounded-r-full ${bar[tone]}` : 'hidden',
    icon: ({ variant, tone }) =>
        variant === 'tile'
            ? `hidden size-11 shrink-0 items-center justify-center rounded-xl sm:mr-4 sm:flex ${tileFill[tone]}`
            : 'flex',
    glyph: ({ variant, tone }) => (variant === 'tile' ? 'm-auto size-5' : `size-[1em] shrink-0 ${inlineInk[tone]}`),
    body: {
        variants: {
            variant: {
                tile: 'flex w-full flex-wrap content-center items-baseline overflow-hidden',
                inline: 'contents',
            },
        },
    },
    label: {
        variants: {
            variant: {
                tile: 'basis-full font-sans text-xs font-medium leading-tight text-muted-foreground md:text-sm',
                inline: 'sr-only',
            },
        },
    },
    value: ({ variant, tone, unavailable }) =>
        variant === 'tile'
            ? `h-7 min-w-0 truncate text-lg font-semibold leading-7 tabular-nums md:text-xl ${unavailable ? 'text-muted-foreground' : 'text-foreground'}`
            : `ml-2 text-sm tabular-nums ${unavailable ? 'text-muted-foreground' : inlineInk[tone]}`,
    limit: {
        variants: {
            variant: {
                tile: 'ml-1.5 shrink-0 select-none text-sm tabular-nums text-muted-foreground',
                inline: 'mt-1 basis-full text-center text-sm tabular-nums text-muted-foreground',
            },
        },
    },
});

export const chartCard = skin('ChartCard', {
    root: 'mat group relative rounded-3xl pt-2',
    header: 'flex items-center justify-between px-5 py-3',
    title: 'font-sans text-sm font-semibold text-foreground',
    legend: 'flex items-center text-sm text-muted-foreground',
    body: 'z-10 ml-2',
});

export const dataSkins = {
    Table: table,
    Pagination: pagination,
    Code: code,
    CopyOnClick: copyOnClick,
    Avatar: avatar,
    Stat: stat,
    ChartCard: chartCard,
} satisfies ThemeSkins;

/* ― Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse ― */
