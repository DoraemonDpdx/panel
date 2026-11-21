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

import { skin, type PrimitiveState, type ThemeSkins } from '@pterodactyl/sdk/theme';

type ButtonState = PrimitiveState<'Button'>;

/** Tinted glass marks meaning. Grey is clear glass: the default control. */
const tints: Record<ButtonState['color'], string> = {
    primary: 'lq-primary',
    green: 'lq-primary',
    red: 'lq-danger',
    orange: 'lq-caution',
    grey: 'text-foreground',
};

/** A secondary button is always clear glass; only its text carries the colour. */
const quiet: Record<ButtonState['color'], string> = {
    primary: 'text-foreground',
    green: 'text-success',
    red: 'text-destructive',
    orange: 'text-caution',
    grey: 'text-muted-foreground hover:not-disabled:text-foreground',
};

/** Heights follow DESIGN.md 3.4, one step denser for an app: 46 hero, 40 default, 32 inline. */
const sizes: Record<ButtonState['size'], string> = {
    xsmall: 'h-8 px-3.5 text-xs',
    small: 'h-10 px-[18px] text-sm',
    large: 'h-[46px] px-[22px] text-[15px]',
    xlarge: 'h-[46px] w-full px-[22px] text-[15px]',
};

/**
 * Every button is a Liquid Glass capsule: rim, pointer glow, press and spring come from .lq and .lq-touch in theme.css.
 * `spinner` and `label` keep classic's recipes.
 */
export const button = skin('Button', {
    root: ({ color, size, secondary }) =>
        [
            'lq lq-touch inline-flex select-none items-center justify-center whitespace-nowrap rounded-full font-medium',
            'disabled:opacity-50',
            sizes[size],
            secondary ? quiet[color] : tints[color],
        ].join(' '),
});

/**
 * `root` is added to the Button NewButton renders, so the glass, size and tint come from the Button skin above; this
 * only sets layout and undoes any uppercase. `content` wraps the icon and the label.
 */
export const newButton = skin('NewButton', {
    root: 'inline-flex shrink-0 items-center justify-center gap-2 normal-case tracking-normal',
    content: 'inline-flex items-center gap-2',
    icon: 'size-4',
});

export const buttonSkins = { Button: button, NewButton: newButton } satisfies ThemeSkins;

/* ― Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse ― */
