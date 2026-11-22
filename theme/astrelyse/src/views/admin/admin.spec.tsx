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

import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { preloadTheme, renderView, type RenderedView } from '@pterodactyl/sdk/testing';
import theme from '../../theme';

const themes = [theme];

let rendered: RenderedView | undefined;

beforeAll(() => preloadTheme(themes));
afterEach(() => rendered?.unmount());

// renderView is strict: it throws when a layer drops a slot classic renders, so a passing render keeps every slot
// (layout.admin's panel.navigation.* slots are drawn by layout.app, which this layout leaves alone).

describe('layout.admin', () => {
    test.each(['default', 'extension'])('wraps the page in the admin area, fixture %s', (fixture) => {
        rendered = renderView('layout.admin', { themes, fixture });

        const area = rendered.container.querySelector("[data-ast-area='admin']");

        expect(area).not.toBeNull();
        expect(rendered.container.querySelectorAll("[data-ast-area='admin']")).toHaveLength(1);
        expect(area?.closest('main')).not.toBeNull();
    });

    test('draws no navigation of its own: the shell does', () => {
        rendered = renderView('layout.admin', { themes, fixture: 'default' });

        expect(rendered.container.querySelector('nav')).toBeNull();
        expect(rendered.container.querySelector('header')).toBeNull();
    });

    test('renders the page children inside the wrapper', () => {
        rendered = renderView('layout.admin', { themes, fixture: 'default' });

        const area = rendered.container.querySelector<HTMLElement>("[data-ast-area='admin']")!;
        const page = document.createElement('section');

        area.append(page);

        // The fixtures carry no page, so the wrapper is empty until one is placed; the layout adds nothing around it.
        expect(area.children).toHaveLength(1);
        expect(area.firstElementChild).toBe(page);
    });

    test('the pointer position is written onto a tile under the pointer, and nothing else', () => {
        rendered = renderView('layout.admin', { themes, fixture: 'default' });

        const area = rendered.container.querySelector<HTMLElement>("[data-ast-area='admin']")!;
        const tile = document.createElement('a');
        const plain = document.createElement('a');

        tile.className = 'rounded-sm bg-card';
        area.append(tile, plain);

        fireEvent.pointerMove(tile, { clientX: 12, clientY: 7 });
        fireEvent.pointerMove(plain, { clientX: 30, clientY: 30 });

        expect(tile.style.getPropertyValue('--px')).toBe('12px');
        expect(tile.style.getPropertyValue('--py')).toBe('7px');
        expect(plain.style.getPropertyValue('--px')).toBe('');
    });
});

/* ― Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse ― */
