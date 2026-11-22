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
import { fireEvent, screen } from '@testing-library/react';
import { preloadTheme, renderView, type RenderedView } from '@pterodactyl/sdk/testing';
import theme from '../../theme';

const themes = [theme];

let rendered: RenderedView | undefined;

beforeAll(() => preloadTheme(themes));
afterEach(() => rendered?.unmount());

// renderView is strict: it throws when a layer drops a slot classic renders, so a passing render keeps every slot.

describe('layout.app', () => {
    test.each(['user', 'admin', 'logo', 'accountArea', 'serverArea', 'adminArea'])('top bar and menu, fixture %s', (fixture) => {
        rendered = renderView('layout.app', { themes, fixture });

        expect(rendered.container.querySelector('header.lq.lq-nav')).not.toBeNull();
        expect(rendered.container.querySelector('aside#sh-menu.lq')).not.toBeNull();
        expect(rendered.container.querySelector('main')).not.toBeNull();
        expect(screen.getByRole('button', { name: 'Menu' })).toBeTruthy();
    });

    test('the top bar holds nothing area-specific', () => {
        rendered = renderView('layout.app', { themes, fixture: 'serverArea' });
        const bar = rendered.container.querySelector('header')?.textContent ?? '';

        expect(bar).not.toMatch(/Console|Files|Backups|Start|Restart/);
    });

    test('the menu opens, lists the area pages and closes on Escape', () => {
        rendered = renderView('layout.app', { themes, fixture: 'serverArea' });
        const menu = rendered.container.querySelector<HTMLElement>('#sh-menu');
        const button = screen.getByRole('button', { name: 'Menu' });

        expect(menu?.hidden).toBe(true);
        fireEvent.click(button);
        expect(menu?.hidden).toBe(false);
        expect(menu?.querySelector('nav[aria-label="Server"]')).not.toBeNull();
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(menu?.hidden).toBe(true);
    });

    test('an open drawer locks page scroll and releases it on close', () => {
        rendered = renderView('layout.app', { themes, fixture: 'serverArea' });
        const wideNow = window.matchMedia?.('(min-width: 1024px)').matches;
        if (wideNow) return; // docked sidebar never locks

        fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
        expect(document.documentElement.style.overflow).toBe('hidden');
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(document.documentElement.style.overflow).not.toBe('hidden');
    });

    test('the account area lists the account pages', () => {
        rendered = renderView('layout.app', { themes, fixture: 'accountArea' });

        expect(rendered.container.querySelector('nav[aria-label="Account"]')).not.toBeNull();
    });

    test.each([
        ['nav.items.before', 'before-mark'],
        ['nav.items.after', 'after-mark'],
    ] as const)('renders %s', (slot, text) => {
        rendered = renderView('layout.app', { themes, fixture: 'user', slots: { [slot]: () => <span>{text}</span> } });

        expect(screen.getByText(text)).toBeTruthy();
    });
});

describe('layout.auth and the sign-in pages', () => {
    test.each(['default', 'logo'])('auth layout, fixture %s', (fixture) => {
        rendered = renderView('layout.auth', { themes, fixture });

        expect(rendered.container.querySelector('main')).not.toBeNull();
    });

    test.each([
        ['page.auth.login', 'default'],
        ['page.auth.login', 'invalid'],
        ['page.auth.login', 'submitting'],
        ['page.auth.password', 'default'],
        ['page.auth.password', 'invalid'],
        ['page.auth.passwordReset', 'default'],
        ['page.auth.passwordReset', 'mismatch'],
        ['page.auth.checkpoint', 'code'],
        ['page.auth.checkpoint', 'recovery'],
    ] as const)('%s (%s) is a material card with one submit', (view, fixture) => {
        rendered = renderView(view, { themes, fixture });
        const submits = rendered.container.querySelectorAll('button[type="submit"]');

        expect(rendered.container.querySelector('.mat')).not.toBeNull();
        expect(submits).toHaveLength(1);
        expect(rendered.container.querySelectorAll('input').length).toBeGreaterThan(0);
    });

    test('login keeps its form slot', () => {
        rendered = renderView('page.auth.login', {
            themes,
            fixture: 'default',
            slots: { 'auth.login.form.after': () => <span>form-after</span> },
        });

        expect(screen.getByText('form-after')).toBeTruthy();
    });
});

describe('thin area layout', () => {
    test.each(['layout.account'] as const)('%s places its page in main', (view) => {
        rendered = renderView(view, { themes, fixture: 'default' });

        expect(rendered.container.querySelector('main')).not.toBeNull();
        expect(rendered.container.querySelector('nav')).toBeNull();
    });
});

describe('dashboard', () => {
    test.each(['servers', 'empty', 'loading'])('server list, fixture %s', (fixture) => {
        rendered = renderView('dashboard.serverList', { themes, fixture });

        expect(screen.getByRole('heading', { name: 'Servers' })).toBeTruthy();
    });

    test('servers are material cards, and the row slots survive', () => {
        rendered = renderView('dashboard.serverList', {
            themes,
            fixture: 'servers',
            slots: {
                'dashboard.before': () => <span>list-before</span>,
                'dashboard.serverRow.before': () => <span>row-before</span>,
                'dashboard.serverRow.after': () => <span>row-after</span>,
            },
        });

        expect(rendered.container.querySelector('article.mat')).not.toBeNull();
        expect(screen.getByText('list-before')).toBeTruthy();
        expect(screen.getAllByText('row-before').length).toBeGreaterThan(0);
        expect(screen.getAllByText('row-after').length).toBeGreaterThan(0);
    });

    test.each(['running', 'offline', 'suspended', 'loading'])('server card, fixture %s', (fixture) => {
        rendered = renderView('dashboard.serverCard', { themes, fixture });
        const chip = rendered.container.querySelector('.sh-chip');

        expect(chip).not.toBeNull();
        // Green is for running only.
        expect(chip?.getAttribute('data-tone') === 'online').toBe(fixture === 'running');
    });

    test('a running card shows CPU, memory and disk', () => {
        rendered = renderView('dashboard.serverCard', { themes, fixture: 'running' });

        for (const label of ['CPU', 'Memory', 'Disk']) expect(screen.getByText(label)).toBeTruthy();
    });

    test('the card places its three pieces', () => {
        rendered = renderView('dashboard.serverCard', { themes, fixture: 'running' });

        // identity (name), address (mono) and metrics (grid) are each their own view, placed by the card.
        expect(rendered.container.querySelector('h3')).not.toBeNull();
        expect(rendered.container.querySelector('p.font-mono')).not.toBeNull();
        expect(rendered.container.querySelector('.sh-meter')).not.toBeNull();
    });
});

/* ― Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse ― */
