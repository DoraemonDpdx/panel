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

import { afterEach, beforeAll, expect, test } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { preloadTheme, renderView, type RenderedView } from '@pterodactyl/sdk/testing';
import theme from '../../theme';

const themes = [theme];

let rendered: RenderedView | undefined;

beforeAll(() => preloadTheme(themes));
afterEach(() => rendered?.unmount());

const html = () => rendered?.container.innerHTML ?? '';
const button = (name: RegExp | string) => screen.getByRole('button', { name }) as HTMLButtonElement;

/* ---- layout.server ---- */

test('layout.server: only the header and the page, no tabs', () => {
    rendered = renderView('layout.server', { themes, fixture: 'owner' });

    expect(screen.getByRole('heading', { level: 1 }).className).toContain('font-header');
    expect(rendered.container.querySelector('[role="status"][data-state]')).not.toBeNull();
    expect(rendered.container.querySelector('nav')).toBeNull();
    expect(html()).toContain('Restart');
});

test.each(['offline', 'installing', 'suspended', 'admin', 'subuser'] as const)('layout.server renders the %s fixture', (fixture) => {
    rendered = renderView('layout.server', { themes, fixture, strict: false });

    expect(rendered.container.querySelector('header')).not.toBeNull();
    // No power controls while the server installs or is suspended.
    if (fixture === 'installing' || fixture === 'suspended') {
        expect(html()).not.toContain('Power controls');
    }
});

/* ---- server.power ---- */

test('server.power: offline offers Start (green, primary) with a menu beside it', () => {
    rendered = renderView('server.power', {
        themes,
        fixture: 'offline',
        slots: { 'server.console.power.before': () => <i>pb</i>, 'server.console.power.after': () => <i>pa</i> },
    });

    expect(button('Start').className).toContain('lq-primary');
    expect(button(/More power actions/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Restart' })).toBeNull();
    expect(screen.getByText('pb')).toBeTruthy();
    expect(screen.getByText('pa')).toBeTruthy();
});

test('server.power: a pressed button shows its pending state at once and the rest wait', () => {
    rendered = renderView('server.power', { themes, fixture: 'offline' });
    const start = button('Start');

    expect(start.disabled).toBe(false);
    fireEvent.click(start);

    expect(rendered.container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(button('Start').disabled).toBe(true);
});

test('server.power: running offers Restart as the main action, clear glass, and Stop and Kill sit in the menu', () => {
    rendered = renderView('server.power', { themes, fixture: 'running' });

    expect(button('Restart').className).not.toMatch(/lq-(primary|danger|caution)/);
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull();
    expect(button(/More power actions/)).toBeTruthy();
});

test.each(['stopping', 'starting', 'disconnected', 'noPermission'] as const)('server.power renders the %s fixture', (fixture) => {
    rendered = renderView('server.power', { themes, fixture });

    expect(rendered.container.querySelector('.ast-power')).not.toBeNull();
});

test('server.power: nothing is offered without permission, and the unavailable are disabled', () => {
    rendered = renderView('server.power', { themes, fixture: 'noPermission' });
    const buttons = [...rendered.container.querySelectorAll('button')];

    expect(buttons.every((b) => b.disabled) || buttons.length === 0).toBe(true);
});

/* ---- page.server.console and its blocks ---- */

test('page.server.console: slots, terminal, stats and graphs survive', () => {
    rendered = renderView('page.server.console', {
        themes,
        input: { active: true },
        slots: {
            'server.console.before': () => <span>cb</span>,
            'server.console.after': () => <span>ca</span>,
        },
    });

    expect(screen.getByText('cb')).toBeTruthy();
    expect(screen.getByText('ca')).toBeTruthy();
    expect(rendered.container.querySelector('.ast-console')).not.toBeNull();
    expect(rendered.container.querySelector('.ast-stats')).not.toBeNull();
    expect(rendered.container.querySelector('.ast-graphs')).not.toBeNull();
    // The layout header has the power controls; the page does not repeat them.
    expect(rendered.container.querySelector('.ast-power')).toBeNull();
});

test.each(['installing', 'maintenance'] as const)('page.server.console shows the %s notice', (fixture) => {
    rendered = renderView('page.server.console', { themes, fixture, input: { active: true } });

    expect(rendered.container.querySelector('[role="alert"], [role="status"], [data-ui="alert"]')).not.toBeNull();
});

test.each(['running', 'connecting', 'failed', 'scrolledUp', 'readOnly'] as const)('server.terminal renders the %s fixture', (fixture) => {
    rendered = renderView('server.terminal', { themes, fixture });
    const card = rendered.container.querySelector('.ast-console');

    expect(card?.className).toContain('mat');
    expect(card?.className).not.toMatch(/\blq\b/);
    expect(rendered.container.querySelector('.ast-terminal')?.className).toContain('bg-terminal');
});

test('server.terminal: a field to type in, and a notice when commands are not allowed', () => {
    rendered = renderView('server.terminal', { themes, fixture: 'running' });
    expect(screen.getByLabelText('Console command')).toBeTruthy();
    rendered.unmount();

    rendered = renderView('server.terminal', { themes, fixture: 'readOnly' });
    expect(screen.queryByLabelText('Console command')).toBeNull();
    expect(html()).toContain('not send commands');
});

test('server.terminal: a toolbar with search, filter chips and the log switches', () => {
    rendered = renderView('server.terminal', { themes, fixture: 'running' });

    expect(screen.getByRole('toolbar', { name: 'Console tools' })).toBeTruthy();
    expect(screen.getByLabelText('Search the log')).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Filter the log' }).querySelectorAll('button').length).toBe(5);
    for (const name of [/Pause output/, /Timestamps/, /Structured view/, /Download log/, /Clear console/]) {
        expect(button(name)).toBeTruthy();
    }
});

test('server.terminal: a failed console says so and offers a retry', () => {
    rendered = renderView('server.terminal', { themes, fixture: 'failed' });

    expect(screen.getByRole('alert').textContent).toContain('could not be loaded');
    expect(button('Try again')).toBeTruthy();
});

test.each(['running', 'offline', 'starting', 'alarms', 'unlimited'] as const)('server.stats renders the %s fixture as tiles', (fixture) => {
    rendered = renderView('server.stats', { themes, fixture });

    expect(rendered.container.querySelector('.ast-stats')?.className).toContain('mat');
    expect(rendered.container.querySelectorAll('.fill').length).toBeGreaterThanOrEqual(6);
});

test('server.stats: live readings carry a sparkline of the last minute while the server runs, none offline', () => {
    rendered = renderView('server.stats', { themes, fixture: 'running' });
    expect(rendered.container.querySelectorAll('[aria-label$="last minute"]').length).toBeGreaterThan(0);
    rendered.unmount();

    rendered = renderView('server.stats', { themes, fixture: 'offline' });
    expect(rendered.container.querySelectorAll('[aria-label$="last minute"]').length).toBe(0);
});

test('server.stats: an alarm is said in words, not by colour alone', () => {
    rendered = renderView('server.stats', { themes, fixture: 'alarms' });

    expect(html()).toMatch(/High|Critical/);
});

test('server.stats: every limited stat shows its limit, an unlimited one says so', () => {
    rendered = renderView('server.stats', { themes, fixture: 'running' });
    expect(html()).toMatch(/>of \d/);
    expect(rendered.container.querySelectorAll('[role="meter"]').length).toBe(3);
    rendered.unmount();

    rendered = renderView('server.stats', { themes, fixture: 'unlimited' });
    expect(html()).toContain('Unlimited');
});

test.each(['running', 'offline'] as const)('server.graphs renders the %s fixture', (fixture) => {
    rendered = renderView('server.graphs', { themes, fixture });

    expect(rendered.container.querySelector('.ast-graphs')).not.toBeNull();
    expect(html()).toContain('Network');
});

/* ---- files ---- */

test('page.server.files: slots and the manager frame', () => {
    rendered = renderView('page.server.files', {
        themes,
        slots: { 'server.files.before': () => <span>fb</span>, 'server.files.after': () => <span>fa</span> },
    });

    expect(screen.getByText('fb')).toBeTruthy();
    expect(screen.getByText('fa')).toBeTruthy();
    expect(rendered.container.querySelector('.ast-files')).not.toBeNull();
});

test.each(['loading', 'error'] as const)('page.server.files renders the %s fixture', (fixture) => {
    rendered = renderView('page.server.files', { themes, fixture });

    expect(rendered.container.innerHTML.length).toBeGreaterThan(0);
});

test('server.files.manager: a material frame, rows are plain fills, Upload is the one primary action', () => {
    rendered = renderView('server.files.manager', {
        themes,
        fixture: 'directory',
        slots: { 'server.files.toolbar': () => <span>tb</span> },
    });
    const frame = rendered.container.querySelector('.ast-files');
    const rows = [...rendered.container.querySelectorAll('.fill-hover')];

    expect(frame?.className).toContain('mat');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => !/\b(lq|mat)\b/.test(row.className))).toBe(true);
    expect(screen.getByText('tb')).toBeTruthy();

    const primaries = [...rendered.container.querySelectorAll('button')].filter((b) => b.className.includes('lq-primary'));

    expect(primaries).toHaveLength(1);
    expect(primaries[0].textContent).toContain('Upload');
});

test.each(['selected', 'uploading', 'readOnly', 'empty', 'loading'] as const)('server.files.manager renders the %s fixture', (fixture) => {
    rendered = renderView('server.files.manager', { themes, fixture });

    expect(rendered.container.querySelector('.ast-files')).not.toBeNull();
    expect(rendered.container.querySelector('[aria-label="Path"]')).not.toBeNull();
});

test('server.files.manager: a read-only directory has no actions; an empty one says so', () => {
    rendered = renderView('server.files.manager', { themes, fixture: 'readOnly' });
    expect(screen.queryByRole('button', { name: /Upload/ })).toBeNull();
    rendered.unmount();

    rendered = renderView('server.files.manager', { themes, fixture: 'empty' });
    expect(html()).toContain('This folder is empty');
});

test('server.files.manager: the selection bar is a floating material and keeps its slot', () => {
    rendered = renderView('server.files.manager', {
        themes,
        fixture: 'selected',
        slots: { 'server.files.selectionActions': () => <span>sa</span> },
    });

    const bar = document.querySelector('.ast-selection');

    expect(bar?.className).toContain('mat-float');
    expect(bar?.textContent).toContain('selected');
    expect(screen.getByText('sa')).toBeTruthy();
});

test('server.files.manager: an upload in progress shows its status without a new row', () => {
    rendered = renderView('server.files.manager', { themes, fixture: 'uploading' });

    expect(rendered.container.querySelector('.ast-files-toolbar button svg')).not.toBeNull();
});

test.each(['file', 'directory'] as const)('server.files.details renders the %s fixture', (fixture) => {
    rendered = renderView('server.files.details', { themes, fixture });

    expect(rendered.container.textContent?.length).toBeGreaterThan(0);
});

/* ---- editor ---- */

test('page.server.files.editor: the path and the editor frame', () => {
    rendered = renderView('page.server.files.editor', { themes, fixture: 'file' });

    expect(rendered.container.querySelector('nav[aria-label="Path"]')).not.toBeNull();
    expect(rendered.container.querySelector('.ast-editor')).not.toBeNull();
});

test.each(['new', 'loading', 'error'] as const)('page.server.files.editor renders the %s fixture', (fixture) => {
    rendered = renderView('page.server.files.editor', { themes, fixture });

    expect(rendered.container.innerHTML.length).toBeGreaterThan(0);
});

test('server.files.editor: Save is the one primary action, on the editor ink', () => {
    rendered = renderView('server.files.editor', { themes, fixture: 'file' });
    const primaries = [...rendered.container.querySelectorAll('button')].filter((b) => b.className.includes('lq-primary'));

    expect(primaries).toHaveLength(1);
    expect(primaries[0].textContent).toContain('Save');
    expect(rendered.container.querySelector('.ast-editor-canvas')?.className).toContain('--editor-background');
    expect(rendered.container.querySelector('.ast-editor')?.className).toContain('mat');
});

test('server.files.editor: dirty, saving, read-only and new say so in words', () => {
    rendered = renderView('server.files.editor', { themes, fixture: 'dirty' });
    expect(html()).toContain('Unsaved changes');
    rendered.unmount();

    rendered = renderView('server.files.editor', { themes, fixture: 'saving' });
    expect(html()).toContain('Saving');
    expect(rendered.container.querySelector('.ast-editor-canvas')?.getAttribute('aria-busy')).toBe('true');
    expect(rendered.container.querySelector('button[disabled]')).not.toBeNull();
    rendered.unmount();

    rendered = renderView('server.files.editor', { themes, fixture: 'readOnly' });
    expect(html()).toContain('Read only');
    expect(screen.queryByRole('button', { name: /Save/ })).toBeNull();
    rendered.unmount();

    rendered = renderView('server.files.editor', { themes, fixture: 'new' });
    expect(screen.getByRole('button', { name: /Create file/ })).toBeTruthy();
});

test('server.files.editor: the .pteroignore note is kept', () => {
    rendered = renderView('server.files.editor', { themes, fixture: 'pteroignore' });

    expect(html()).toContain('.pteroignore');
});

/* ― Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse ― */
