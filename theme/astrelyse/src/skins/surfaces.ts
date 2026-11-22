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

/** The status bar by tone. Green only for success; `info` is lavender and `accent` brand blue. */
const barFills = {
    neutral: 'bg-white/30',
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-destructive',
    info: 'bg-ast-lav',
    accent: 'bg-ast-blue',
} satisfies Record<UiTone, string>;

/** A content container: the material tier. Colour comes from --lg-tint, never from another backdrop recipe. */
export const card = skin('Card', {
    root: {
        base: 'mat rounded-3xl text-card-foreground',
        variants: { titled: { false: 'relative p-5' }, loading: { true: 'relative' } },
    },
    header: {
        base: 'border-b border-border px-5 py-3.5',
        variants: { actions: { true: 'flex items-center justify-between gap-3' } },
    },
    title: 'font-sans text-sm font-semibold tracking-normal text-foreground',
    icon: 'mr-2 text-muted-foreground',
    actions: 'flex shrink-0 items-center gap-2',
    body: 'p-5',
});

/**
 * A row in a list. Lists run to hundreds of rows, so a row is a plain fill, not glass: no backdrop-filter per row
 * (DESIGN.md 11, cost). The hover fill is the response; it lands in 120ms.
 */
export const listRow = skin('ListRow', {
    root: {
        base: 'fill group relative flex items-center overflow-hidden rounded-2xl p-4 text-foreground no-underline',
        variants: { interactive: { true: 'fill-hover active:bg-white/12' } },
    },
    icon: 'flex w-14 items-center justify-center rounded-full bg-white/6 p-3',
    title: 'text-base font-medium wrap-break-word',
    description: 'line-clamp-2 text-sm text-muted-foreground wrap-break-word',
    // A short pill down the row's right edge. Status is also readable from the row's own text; the bar is a cue.
    status: ({ status }) =>
        `absolute right-0 z-20 m-2 h-[calc(100%-1rem)] w-1.5 rounded-full opacity-70 transition-opacity duration-100 group-hover:opacity-100 ${barFills[status ?? 'neutral']}`,
});

export const pageFooter = skin('PageFooter', {
    root: 'page-width mb-4',
    text: 'text-center text-xs text-muted-foreground',
    link: 'text-muted-foreground no-underline transition-colors duration-100 hover:text-foreground hover:underline hover:underline-offset-4',
});

export const pageHeading = skin('PageHeading', {
    title: 'font-header text-3xl font-normal tracking-tight text-foreground',
    description: 'mt-1 text-sm leading-relaxed text-muted-foreground',
    actions: 'flex shrink-0 flex-wrap items-center gap-2',
});

export const surfaceSkins = {
    Card: card,
    ListRow: listRow,
    PageFooter: pageFooter,
    PageHeading: pageHeading,
} satisfies ThemeSkins;

/* ― Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse ― */
