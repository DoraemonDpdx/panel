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
import { preloadTheme, renderView, type RenderedView } from '@pterodactyl/sdk/testing';
import type { ServerPortsModel } from '@pterodactyl/sdk/theme';
import theme from '../../theme';

const themes = [theme];

const done = async () => true;
const portsModel = (options: Partial<ServerPortsModel> = {}): ServerPortsModel => ({
    loading: false,
    allowed: true,
    canReassign: true,
    roles: [{ role: 'PORT', required: true, address: '203.0.113.10:25565', allocationId: 1, auto: true, status: 'free', reason: null }],
    freeAllocations: [],
    settings: { fileName: '.env', format: 'dotenv', mode: 'managed', conflictPolicy: 'warn', extra: [] },
    restartRequired: false,
    canAddRole: true,
    allocationCount: 1,
    allocationLimit: 5,
    running: false,
    variables: {},
    actions: {
        addRole: done,
        setRole: done,
        removeRole: done,
        reassign: done,
        saveSettings: done,
        regenerate: done,
        restart: done,
        preview: async () => null,
    },
    ...options,
});
let rendered: RenderedView | undefined;

beforeAll(() => preloadTheme(themes));
afterEach(() => rendered?.unmount());

// renderView is strict: it fails if this theme drops a slot that classic renders for the same fixture, so a clean
// render of every fixture is also the "slots survive" check.
const pages: Record<string, string[]> = {
    'page.server.databases': ['default', 'loading', 'error'],
    'page.server.backups': ['default', 'loading', 'error'],
    'page.server.schedules': ['default', 'loading', 'error'],
    'page.server.schedules.detail': ['default', 'loading', 'error'],
    'page.server.users': ['default', 'loading', 'error'],
    'page.server.users.create': ['default', 'loading'],
    'page.server.network': ['default', 'loading', 'error'],
    'page.server.startup': ['default', 'loading', 'error'],
    'page.server.settings': ['default'],
    'page.server.activity': ['default'],
};

describe('pages', () => {
    for (const [view, fixtures] of Object.entries(pages)) {
        for (const fixture of fixtures) {
            test(`${view} renders its ${fixture} fixture`, () => {
                rendered = renderView(view as never, { themes, fixture });

                expect(rendered.container.innerHTML.length).toBeGreaterThan(0);
            });
        }
    }

    test('a page with data gets one heading and keeps its block', () => {
        rendered = renderView('page.server.databases', { themes, fixture: 'default' });

        expect(rendered.container.querySelector('.srv-heading')).not.toBeNull();
        expect(rendered.container.querySelector('.srv-stack')).not.toBeNull();
    });

    test('loading shows a spinner and no heading; an error replaces the page', () => {
        rendered = renderView('page.server.backups', { themes, fixture: 'loading' });
        expect(rendered.container.querySelector('.srv-heading')).toBeNull();
        rendered.unmount();

        rendered = renderView('page.server.backups', { themes, fixture: 'error' });
        expect(rendered.container.textContent).toContain('Something went wrong');
        expect(rendered.container.querySelector('.srv-heading')).toBeNull();
    });

    test('settings are five separate cards, reinstall last and marked as danger', () => {
        rendered = renderView('page.server.settings', { themes, fixture: 'default' });
        const cards = [...rendered.container.querySelectorAll('[data-ui="card"][data-part="root"]')];

        expect(cards.length).toBe(5);
        expect(rendered.container.querySelector('.srv-danger')).not.toBeNull();
        expect(cards.at(-1)?.className).toContain('srv-danger');
    });

    test('the startup page places command, image and variables', () => {
        rendered = renderView('page.server.startup', { themes, fixture: 'default' });

        expect(rendered.container.querySelector('.srv-startup')).not.toBeNull();
        expect(rendered.container.querySelector('.srv-code')).not.toBeNull();
    });
});

const blocks: Record<string, string[]> = {
    'server.sftp': ['default', 'ipv6', 'denied'],
    'server.debug': ['default'],
    'server.rename': ['default', 'empty', 'denied'],
    'server.reinstall': ['default', 'skipped', 'denied'],
    'server.ports': ['default', 'restartRequired', 'readOnly', 'loading', 'full'],
    'server.startup.command': ['default'],
    'server.startup.image': ['selectable', 'single', 'custom', 'pending'],
    'server.startup.variables': ['variables', 'readOnly', 'empty'],
    'server.conflict': ['installing', 'suspended', 'maintenance', 'transferring', 'restoring'],
};

describe('blocks', () => {
    for (const [view, fixtures] of Object.entries(blocks)) {
        for (const fixture of fixtures) {
            test(`${view} renders its ${fixture} fixture`, () => {
                rendered = renderView(view as never, { themes, fixture });

                expect(rendered.container).toBeDefined();
            });
        }
    }

    test('SFTP values are mono and copyable; a denied viewer sees nothing', () => {
        rendered = renderView('server.sftp', { themes, fixture: 'default' });
        const inputs = [...rendered.container.querySelectorAll('input')];

        expect(inputs.length).toBe(2);
        expect(inputs.every((input) => input.readOnly && input.className.includes('font-mono'))).toBe(true);
        rendered.unmount();

        rendered = renderView('server.sftp', { themes, fixture: 'denied' });
        expect(rendered.container.querySelector('input')).toBeNull();
    });

    test('reinstall uses a danger button and is disabled with a reason when skipped', () => {
        rendered = renderView('server.reinstall', { themes, fixture: 'skipped' });
        const button = rendered.container.querySelector('button');

        expect(button?.className).toContain('lq-danger');
        expect(button?.disabled).toBe(true);
    });

    test('ports and environment is a card with a roles table, and read-only hides every action', () => {
        rendered = renderView('server.ports', { themes, fixture: 'default' });
        expect(rendered.container.querySelector('.srv-ports')).not.toBeNull();
        expect(rendered.container.querySelectorAll('.srv-ports-table tbody tr').length).toBeGreaterThan(0);
        expect(rendered.container.textContent).toContain('Save');
        rendered.unmount();

        rendered = renderView('server.ports', { themes, fixture: 'readOnly' });
        expect(rendered.container.textContent).toContain('settings.ports');
        expect(rendered.container.textContent).not.toContain('Save');
        expect(rendered.container.textContent).not.toContain('Add role');
        rendered.unmount();

        rendered = renderView('server.ports', { themes, fixture: 'restartRequired' });
        expect(rendered.container.textContent).toContain('Restart required');
    });

    test('Reassign automatically shows only when the model allows it', () => {
        rendered = renderView('server.ports', { themes, fixture: 'default', model: portsModel() });
        expect(rendered.container.textContent).toContain('Reassign automatically');
        rendered.unmount();

        rendered = renderView('server.ports', { themes, fixture: 'default', model: portsModel({ canReassign: false }) });
        expect(rendered.container.textContent).not.toContain('Reassign automatically');
    });

    test('a read-only variable says so and cannot be edited', () => {
        rendered = renderView('server.startup.variables', { themes, fixture: 'readOnly' });

        expect(rendered.container.textContent).toContain('Read only');
        expect(rendered.container.querySelectorAll('.srv-variable.fill').length).toBeGreaterThan(0);
    });

    test('every conflict is a calm material card with a title and a status role', () => {
        for (const fixture of blocks['server.conflict']!) {
            rendered = renderView('server.conflict', { themes, fixture });
            const card = rendered.container.querySelector('.srv-conflict');

            expect(card?.className).toMatch(/\bmat\b/);
            expect(card?.getAttribute('role')).toBe('status');
            expect(card?.querySelector('h2')?.textContent?.length).toBeGreaterThan(0);
            expect(card?.querySelector('a')).toBeNull(); // navigation lives in the app shell's menu
            expect(card?.querySelector('[class*="animate"]')).toBeNull();
            rendered.unmount();
        }
    });
});

/* ― Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse ― */
