/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AxiosAdapter } from 'axios';
import { useEffect } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import http from '@/api/http';
import type { InstallOperation, SoftwareState } from '@/api/server/software/types';
import { publishAreaNav } from '@/router/nav';
import { createExtensionTestHost, createTestServer, type ExtensionTestHost } from '@/sdk/testing';
import { useServerStore, type ServerStatus } from '@/state/server';
import { View } from '@/views/View';
import { useNavigation } from '@/views/navigation';

interface Body {
    type?: string;
    minecraft?: string;
    loader?: string;
    wipe?: { enabled: boolean; keep_worlds: boolean };
    mods_action?: string;
    mode?: string;
    backup?: boolean;
    provider?: string;
    project_id?: string;
    version_id?: string;
    file_id?: string;
    keep_worlds?: boolean;
    confirm?: string;
    path?: string;
}

interface Recorded {
    method: string;
    path: string;
    body: Body | undefined;
    search: string;
}

const adapter = http.defaults.adapter;
let host: ExtensionTestHost | undefined;
let requests: Recorded[];
let state: SoftwareState;
let operations: InstallOperation[];
let curseforgeKey: boolean;
let sharedLoaders = false;
let portal: HTMLElement;
let setStatus: (status: ServerStatus) => void;

const types = [
    { type: 'vanilla', label: 'Vanilla', kind: 'vanilla', icon: 'box' },
    { type: 'paper', label: 'Paper', kind: 'plugin', icon: 'file-text' },
    { type: 'fabric', label: 'Fabric', kind: 'mod', icon: 'scroll' },
    { type: 'quilt', label: 'Quilt', kind: 'mod', icon: 'blocks' },
] as const;

const baseState = (): SoftwareState => ({
    current: { type: 'fabric', minecraft: '1.21.1', loader: '0.16.9', egg_managed: true },
    types: [...types],
    operation: null,
    modpack: null,
});

const operation = (status: InstallOperation['status'], error: string | null = null): InstallOperation => ({
    id: 1,
    kind: 'software',
    status,
    summary: null,
    error,
    started_at: '2026-01-01T00:00:00Z',
    finished_at: status === 'running' ? null : '2026-01-01T00:01:00Z',
});

const catalog = {
    minecraft: [
        { id: '1.21.1', type: 'release', latest: true },
        { id: '1.20.4', type: 'release', latest: false },
    ],
    loaders: {
        '1.21.1': [
            { id: '0.16.9', stable: true },
            { id: '0.16.8', stable: true },
        ],
        '1.20.4': [{ id: '0.15.0', stable: true }],
    },
};

const builds = [
    { id: '120', stable: true },
    { id: '119', stable: false },
];

const catalogFor = (search: string) => {
    const params = new URLSearchParams(search);
    const type = params.get('type');

    if (type === 'paper') {
        return { minecraft: catalog.minecraft, loaders: params.has('minecraft') ? { '1.21.1': builds } : {} };
    }

    return sharedLoaders ? { minecraft: catalog.minecraft, loaders: { '*': catalog.loaders['1.21.1'] } } : catalog;
};

const pack = {
    project_id: 'P1',
    slug: 'pack',
    title: 'Better Pack',
    description: 'A big pack.',
    icon_url: null,
    downloads: 5000,
    author: 'someone',
    categories: ['adventure'],
    loader: 'fabric',
    minecraft: '1.21.1',
    provider: 'modrinth',
    page_url: 'https://modrinth.com/modpack/pack',
};

const worldRow = { ...pack, project_id: 'W1', title: 'Cool Map', provider: 'curseforge', loader: null };
const versionRow = (id: string, number: string) => ({
    id,
    name: number,
    version_number: number,
    version_type: 'release',
    date_published: '2026-01-01T00:00:00Z',
    loader: 'fabric',
    minecraft: '1.21.1',
    file: { size: 1000 },
});
const page = (data: unknown[]) => ({ data, meta: { total: data.length, offset: 0, limit: 20 } });

const respond = (method: string, path: string, search = '') => {
    if (path.endsWith('/mods/platform')) {
        return {
            attributes: {
                eligible: true,
                platform: 'fabric',
                providers: curseforgeKey ? ['modrinth', 'curseforge'] : ['modrinth'],
            },
        };
    }

    const found = /\/software\/operations\/1$/.exec(path) ? operations.shift() : undefined;

    if (found) {
        operations.length === 0 && operations.push(found);

        return found;
    }

    const table: [string, unknown][] = [
        ['/software/catalog', catalogFor(search)],
        ['/content/modpacks/search', page([pack])],
        ['/content/worlds/search', page([worldRow])],
        ['/versions', { data: [versionRow('v2', '2.0.0'), versionRow('v1', '1.0.0')] }],
        [
            '/content/modpacks/preview',
            {
                software: { type: 'fabric', minecraft: '1.21.1', loader: '0.16.9' },
                files: { server: 142, skipped_client: 31, unverified: 3 },
                size_bytes: 2048,
                warnings: [],
            },
        ],
    ];
    const hit = table.find(([suffix]) => path.endsWith(suffix));

    if (hit) {
        return hit[1];
    }

    if (method === 'post') {
        return operation('running');
    }

    return state;
};

beforeEach(() => {
    requests = [];
    state = baseState();
    operations = [];
    curseforgeKey = true;
    sharedLoaders = false;
    portal = document.body.appendChild(Object.assign(document.createElement('div'), { id: 'modal-portal' }));
    http.defaults.adapter = (async (config) => {
        const url = new URL(config.url!, 'https://panel.test');

        for (const [key, value] of Object.entries(
            (config.params ?? {}) as Record<string, string | number | undefined>
        )) {
            if (value !== undefined) {
                url.searchParams.set(key, String(value));
            }
        }

        const method = config.method ?? 'get';

        requests.push({
            method,
            path: url.pathname,
            search: url.search,
            body: config.data ? (JSON.parse(String(config.data)) as Body) : undefined,
        });

        return {
            config,
            headers: {},
            status: method === 'post' ? 202 : 200,
            statusText: 'OK',
            data: respond(method, url.pathname, url.search),
        };
    }) satisfies AxiosAdapter;
});

afterEach(() => {
    cleanup();
    host?.dispose();
    host = undefined;
    portal.remove();
    http.defaults.adapter = adapter;
});

/** Stands in for the server area's websocket handler, which records the power state. */
function StatusListener() {
    const setServerStatus = useServerStore((state) => state.status.setServerStatus);

    useEffect(() => {
        setStatus = (value) => setServerStatus(value);
    }, [setServerStatus]);

    return null;
}

async function renderPage(permissions?: string[], path?: string) {
    host = createExtensionTestHost({
        server: createTestServer({ identifier: 'a1b2c3d4', owner: !permissions, permissions, name: 'Survival SMP' }),
        path,
    });
    await act(async () => {
        render(
            <>
                <StatusListener />
                <View name='page.server.software' />
            </>,
            { wrapper: host!.Wrapper }
        );
    });
}

const calls = (method: string, suffix: string) =>
    requests.filter((request) => request.method === method && request.path.endsWith(suffix));

const user = () => userEvent.setup();

describe('software tab visibility', () => {
    beforeAll(() => {
        publishAreaNav('server', [
            { segment: '', label: 'Console', exact: true },
            { segment: 'software', label: 'Software', permission: 'software.read' },
        ]);
    });

    function Items() {
        return (
            <ul>
                {useNavigation('server').items.map((item) => (
                    <li key={item.id}>{item.label}</li>
                ))}
            </ul>
        );
    }

    const tabs = async (eggTags: string[], permissions = ['software.read']) => {
        host = createExtensionTestHost({
            server: createTestServer({ identifier: 'abc', permissions, owner: false, eggTags }),
            path: '/server/abc',
        });
        await act(async () => {
            render(<Items />, { wrapper: host!.Wrapper });
        });

        return screen.getAllByRole('listitem').map((entry) => entry.textContent);
    };

    it('lists Software right after Console on a Java Minecraft server', async () => {
        expect(await tabs(['minecraft'])).toEqual(['Console', 'Software']);
    });

    it('hides it on a Bedrock server', async () => {
        expect(await tabs(['minecraft', 'bedrock'])).toEqual(['Console']);
    });

    it('hides it on a server that is not a Minecraft game', async () => {
        expect(await tabs(['source'])).toEqual(['Console']);
    });

    it('hides it without software.read', async () => {
        expect(await tabs(['minecraft'], ['file.read'])).toEqual(['Console']);
    });
});

describe('header', () => {
    it('shows the running software, and a modpack when there is one', async () => {
        state.modpack = {
            provider: 'modrinth',
            project_id: 'P1',
            version_id: 'v1',
            title: 'Better Pack',
            icon_url: null,
            version_number: '1.0.0',
        };
        await renderPage();

        expect(await screen.findByText('Fabric 0.16.9 · Minecraft 1.21.1')).toBeVisible();
        expect(screen.getByText('Better Pack')).toBeVisible();
        expect(screen.getByRole('tab', { name: 'Server type' })).toBeVisible();
    });

    it('shows a failed operation with a link to the log', async () => {
        state.operation = operation('failed', 'Download failed');
        await renderPage();

        expect(await screen.findByRole('status')).toHaveTextContent('Failed');
        expect(screen.getByText('Download failed')).toBeVisible();
        expect(screen.getByRole('link', { name: 'View install log' })).toHaveAttribute(
            'href',
            expect.stringContaining('a1b2c3d4')
        );
    });
});

const choose = async (name: RegExp) => {
    fireEvent.click(await screen.findByRole('radio', { name }));
    await screen.findByLabelText('Minecraft version');
};

const confirmInstall = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Install' }));

    const dialog = await screen.findByRole('dialog');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Install' }));
};

describe('server type', () => {
    it('marks the current type', async () => {
        await renderPage();

        expect(await screen.findByText('Current')).toBeVisible();
    });

    it('installs with the recommended build and keeps everything by default', async () => {
        await renderPage();
        await choose(/Quilt/);
        await waitFor(() => expect(screen.getByRole('button', { name: 'Install' })).toBeEnabled());
        expect(screen.queryByRole('radiogroup', { name: /current/ })).not.toBeInTheDocument();
        await confirmInstall();

        await waitFor(() => expect(calls('post', '/software/install')).toHaveLength(1));
        expect(calls('post', '/software/install')[0]?.body).toEqual({
            type: 'quilt',
            minecraft: '1.21.1',
            loader: '0.16.9',
            wipe: { enabled: false, keep_worlds: true },
            mods_action: 'keep',
        });
    });

    it('sends start fresh with the worlds kept, then with them deleted', async () => {
        await renderPage();
        await choose(/Quilt/);
        await waitFor(() => expect(screen.getByRole('button', { name: 'Install' })).toBeEnabled());
        fireEvent.click(screen.getByRole('switch', { name: /Start fresh/ }));
        await confirmInstall();

        await waitFor(() => expect(calls('post', '/software/install')).toHaveLength(1));
        expect(calls('post', '/software/install')[0]?.body?.wipe).toEqual({ enabled: true, keep_worlds: true });
    });

    it('sends start fresh with the worlds deleted when Keep worlds is off', async () => {
        await renderPage();
        await choose(/Quilt/);
        await waitFor(() => expect(screen.getByRole('button', { name: 'Install' })).toBeEnabled());
        fireEvent.click(screen.getByRole('switch', { name: /Start fresh/ }));
        fireEvent.click(await screen.findByRole('switch', { name: /Keep worlds/ }));
        expect(screen.getByText(/delete everything, worlds included/)).toBeVisible();
        await confirmInstall();

        await waitFor(() => expect(calls('post', '/software/install')).toHaveLength(1));
        expect(calls('post', '/software/install')[0]?.body?.wipe).toEqual({ enabled: true, keep_worlds: false });
    });

    it('asks what to do with the mods only when the family changes', async () => {
        await renderPage();
        await choose(/Paper/);

        const group = await screen.findByRole('radiogroup', { name: 'What to do with your current mods' });

        expect(within(group).getByRole('radio', { name: /disabled folder/ })).toHaveAttribute('aria-checked', 'true');
        fireEvent.click(within(group).getByRole('radio', { name: /Delete them/ }));
        await waitFor(() => expect(screen.getByRole('button', { name: 'Install' })).toBeEnabled());
        await confirmInstall();

        await waitFor(() => expect(calls('post', '/software/install')).toHaveLength(1));
        expect(calls('post', '/software/install')[0]?.body).toMatchObject({ type: 'paper', mods_action: 'remove' });
    });

    it('sends the disabled-folder choice by default on a family change, and no loader for vanilla', async () => {
        await renderPage();
        await choose(/Vanilla/);
        await waitFor(() => expect(screen.getByRole('button', { name: 'Install' })).toBeEnabled());
        await confirmInstall();

        await waitFor(() => expect(calls('post', '/software/install')).toHaveLength(1));

        const body = calls('post', '/software/install')[0]?.body;

        expect(body).toMatchObject({ type: 'vanilla', mods_action: 'disable' });
        expect(body).not.toHaveProperty('loader');
    });

    it('uses the one shared loader list of Fabric and Quilt for every version', async () => {
        sharedLoaders = true;
        await renderPage();
        await choose(/Quilt/);
        await waitFor(() => expect(screen.getByRole('button', { name: 'Install' })).toBeEnabled());
        await confirmInstall();

        await waitFor(() => expect(calls('post', '/software/install')).toHaveLength(1));
        expect(calls('post', '/software/install')[0]?.body).toMatchObject({ type: 'quilt', loader: '0.16.9' });
    });

    it('fetches the builds of Paper for the chosen Minecraft version', async () => {
        await renderPage();
        await choose(/Paper/);
        await waitFor(() => expect(screen.getByRole('button', { name: 'Install' })).toBeEnabled());

        expect(calls('get', '/software/catalog').some((request) => request.search.includes('minecraft=1.21.1'))).toBe(
            true
        );
        await confirmInstall();

        await waitFor(() => expect(calls('post', '/software/install')).toHaveLength(1));
        expect(calls('post', '/software/install')[0]?.body).toMatchObject({ type: 'paper', loader: '120' });
    });

    it('offers Convert and blocks the install off the Astrelyse egg', async () => {
        state.current.egg_managed = false;
        await renderPage();

        fireEvent.click(await screen.findByRole('button', { name: 'Convert' }));
        await waitFor(() => expect(calls('post', '/software/convert')).toHaveLength(1));
        expect(screen.queryByRole('radiogroup', { name: 'Server type' })).not.toBeInTheDocument();
    });
});

describe('operation polling', () => {
    const header = () => screen.findByRole('status');

    it('polls every two seconds while running and stops on success', async () => {
        state.operation = operation('running');
        operations = [operation('running'), operation('succeeded')];
        await renderPage();

        expect(await header()).toHaveTextContent('Installing…');
        await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Succeeded'), { timeout: 8000 });

        const polls = calls('get', '/operations/1').length;

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 2500));
        });
        expect(calls('get', '/operations/1')).toHaveLength(polls);
    }, 20_000);

    it('stops on failure and shows the error with the log link', async () => {
        state.operation = operation('running');
        operations = [operation('failed', 'Hash mismatch')];
        await renderPage();

        await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Failed'), { timeout: 8000 });
        expect(screen.getByText('Hash mismatch')).toBeVisible();

        const polls = calls('get', '/operations/1').length;

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 2500));
        });
        expect(calls('get', '/operations/1')).toHaveLength(polls);
        expect(screen.getByRole('link', { name: 'View install log' })).toBeVisible();
    }, 20_000);

    it('locks the type cards while an install runs', async () => {
        state.operation = operation('running');
        operations = [operation('running')];
        await renderPage();

        await screen.findByText('Fabric 0.16.9 · Minecraft 1.21.1');
        expect(screen.queryByRole('radio', { name: /Paper/ })).not.toBeInTheDocument();
    });
});

const openModpack = async (path?: string) => {
    await renderPage(undefined, path);
    fireEvent.click(await screen.findByRole('tab', { name: 'Modpacks' }));
};

describe('modpacks', () => {
    it('browses Modrinth with the loader and Minecraft badges', async () => {
        await openModpack();

        expect(await screen.findByText('Better Pack')).toBeVisible();
        expect(screen.getByText('Minecraft 1.21.1')).toBeVisible();
        expect(calls('get', '/modpacks/search')[0]).toBeDefined();
    });

    it('previews the counts, then installs with Start fresh on', async () => {
        await openModpack();
        fireEvent.click(await screen.findByRole('button', { name: 'Install Better Pack' }));

        const drawer = await screen.findByRole('dialog');

        expect(
            await within(drawer).findByText('142 server mods · 31 client-only skipped · 3 unverified')
        ).toBeVisible();
        expect(within(drawer).getByText(/Fabric 0\.16\.9 · Minecraft 1\.21\.1/)).toBeVisible();
        expect(calls('post', '/modpacks/preview')[0]?.body).toEqual({
            provider: 'modrinth',
            project_id: 'P1',
            version_id: 'v2',
        });
        expect(within(drawer).getByRole('switch', { name: /Start fresh/ })).toBeChecked();
        fireEvent.click(within(drawer).getByRole('button', { name: 'Install' }));

        await waitFor(() => expect(calls('post', '/modpacks/install')).toHaveLength(1));
        expect(calls('post', '/modpacks/install')[0]?.body).toEqual({
            provider: 'modrinth',
            project_id: 'P1',
            version_id: 'v2',
            wipe: { enabled: true, keep_worlds: true },
        });
    });

    it('installs on top when Start fresh is turned off', async () => {
        await openModpack();
        fireEvent.click(await screen.findByRole('button', { name: 'Install Better Pack' }));

        const drawer = await screen.findByRole('dialog');

        await within(drawer).findByText(/142 server mods/);
        fireEvent.click(within(drawer).getByRole('switch', { name: /Start fresh/ }));
        fireEvent.click(within(drawer).getByRole('button', { name: 'Install' }));

        await waitFor(() => expect(calls('post', '/modpacks/install')).toHaveLength(1));
        expect(calls('post', '/modpacks/install')[0]?.body?.wipe).toEqual({ enabled: false, keep_worlds: true });
    });

    it('offers the .mrpack import', async () => {
        await openModpack();

        expect(await screen.findByRole('button', { name: 'Import .mrpack' })).toBeVisible();
    });
});

describe('worlds', () => {
    const openWorld = async (path?: string) => {
        await renderPage(undefined, path);
        fireEvent.click(await screen.findByRole('tab', { name: 'Worlds' }));
    };

    it('replaces the world with a backup by default', async () => {
        await openWorld();
        fireEvent.click(await screen.findByRole('button', { name: 'Install Cool Map' }));

        const drawer = await screen.findByRole('dialog');

        await within(drawer).findByText('2.0.0');
        expect(within(drawer).getByRole('switch', { name: /backup copy/ })).toBeChecked();
        fireEvent.click(within(drawer).getByRole('button', { name: 'Install' }));
        fireEvent.click(
            within(await screen.findByRole('dialog', { name: /Install Cool Map\?/ })).getByRole('button', {
                name: 'Install',
            })
        );

        await waitFor(() => expect(calls('post', '/worlds/install')).toHaveLength(1));
        expect(calls('post', '/worlds/install')[0]?.body).toEqual({
            provider: 'curseforge',
            project_id: 'W1',
            file_id: 'v2',
            mode: 'replace',
            backup: true,
        });
    });

    it('installs alongside as a new world with no backup, and says how to use it', async () => {
        await openWorld();
        fireEvent.click(await screen.findByRole('button', { name: 'Install Cool Map' }));

        const drawer = await screen.findByRole('dialog');

        await within(drawer).findByText('2.0.0');
        fireEvent.click(within(drawer).getByRole('radio', { name: /alongside/ }));
        expect(within(drawer).getByText(/Set level-name in server\.properties/)).toBeVisible();
        expect(within(drawer).queryByRole('switch', { name: /backup copy/ })).not.toBeInTheDocument();
        fireEvent.click(within(drawer).getByRole('button', { name: 'Install' }));
        fireEvent.click(
            within(await screen.findByRole('dialog', { name: /Install Cool Map\?/ })).getByRole('button', {
                name: 'Install',
            })
        );

        await waitFor(() => expect(calls('post', '/worlds/install')).toHaveLength(1));
        expect(calls('post', '/worlds/install')[0]?.body).toMatchObject({ mode: 'new', backup: false });
    });

    it('hides the public worlds with a note when CurseForge has no key, and keeps the zip import', async () => {
        curseforgeKey = false;
        await openWorld();

        expect(await screen.findByText(/CurseForge isn't set up on this panel/)).toBeVisible();
        expect(screen.getByRole('button', { name: 'Import world zip' })).toBeVisible();
        expect(calls('get', '/worlds/search')).toHaveLength(0);
    });
});

describe('maintenance', () => {
    const openMaintenance = async () => {
        await renderPage();
        fireEvent.click(await screen.findByRole('tab', { name: 'Maintenance' }));
    };

    it('reinstalls after a confirm', async () => {
        await openMaintenance();
        fireEvent.click(await screen.findByRole('button', { name: 'Reinstall' }));
        fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Reinstall' }));

        await waitFor(() => expect(calls('post', '/software/reinstall')).toHaveLength(1));
    });

    it('clears only after the exact server name is typed', async () => {
        await openMaintenance();
        fireEvent.click(await screen.findByRole('button', { name: 'Clear server files…' }));

        const dialog = await screen.findByRole('dialog');
        const confirm = within(dialog).getByRole('button', { name: 'Clear server files' });

        expect(confirm).toBeDisabled();
        await user().type(within(dialog).getByLabelText(/to confirm/), 'survival smp');
        expect(confirm).toBeDisabled();
        await user().clear(within(dialog).getByLabelText(/to confirm/));
        await user().type(within(dialog).getByLabelText(/to confirm/), 'Survival SMP');
        expect(confirm).toBeEnabled();
        fireEvent.click(confirm);

        await waitFor(() => expect(calls('post', '/software/clear')).toHaveLength(1));
        expect(calls('post', '/software/clear')[0]?.body).toEqual({ keep_worlds: true, confirm: 'Survival SMP' });
    });

    it('is disabled while the server runs, with a Stop button', async () => {
        await openMaintenance();
        act(() => setStatus('running'));

        expect(await screen.findByText(/Stop the server first/)).toBeVisible();
        expect(screen.getByRole('button', { name: 'Clear server files…' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Stop' })).toBeVisible();
    });
});

describe('search-param preselection', () => {
    it('opens the modpack drawer with the named version selected', async () => {
        await renderPage(undefined, '/server/a1b2c3d4?modpack=modrinth:P1&version=v1&title=Better%20Pack');

        const drawer = await screen.findByRole('dialog');

        expect(await within(drawer).findByRole('radio', { name: /1\.0\.0/ })).toHaveAttribute('aria-checked', 'true');
        expect(screen.getByRole('tab', { name: 'Modpacks', hidden: true })).toHaveAttribute('aria-selected', 'true');
        expect(within(drawer).getByText('Better Pack')).toBeVisible();
    });

    it('opens the world drawer on the Worlds tab', async () => {
        await renderPage(undefined, '/server/a1b2c3d4?world=curseforge:W1');

        const drawer = await screen.findByRole('dialog');

        expect(await within(drawer).findByText('2.0.0')).toBeVisible();
        expect(screen.getByRole('tab', { name: 'Worlds', hidden: true })).toHaveAttribute('aria-selected', 'true');
    });

    it('opens the Modpacks tab for the import link', async () => {
        await renderPage(undefined, '/server/a1b2c3d4?tab=modpacks&import=mrpack');

        expect(await screen.findByRole('button', { name: 'Import .mrpack' })).toBeVisible();
    });
});

describe('without software.manage', () => {
    it('hides every write control', async () => {
        await renderPage(['software.read']);
        await screen.findByText('Fabric 0.16.9 · Minecraft 1.21.1');

        expect(screen.queryByRole('tab', { name: 'Maintenance' })).not.toBeInTheDocument();
        expect(screen.queryByRole('radio')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('tab', { name: 'Modpacks' }));
        await screen.findByText('Better Pack');
        expect(screen.queryByRole('button', { name: /Install/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Import .mrpack' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('tab', { name: 'Worlds' }));
        await screen.findByText('Cool Map');
        expect(screen.queryByRole('button', { name: /Install|Import/ })).not.toBeInTheDocument();
    });

    it('hides Convert', async () => {
        state.current.egg_managed = false;
        await renderPage(['software.read']);

        await screen.findByText(/does not use the Astrelyse Minecraft egg/);
        expect(screen.queryByRole('button', { name: 'Convert' })).not.toBeInTheDocument();
    });
});
