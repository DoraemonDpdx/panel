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

import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, expect, test } from 'vitest';
import { Button, Card } from '@pterodactyl/sdk';
import { preloadTheme, renderView, renderWithTheme, type RenderedView } from '@pterodactyl/sdk/testing';
import theme from './theme';

const themes = [theme];

let rendered: RenderedView | undefined;

beforeAll(() => preloadTheme(themes));
afterEach(() => rendered?.unmount());

test('buttons are liquid glass capsules that respond to touch', () => {
    rendered = renderWithTheme(<Button>Save</Button>, { themes });
    const cls = rendered.container.querySelector('button')?.className ?? '';

    expect(cls).toContain('lq');
    expect(cls).toContain('lq-touch');
    expect(cls).toContain('rounded-full');
    expect(cls).toContain('lq-primary');
});

test('a danger button is tinted, a secondary one stays clear', () => {
    rendered = renderWithTheme(
        <>
            <Button.Danger>Delete</Button.Danger>
            <Button.Text isSecondary>Cancel</Button.Text>
        </>,
        { themes }
    );
    const [danger, cancel] = [...rendered.container.querySelectorAll('button')].map((b) => b.className);

    expect(danger).toContain('lq-danger');
    expect(cancel).not.toMatch(/lq-(primary|danger|caution)/);
});

test('cards are material, not liquid glass', () => {
    rendered = renderWithTheme(<Card title='Details'>Body</Card>, { themes });
    const cls = rendered.container.querySelector('[data-ui="card"]')?.className ?? '';

    expect(cls).toContain('mat');
    expect(cls).not.toMatch(/\blq\b/);
});

test('the classic app layout still renders under the theme', () => {
    rendered = renderView('layout.app', { themes, fixture: 'user' });

    expect(rendered.container.querySelector('main')).not.toBeNull();
});

test('the built stylesheet carries both tiers and every accessibility fallback', () => {
    const css = readFileSync('dist/theme.css', 'utf8');

    for (const needle of ['.lq', '.mat', 'prefers-reduced-transparency', 'prefers-contrast', 'prefers-reduced-motion']) {
        expect(css).toContain(needle);
    }
});

/* ― Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse ― */
