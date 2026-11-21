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

/** A tinted fill, a tinted hairline and the icon the primitive draws per type: not colour alone. A plain fill, not glass. */
export const alert = skin('Alert', {
    root: {
        base: 'flex items-start rounded-2xl border px-4 py-3 text-foreground',
        variants: {
            type: {
                success: 'border-success/30 bg-success/10',
                info: 'border-ast-lav/30 bg-ast-blue/12',
                warning: 'border-warning/30 bg-warning/10',
                danger: 'border-destructive/35 bg-destructive/10',
            },
        },
    },
    icon: {
        base: 'mr-3 mt-0.5 size-5 shrink-0',
        variants: {
            type: { success: 'text-success', info: 'text-ast-lav', warning: 'text-warning', danger: 'text-destructive' },
        },
    },
    body: 'min-w-0 flex-1 text-sm leading-relaxed',
    title: 'mb-1 font-semibold text-foreground',
    content: '',
});

/** Capsule labels. Green is success only: `info` is lavender, `accent` is brand blue. */
export const badge = skin('Badge', {
    root: {
        base: 'whitespace-nowrap rounded-full text-xs font-medium',
        variants: {
            size: { sm: 'px-2 py-0.5', md: 'px-2.5 py-1' },
            variant: { soft: 'border' },
        },
        compoundVariants: [
            { variant: 'solid', tone: 'neutral', class: 'bg-white/14 text-foreground' },
            { variant: 'solid', tone: 'success', class: 'bg-success text-success-foreground' },
            { variant: 'solid', tone: 'warning', class: 'bg-warning text-warning-foreground' },
            { variant: 'solid', tone: 'danger', class: 'bg-destructive text-destructive-foreground' },
            { variant: 'solid', tone: 'info', class: 'bg-ast-lav text-[#0a0c14]' },
            { variant: 'solid', tone: 'accent', class: 'bg-ast-blue text-white' },
            { variant: 'soft', tone: 'neutral', class: 'border-border bg-white/5 text-muted-foreground' },
            { variant: 'soft', tone: 'success', class: 'border-success/30 bg-success/10 text-success' },
            { variant: 'soft', tone: 'warning', class: 'border-warning/30 bg-warning/10 text-warning' },
            { variant: 'soft', tone: 'danger', class: 'border-destructive/30 bg-destructive/10 text-destructive' },
            { variant: 'soft', tone: 'info', class: 'border-ast-lav/30 bg-ast-lav/10 text-ast-lav' },
            { variant: 'soft', tone: 'accent', class: 'border-ast-blue/45 bg-ast-blue/15 text-[#8ea6ff]' },
        ],
    },
});

export const empty = skin('Empty', {
    root: {
        base: 'flex min-w-0 flex-1 flex-col items-center justify-center gap-6 rounded-3xl border border-dashed border-white/14 bg-white/2 p-6 text-center text-balance md:p-12',
        variants: { size: { compact: 'gap-4 md:p-8' } },
    },
    header: 'flex max-w-sm flex-col items-center gap-2 text-center',
    media: {
        base: 'mb-2 flex shrink-0 items-center justify-center [&_svg]:pointer-events-none [&_svg]:shrink-0',
        variants: {
            variant: {
                default: 'bg-transparent',
                icon: "flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/8 text-ast-lav [&_svg:not([class*='size-'])]:size-6",
            },
        },
    },
    title: 'font-header text-lg font-normal tracking-tight text-foreground',
    description:
        'text-sm/relaxed text-muted-foreground [&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-ast-lav',
    content: 'flex w-full max-w-sm min-w-0 flex-col items-center gap-4 text-sm text-balance',
});

/** Live values may change width (data), the chrome around them does not move. */
export const progressBar = skin('ProgressBar', {
    root: {
        variants: {
            variant: {
                meter: 'h-1.5 w-full overflow-hidden rounded-full bg-sunken ring-1 ring-inset ring-white/10',
                page: 'fixed h-0.5 w-full',
            },
        },
    },
    indicator: {
        variants: {
            variant: {
                meter: 'h-1.5 rounded-full transition-[width,background-color] duration-100',
                page: 'h-full shadow-progress transition-[width] duration-150 ease-out',
            },
            tone: {
                neutral: 'bg-white/60',
                success: 'bg-success',
                warning: 'bg-warning',
                danger: 'bg-destructive',
                info: 'bg-ast-lav',
                accent: 'bg-ast-blue',
            },
        },
    },
});

/** Live data, so the line redraws per sample; it never eases or fades. The tone is the stroke colour. */
export const sparkline = skin('Sparkline', {
    root: {
        base: 'block h-6 w-full overflow-visible',
        variants: {
            tone: {
                neutral: 'text-ast-ink-3',
                success: 'text-success',
                warning: 'text-warning',
                danger: 'text-destructive',
                info: 'text-ast-lav',
                accent: 'text-ast-blue',
            },
        },
    },
    area: 'fill-current opacity-12',
    line: 'stroke-current stroke-[1.5] [stroke-linejoin:round] [stroke-linecap:round]',
});

/** The one thing allowed to move on its own. A plain linear turn: it must read as "working", not as decoration. */
export const spinner = skin('Spinner', {
    root: {
        base: 'block animate-[spin_0.8s_linear_infinite] rounded-full border-white/14 border-t-foreground',
        variants: {
            blue: { true: 'border-white/14 border-t-ast-lav' },
            size: {
                small: 'size-4 border-2',
                base: 'size-8 border-[3px]',
                large: 'size-16 border-[5px]',
            },
        },
    },
    container: {
        base: 'flex items-center justify-center',
        variants: { size: { small: 'm-6', base: 'm-6', large: 'm-20' } },
    },
});

/** Dims whatever it covers and inherits its parent's corners, so it fits a card or a table alike. */
export const spinnerOverlay = skin('SpinnerOverlay', {
    root: {
        base: 'left-0 top-0 z-10 flex size-full flex-col items-center justify-center rounded-[inherit] bg-background/(--spinner-overlay-opacity)',
        variants: { fixed: { true: 'fixed z-50', false: 'absolute' } },
    },
    text: 'mt-4 text-sm text-muted-foreground',
});

export const feedbackSkins = {
    Alert: alert,
    Badge: badge,
    Empty: empty,
    ProgressBar: progressBar,
    Sparkline: sparkline,
    Spinner: spinner,
    SpinnerOverlay: spinnerOverlay,
} satisfies ThemeSkins;

/* ― Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse ― */
