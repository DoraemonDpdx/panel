/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosAdapter } from 'axios';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import http from '@/api/http';
import type { InstalledMod, ModPlatform } from '@/api/server/mods/queries';
import type { InstallOperation, PrismItem, ResolvedLink } from '@/api/server/mods/types';
import { publishAreaNav } from '@/router/nav';
import { createExtensionTestHost, createTestServer, type ExtensionTestHost } from '@/sdk/testing';
import { View } from '@/views/View';
import { useNavigation } from '@/views/navigation';

interface Recorded {
    method: string;
    path: string;
    params: Record<string, string | number | undefined>;
    body: unknown;
}

const adapter = http.defaults.adapter;
let host: ExtensionTestHost | undefined;
let requests: Recorded[];
let platform: ModPlatform;
let installed: InstalledMod[];
let portal: HTMLElement;
let refuseInstall = false;
let diskUnavailable = false;
let failSearch = false;
let emptySearch = false;
let searchInstalled = false;
let searchSide: string | undefined;
let resolved: ResolvedLink;
let prismItems: PrismItem[];
let operations: InstallOperation[];
let projectBody: string | null;

const basePlatform = (): ModPlatform => ({
    eligible: true,
    platform: 'fabric',
    game_version: 'latest',
    resolved_game_version: '1.21.1',
    project_type: 'mod',
    install_dir: 'mods',
    source: 'egg_name',
    providers: ['modrinth'],
});

const row = (options: Partial<InstalledMod> = {}): InstalledMod => ({
    id: 1,
    project_id: 'AANobbMI',
    version_id: 'v1',
    title: 'Sodium',
    icon_url: null,
    filename: 'sodium-fabric-0.6.0.jar',
    version_number: '0.6.0',
    provider: 'modrinth',
    slug: 'sodium',
    project_type: 'mod',
    page_url: 'https://modrinth.com/mod/sodium',
    enabled: true,
    tracked: true,
    present: true,
    update: null,
    ...options,
});

const version = (id: string, number: string, gameVersions = ['1.21.1']) => ({
    id,
    name: number,
    version_number: number,
    version_type: 'release',
    date_published: '2026-01-01T00:00:00Z',
    game_versions: gameVersions,
    loaders: ['fabric'],
    file: { filename: `sodium-${number}.jar`, url: 'https://cdn.modrinth.com/x.jar', size: 10, sha512: 'x' },
    dependencies: [{ project_id: 'P7dR8mSH', version_id: null, dependency_type: 'required' }],
});

const searchBody = (params: Recorded['params']) => ({
    object: 'list',
    data: emptySearch
        ? []
        : [
              {
                  project_id: 'AANobbMI',
                  slug: 'sodium',
                  title: 'Sodium',
                  description: 'A rendering engine.',
                  icon_url: null,
                  downloads: 1000,
                  author: 'jelly',
                  categories: [],
                  installed: searchInstalled,
                  side: searchSide,
                  provider: params.provider ?? 'modrinth',
                  page_url: `https://example.test/${params.provider ?? 'modrinth'}/sodium`,
                  distributable: params.provider !== 'curseforge',
              },
          ],
    meta: { total: 1, offset: 0, limit: 20, loader: 'fabric', game_version: '1.21.1' },
});

const projectBodyResponse = () => ({
    object: 'mod_project',
    attributes: {
        project_id: 'AANobbMI',
        body: projectBody,
        gallery: [
            { url: 'https://cdn.example.test/1.png', title: 'In game' },
            { url: 'javascript:alert(1)', title: 'Bad' },
            { url: 'https://cdn.example.test/2.png', title: 'Menu' },
        ],
        links: {
            source: 'https://github.example.test/sodium',
            issues: 'javascript:alert(2)',
            discord: 'https://discord.example.test/x',
        },
    },
});

/** The content and software endpoints of the import flows. */
const respondContent = (path: string) => {
    if (path.endsWith('/content/resolve')) {
        return { object: 'content_link', attributes: resolved };
    }

    if (path.endsWith('/import/prism/preview')) {
        return { object: 'list', data: prismItems };
    }

    if (path.endsWith('/import/prism/install')) {
        return { object: 'install_operation', attributes: { id: 7, kind: 'mods', status: 'running' } };
    }

    // The last poll repeats once the script is used up.
    return { object: 'install_operation', attributes: operations.length > 1 ? operations.shift() : operations[0] };
};

const respond = (method: string, path: string, params: Recorded['params'] = {}) => {
    if (path.endsWith('/mods/platform')) {
        return { object: 'mod_platform', attributes: platform };
    }

    if (path.endsWith('/mods/search')) {
        return searchBody(params);
    }

    if (path.includes('/content/') || path.includes('/software/operations/')) {
        return respondContent(path);
    }

    if (/\/mods\/projects\/[^/]+$/.test(path)) {
        return projectBodyResponse();
    }

    if (path.endsWith('/versions')) {
        return { object: 'list', data: [version('v3', '0.6.2'), version('v1', '0.6.0', ['1.20.4', '1.20.6'])] };
    }

    if (path.endsWith('/mods/installed') && method === 'get') {
        return { object: 'list', data: installed, meta: { disk_unavailable: diskUnavailable } };
    }

    return { object: 'mod_install', attributes: installed[0] ?? row() };
};

beforeEach(() => {
    requests = [];
    refuseInstall = false;
    diskUnavailable = false;
    failSearch = false;
    emptySearch = false;
    searchInstalled = false;
    searchSide = undefined;
    resolved = {
        kind: 'mod',
        provider: 'modrinth',
        project_id: 'AANobbMI',
        version_id: 'v1',
        title: 'Sodium',
        icon_url: null,
        compatible: true,
    };
    prismItems = [];
    operations = [{ id: 7, kind: 'mods', status: 'running' }];
    projectBody = 'Fast rendering.';
    try {
        localStorage.clear();
    } catch {
        // Not remembered.
    }

    platform = basePlatform();
    installed = [row()];
    portal = document.body.appendChild(Object.assign(document.createElement('div'), { id: 'modal-portal' }));
    http.defaults.adapter = (async (config) => {
        const url = new URL(config.url!, 'https://panel.test');
        const method = config.method ?? 'get';

        requests.push({
            method,
            path: url.pathname,
            params: (config.params ?? {}) as Recorded['params'],
            body: config.data ? JSON.parse(String(config.data)) : undefined,
        });

        if (failSearch && url.pathname.endsWith('/mods/search')) {
            throw new AxiosError('Unavailable', 'ERR_BAD_RESPONSE', config, undefined, {
                config,
                headers: {},
                status: 503,
                statusText: 'Unavailable',
                data: {},
            });
        }

        if (refuseInstall && url.pathname.endsWith('/mods/install')) {
            throw new AxiosError('Unprocessable', 'ERR_BAD_REQUEST', config, undefined, {
                config,
                headers: {},
                status: 422,
                statusText: 'Unprocessable',
                data: { error: 'not_distributable', page_url: 'https://example.test/curseforge/sodium' },
            });
        }

        return {
            config,
            headers: {},
            status: 200,
            statusText: 'OK',
            data: respond(method, url.pathname, config.params as Recorded['params']),
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

async function renderPage(permissions?: string[]) {
    host = createExtensionTestHost({
        server: createTestServer({ identifier: 'a1b2c3d4', owner: !permissions, permissions }),
    });
    await act(async () => {
        render(<View name='page.server.mods' />, { wrapper: host!.Wrapper });
    });
}

const calls = (method: string, suffix: string) =>
    requests.filter((request) => request.method === method && request.path.endsWith(suffix));

describe('mods tab visibility', () => {
    beforeAll(() => {
        publishAreaNav('server', [
            { segment: '', label: 'Console', exact: true },
            { segment: 'mods', label: 'Mods', permission: 'mods.read' },
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

    const tabs = async () => {
        host = createExtensionTestHost({
            server: createTestServer({ identifier: 'abc', permissions: ['mods.read'], owner: false }),
            path: '/server/abc',
        });
        await act(async () => {
            render(<Items />, { wrapper: host!.Wrapper });
        });
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 20));
        });

        return screen.getAllByRole('listitem').map((entry) => entry.textContent);
    };

    it('hides the tab when the server is not eligible', async () => {
        platform = { ...basePlatform(), eligible: false, platform: 'vanilla' };

        expect(await tabs()).toEqual(['Console']);
    });

    it('shows the tab, named after the project type, when it is eligible', async () => {
        platform = { ...basePlatform(), platform: 'paper', project_type: 'plugin' };

        expect(await tabs()).toEqual(['Console', 'Plugins']);
    });
});

const openBrowse = async (permissions?: string[]) => {
    await renderPage(permissions);
    fireEvent.click(await screen.findByRole('tab', { name: 'Browse' }));
};

const user = () => userEvent.setup();

describe('page header and platform bar', () => {
    it('titles the page and describes its sources', async () => {
        await renderPage();

        expect(await screen.findByRole('heading', { level: 1, name: 'Mods' })).toBeVisible();
        expect(screen.getByText('Install and manage mods from Modrinth.')).toBeVisible();
    });

    it('names a plugin platform and drops CurseForge from the description when it is unavailable', async () => {
        platform = { ...basePlatform(), platform: 'paper', project_type: 'plugin' };
        await renderPage();

        expect(await screen.findByRole('heading', { level: 1, name: 'Plugins' })).toBeVisible();
        expect(document.title).toContain('Plugins');
        expect(screen.getByText('Install and manage plugins from Modrinth.')).toBeVisible();
    });

    it('reads as a chip with a latest note, then changes through labelled controls', async () => {
        await renderPage();

        expect(await screen.findByText('Fabric · 1.21.1 (latest)')).toBeVisible();
        expect(screen.getByText('Detected from your server')).toBeVisible();

        fireEvent.click(screen.getByRole('button', { name: 'Change game version' }));
        fireEvent.change(screen.getByLabelText('Game version'), { target: { value: '1.20.4' } });

        expect(screen.queryByLabelText('Loader')).not.toBeInTheDocument();
        expect(await screen.findByText('Fabric · 1.20.4 (custom)')).toBeVisible();

        fireEvent.click(screen.getByRole('button', { name: 'Reset to detected' }));

        expect(await screen.findByText('Fabric · 1.21.1 (latest)')).toBeVisible();
    });

    it('puts the tabs under the heading, with a count on Installed', async () => {
        await renderPage();

        await waitFor(() => expect(screen.getByRole('tab', { name: /Installed/ })).toHaveTextContent('Installed1'));
        expect(screen.getByRole('tab', { name: 'Browse' })).toBeVisible();
    });
});

describe('browse', () => {
    it('searches with the resolved game version, and never sends a loader', async () => {
        await openBrowse();
        await screen.findByText('A rendering engine.');

        expect(calls('get', '/mods/search')[0]?.params).toMatchObject({
            provider: 'modrinth',
            game_version: '1.21.1',
            offset: 0,
        });
        expect(calls('get', '/mods/search')[0]?.params).not.toHaveProperty('loader');
    });

    it('sends an overridden game version and searches again', async () => {
        await renderPage();
        fireEvent.click(await screen.findByRole('button', { name: 'Change game version' }));
        fireEvent.change(screen.getByLabelText('Game version'), { target: { value: '1.20.4' } });
        fireEvent.click(screen.getByRole('tab', { name: 'Browse' }));

        await waitFor(() =>
            expect(calls('get', '/mods/search').some((request) => request.params.game_version === '1.20.4')).toBe(true)
        );
    });

    it('sends the typed query after a pause', async () => {
        await openBrowse();
        fireEvent.change(await screen.findByLabelText('Search'), { target: { value: 'sod' } });

        await waitFor(() =>
            expect(calls('get', '/mods/search').some((request) => request.params.query === 'sod')).toBe(true)
        );
    });

    it('has a neutral Install on the row, and the one primary in the drawer', async () => {
        await openBrowse();

        const rowButton = await screen.findByRole('button', { name: 'Install Sodium' });

        expect(rowButton).toHaveAttribute('data-color', 'grey');
        fireEvent.click(rowButton);

        const drawer = await screen.findByRole('dialog');

        await within(drawer).findByText('0.6.2');
        expect(within(drawer).getByRole('button', { name: 'Install' })).toHaveAttribute('data-color', 'primary');
    });

    it('closes the drawer at once and installs through POST /mods/install', async () => {
        await openBrowse();
        fireEvent.click(await screen.findByRole('button', { name: 'Install Sodium' }));

        const drawer = await screen.findByRole('dialog');

        await within(drawer).findByText('0.6.2');
        await waitFor(() => expect(within(drawer).getByRole('button', { name: 'Install' })).toBeEnabled());
        fireEvent.click(within(drawer).getByRole('button', { name: 'Install' }));

        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        await waitFor(() => expect(calls('post', '/mods/install')).toHaveLength(1));
        expect(calls('post', '/mods/install')[0]?.body).toEqual({
            provider: 'modrinth',
            project_id: 'AANobbMI',
            version_id: 'v3',
        });
        expect(await screen.findByText('Changes take effect after a restart.')).toBeVisible();
        expect(screen.getByRole('button', { name: 'Restart' })).toBeVisible();
    });

    it('hides the install button without mods.install', async () => {
        await openBrowse(['mods.read']);
        await screen.findByText('A rendering engine.');

        expect(screen.queryByRole('button', { name: 'Install Sodium' })).not.toBeInTheDocument();
    });

    it('offers Manage, not Install, for an installed result', async () => {
        searchInstalled = true;
        await openBrowse();

        expect(await screen.findByRole('button', { name: 'Manage Sodium' })).toBeVisible();
        expect(screen.queryByRole('button', { name: 'Install Sodium' })).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Manage Sodium' }));

        expect(await screen.findByLabelText('Filter installed files')).toHaveValue('Sodium');
    });

    it('shows the author, downloads and an initial for a missing icon', async () => {
        await openBrowse();

        expect(await screen.findByText('by jelly')).toBeVisible();
        expect(screen.getByText('1K downloads')).toBeVisible();
        expect(screen.getByText('S')).toBeVisible();
    });

    it('suggests searching all versions when nothing matches', async () => {
        emptySearch = true;
        await openBrowse();

        expect(await screen.findByText(/Nothing found on Modrinth for Fabric/)).toBeVisible();

        fireEvent.click(screen.getByRole('button', { name: 'Search all versions' }));

        await waitFor(() =>
            expect(calls('get', '/mods/search').some((request) => request.params.game_version === undefined)).toBe(true)
        );
    });

    it('shows a provider outage inline, scoped to Browse', async () => {
        platform = { ...basePlatform(), providers: ['modrinth', 'curseforge'] };
        failSearch = true;
        await openBrowse();

        expect(await screen.findByText("Modrinth isn't responding. Try again or switch to CurseForge.")).toBeVisible();
        expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('tab', { name: /Installed/ }));

        expect(await screen.findByText('Sodium')).toBeVisible();
    });
});

describe('sources', () => {
    it('hides the source switch when only Modrinth is available', async () => {
        await openBrowse();
        await screen.findByText('A rendering engine.');

        expect(screen.queryByRole('tablist', { name: 'Source' })).not.toBeInTheDocument();
    });

    it('shows the source switch as a named segmented control when both providers are listed', async () => {
        platform = { ...basePlatform(), providers: ['modrinth', 'curseforge'] };
        await openBrowse();

        const source = await screen.findByRole('tablist', { name: 'Source' });

        expect(within(source).getByRole('tab', { name: 'Modrinth' })).toHaveAttribute('aria-selected', 'true');
        expect(within(source).getByRole('tab', { name: 'CurseForge' })).toBeVisible();
    });

    it('links to CurseForge instead of installing a non-distributable result, and remembers the source', async () => {
        platform = { ...basePlatform(), providers: ['modrinth', 'curseforge'] };
        await openBrowse();
        await screen.findByText('A rendering engine.');
        fireEvent.click(
            within(screen.getByRole('tablist', { name: 'Source' })).getByRole('tab', { name: 'CurseForge' })
        );

        const link = await screen.findByRole('link', { name: /Download on CurseForge/ });

        expect(link).toHaveAttribute('href', 'https://example.test/curseforge/sodium');
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', 'noopener noreferrer');
        expect(screen.queryByRole('button', { name: 'Install Sodium' })).not.toBeInTheDocument();
        expect(calls('get', '/mods/search').some((request) => request.params.provider === 'curseforge')).toBe(true);
        expect(localStorage.getItem('astrelyse:mods:source:11111111-1111-4111-8111-111111111111')).toBe('curseforge');
    });

    it('links to the page when an install is refused as not distributable', async () => {
        refuseInstall = true;
        await openBrowse();
        fireEvent.click(await screen.findByRole('button', { name: 'Install Sodium' }));

        const drawer = await screen.findByRole('dialog');

        await within(drawer).findByText('0.6.2');
        await waitFor(() => expect(within(drawer).getByRole('button', { name: 'Install' })).toBeEnabled());
        fireEvent.click(within(drawer).getByRole('button', { name: 'Install' }));

        const link = await screen.findByRole('link', { name: /Download on Modrinth/ });

        expect(link).toHaveAttribute('href', 'https://example.test/curseforge/sodium');
        expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });
});

describe('version drawer', () => {
    const openDrawer = async () => {
        await openBrowse();
        fireEvent.click(await screen.findByRole('button', { name: 'Install Sodium' }));

        return screen.findByRole('dialog');
    };

    it('says a build works on the server version, and what a build was made for otherwise', async () => {
        const drawer = await openDrawer();

        expect(await within(drawer).findByText('Works on 1.21.1')).toBeVisible();
        expect(within(drawer).getByText('Built for 1.20.4–1.20.6')).toBeVisible();
    });

    it('shows the project header and a release badge, date and size', async () => {
        const drawer = await openDrawer();

        await within(drawer).findByText('0.6.2');
        expect(within(drawer).getByText('A rendering engine.')).toBeVisible();
        expect(within(drawer).getByRole('link', { name: /View on Modrinth/ })).toBeVisible();
        expect(within(drawer).getAllByText('release')).toHaveLength(2);
    });

    it('selects a version as a radio, with the arrow keys moving the choice', async () => {
        const drawer = await openDrawer();
        const group = await within(drawer).findByRole('radiogroup', { name: 'Versions' });
        const radios = within(group).getAllByRole('radio');

        expect(radios[0]).toHaveAttribute('aria-checked', 'true');

        fireEvent.keyDown(radios[0]!, { key: 'ArrowDown' });

        await waitFor(() => expect(within(group).getAllByRole('radio')[1]).toHaveAttribute('aria-checked', 'true'));
    });

    it('lists required dependencies under the selected version', async () => {
        const drawer = await openDrawer();

        expect(await within(drawer).findByText('Required dependencies')).toBeVisible();
        expect(within(drawer).getByRole('button', { name: 'Install dependency P7dR8mSH' })).toBeVisible();
    });
});

describe('installed', () => {
    const openMenu = async (name: string) => {
        await user().click(await screen.findByRole('button', { name: `More actions for ${name}` }));
    };

    it('toggles a file through POST /mods/installed/toggle', async () => {
        await renderPage();
        fireEvent.click(await screen.findByRole('switch', { name: 'Disable Sodium' }));

        await waitFor(() => expect(calls('post', '/mods/installed/toggle')).toHaveLength(1));
        expect(calls('post', '/mods/installed/toggle')[0]?.body).toEqual({
            filename: 'sodium-fabric-0.6.0.jar',
            enabled: false,
        });
        expect(await screen.findByText('Changes take effect after a restart.')).toBeVisible();
    });

    it('changes the version through POST /mods/installed/{id}/version', async () => {
        await renderPage();
        await openMenu('Sodium');
        await user().click(await screen.findByRole('menuitem', { name: 'Change version…' }));

        const drawer = await screen.findByRole('dialog');

        await within(drawer).findByText('0.6.2');
        expect(within(drawer).getByText('Current')).toBeVisible();
        await waitFor(() => expect(within(drawer).getByRole('button', { name: 'Use this version' })).toBeEnabled());
        fireEvent.click(within(drawer).getByRole('button', { name: 'Use this version' }));

        await waitFor(() => expect(calls('post', '/mods/installed/1/version')).toHaveLength(1));
        expect(calls('post', '/mods/installed/1/version')[0]?.body).toEqual({
            version_id: 'v3',
            provider: 'modrinth',
        });
    });

    it('names the file and says it cannot be undone before deleting', async () => {
        await renderPage();
        await openMenu('Sodium');
        await user().click(await screen.findByRole('menuitem', { name: 'Delete…' }));

        expect(
            await screen.findByText(
                "Delete Sodium (sodium-fabric-0.6.0.jar)? The file is removed from /mods. This can't be undone."
            )
        ).toBeVisible();
        expect(calls('post', '/mods/installed/delete')).toHaveLength(0);

        fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

        await waitFor(() => expect(calls('post', '/mods/installed/delete')).toHaveLength(1));
        expect(calls('post', '/mods/installed/delete')[0]?.body).toEqual({ filename: 'sodium-fabric-0.6.0.jar' });
    });

    it('shows an untracked file by name with only the switch and Delete', async () => {
        installed = [
            row({
                id: null,
                project_id: null,
                version_id: null,
                title: null,
                filename: 'custom.jar.disabled',
                version_number: null,
                provider: null,
                slug: null,
                project_type: null,
                page_url: null,
                enabled: false,
                tracked: false,
            }),
        ];
        await renderPage();

        expect(await screen.findByText('custom.jar.disabled')).toBeVisible();
        expect(screen.getByText('Untracked')).toBeVisible();
        expect(screen.getByText('Disabled')).toBeVisible();
        expect(screen.queryByRole('button', { name: /More actions/ })).not.toBeInTheDocument();
        expect(screen.queryByText(/View on/)).not.toBeInTheDocument();
        expect(screen.getByRole('switch', { name: 'Enable custom.jar.disabled' })).toBeVisible();
        expect(screen.getByRole('button', { name: 'Delete' })).toBeVisible();
    });

    it('puts the page link in the menu, by provider', async () => {
        installed = [row({ provider: 'curseforge', page_url: 'https://www.curseforge.com/minecraft/mc-mods/sodium' })];
        await renderPage();
        await openMenu('Sodium');

        const link = await screen.findByRole('menuitem', { name: /View on CurseForge/ });

        expect(link).toHaveAttribute('href', 'https://www.curseforge.com/minecraft/mc-mods/sodium');
        expect(link).toHaveAttribute('rel', 'noopener noreferrer');
        expect(screen.getByTitle('From CurseForge')).toBeVisible();
    });

    it('marks a missing file in danger tone with Remove entry', async () => {
        installed = [row({ present: false })];
        await renderPage();

        expect(await screen.findByText('Missing on disk')).toBeVisible();

        fireEvent.click(screen.getByRole('button', { name: 'Remove entry' }));

        await waitFor(() => expect(calls('delete', '/mods/installed/1')).toHaveLength(1));
    });

    it('says the files cannot be reached and locks the controls when the disk is unavailable', async () => {
        diskUnavailable = true;
        installed = [row({ present: null })];
        await renderPage();

        expect(
            await screen.findByText("Can't reach the server's files right now. Showing what the panel installed.")
        ).toBeVisible();
        expect(screen.queryByText('Missing on disk')).not.toBeInTheDocument();
        expect(screen.getByRole('switch', { name: 'Disable Sodium' })).toHaveAttribute('data-disabled');
    });

    it('offers Update all from two updates on', async () => {
        const update = { version_id: 'v3', version_number: '0.6.2' };

        installed = [row({ update }), row({ id: 2, title: 'Lithium', filename: 'lithium.jar', update })];
        await renderPage();

        expect(await screen.findByRole('button', { name: 'Update all (2)' })).toBeVisible();
    });

    it('hides every control without mods.install', async () => {
        installed = [row({ update: { version_id: 'v3', version_number: '0.6.2' } })];
        await renderPage(['mods.read']);

        await screen.findByText('Sodium');
        expect(screen.queryByRole('switch')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /More actions/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Update/ })).not.toBeInTheDocument();
    });

    it('filters by name', async () => {
        installed = [row(), row({ id: 2, title: 'Lithium', filename: 'lithium.jar.disabled', enabled: false })];
        await renderPage();

        await screen.findByText('Lithium');
        fireEvent.change(screen.getByLabelText('Filter installed files'), { target: { value: 'sod' } });

        await waitFor(() => expect(screen.queryByText('Lithium')).not.toBeInTheDocument());
        expect(screen.getByText('Sodium')).toBeVisible();
    });

    it('offers Browse when nothing is installed', async () => {
        installed = [];
        await renderPage();

        expect(await screen.findByText('No mods yet')).toBeVisible();
        fireEvent.click(screen.getByRole('button', { name: 'Browse' }));

        expect(await screen.findByLabelText('Search')).toBeVisible();
    });

    it('shows an installed-list failure inline', async () => {
        diskUnavailable = false;
        installed = [row()];
        await renderPage();

        expect(await screen.findByText('Sodium')).toBeVisible();
        expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
    });
});

const openImport = async (permissions?: string[]) => {
    await renderPage(permissions);
    fireEvent.click(await screen.findByRole('tab', { name: 'Import' }));
};

describe('strict loader', () => {
    it('has no loader select, and says what mods are matched to with a link to the Software page', async () => {
        await renderPage();
        fireEvent.click(await screen.findByRole('button', { name: 'Change game version' }));

        expect(screen.queryByLabelText('Loader')).not.toBeInTheDocument();
        expect(screen.getByLabelText('Game version')).toBeVisible();
        expect(screen.getByText(/Mods are matched to Fabric\./)).toBeVisible();
        expect(screen.getByRole('link', { name: /Software page/ })).toHaveAttribute(
            'href',
            '/server/a1b2c3d4/software'
        );
    });

    it('sends no loader to versions, nor to search', async () => {
        await openBrowse();
        fireEvent.click(await screen.findByRole('button', { name: 'Install Sodium' }));
        await within(await screen.findByRole('dialog')).findByText('0.6.2');

        const sent = [...calls('get', '/mods/search'), ...calls('get', '/versions')];

        expect(sent.length).toBeGreaterThan(1);
        expect(sent.every((request) => !('loader' in request.params))).toBe(true);
    });
});

describe('browse: categories and side', () => {
    it('filters by one category chip at a time, and All clears it', async () => {
        await openBrowse();
        await screen.findByText('A rendering engine.');

        const group = screen.getByRole('group', { name: 'Category' });

        expect(within(group).getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(within(group).getByRole('button', { name: 'Optimization' }));

        await waitFor(() =>
            expect(calls('get', '/mods/search').some((request) => request.params.category === 'optimization')).toBe(
                true
            )
        );
        expect(within(group).getByRole('button', { name: 'Optimization' })).toHaveAttribute('aria-pressed', 'true');
        expect(within(group).getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');

        fireEvent.click(within(group).getByRole('button', { name: 'Utility' }));

        await waitFor(() =>
            expect(calls('get', '/mods/search').some((request) => request.params.category === 'utility')).toBe(true)
        );
        expect(within(group).getByRole('button', { name: 'Optimization' })).toHaveAttribute('aria-pressed', 'false');

        fireEvent.click(within(group).getByRole('button', { name: 'All' }));

        // The unfiltered search is cached, so All needs no new request.
        expect(within(group).getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
        expect(within(group).getByRole('button', { name: 'Utility' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('badges only an Unverified result', async () => {
        searchSide = 'both';
        await openBrowse();
        await screen.findByText('A rendering engine.');

        expect(screen.queryByText('Unverified')).not.toBeInTheDocument();
        cleanup();
        host?.dispose();

        searchSide = 'unknown';
        await openBrowse();

        expect(await screen.findByText('Unverified')).toBeVisible();
    });

    it('marks a modpack file in the installed list', async () => {
        installed = [row({ from_modpack: true }), row({ id: 2, title: 'Lithium', filename: 'lithium.jar' })];
        await renderPage();

        expect(await screen.findByText('Modpack')).toBeVisible();
        expect(screen.getAllByText('Modpack')).toHaveLength(1);
        expect(screen.getByText('lithium.jar')).toBeVisible();
    });
});

describe('project detail', () => {
    const openDrawer = async () => {
        await openBrowse();
        fireEvent.click(await screen.findByRole('button', { name: 'Install Sodium' }));

        return screen.findByRole('dialog');
    };

    it('shows at most the safe gallery thumbnails lazily, and the safe links only', async () => {
        const drawer = await openDrawer();
        const gallery = await within(drawer).findByRole('list', { name: 'Screenshots' });
        const images = within(gallery).getAllByRole('img');

        expect(images.map((image) => image.getAttribute('src'))).toEqual([
            'https://cdn.example.test/1.png',
            'https://cdn.example.test/2.png',
        ]);
        expect(images.every((image) => image.getAttribute('loading') === 'lazy')).toBe(true);

        const links = within(within(drawer).getByRole('list', { name: 'Links' })).getAllByRole('link');

        expect(links.map((link) => link.getAttribute('href'))).toEqual([
            'https://github.example.test/sodium',
            'https://discord.example.test/x',
        ]);
        expect(links[0]).toHaveAttribute('rel', 'noopener noreferrer');
    });

    it('renders a script tag in the description as text, never as an element', async () => {
        projectBody = '<script>alert(1)</script> ![shot](https://x.test/a.png) **Fast** [site](https://x.test)';

        const drawer = await openDrawer();
        const about = await within(drawer).findByLabelText('About this project');

        expect(about).toHaveTextContent('<script>alert(1)</script>');
        expect(drawer.querySelector('script')).toBeNull();
        expect(about.querySelector('img')).toBeNull();
        expect(about).toHaveTextContent('site');
        expect(about).not.toHaveTextContent('https://x.test');
    });

    it('clips a long description until Read more', async () => {
        projectBody = 'word '.repeat(200);

        const drawer = await openDrawer();
        const more = await within(drawer).findByRole('button', { name: 'Read more' });

        expect(more).toHaveAttribute('aria-expanded', 'false');
        fireEvent.click(more);

        expect(within(drawer).getByRole('button', { name: 'Show less' })).toHaveAttribute('aria-expanded', 'true');
    });
});

describe('import: install from link', () => {
    const resolve = async (url: string) => {
        await openImport();
        fireEvent.change(await screen.findByLabelText('Paste a Modrinth or CurseForge link'), {
            target: { value: url },
        });
        fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));
    };

    it('resolves a mod, shows the compatibility card, and opens the install drawer on its version', async () => {
        await resolve('https://modrinth.com/mod/sodium');

        expect(await screen.findByText('Compatible')).toBeVisible();
        expect(calls('post', '/content/resolve')[0]?.body).toEqual({ url: 'https://modrinth.com/mod/sodium' });

        fireEvent.click(screen.getByRole('button', { name: 'Choose a version of Sodium' }));

        const drawer = await screen.findByRole('dialog');
        const group = await within(drawer).findByRole('radiogroup', { name: 'Versions' });

        // The link named version v1, which is compatible, so it is preselected over the newest.
        expect(within(group).getAllByRole('radio')[1]).toHaveAttribute('aria-checked', 'true');
    });

    it('sends a modpack link to the Software page with ?modpack=', async () => {
        resolved = { ...resolved, kind: 'modpack', project_id: 'PACK1', version_id: null, title: 'Cool Pack' };
        await resolve('https://modrinth.com/modpack/cool-pack');

        await waitFor(() => expect(host?.location().pathname).toBe('/server/a1b2c3d4/software'));
        expect(host?.location().search).toEqual({ modpack: 'modrinth:PACK1' });
    });

    it('sends a world link to the Software page with ?world=', async () => {
        resolved = { ...resolved, kind: 'world', provider: 'curseforge', project_id: '99', version_id: null };
        await resolve('https://www.curseforge.com/minecraft/worlds/x');

        await waitFor(() => expect(host?.location().pathname).toBe('/server/a1b2c3d4/software'));
        expect(host?.location().search).toEqual({ world: 'curseforge:99' });
    });

    it('refuses a shader link with the reason, and offers no install', async () => {
        resolved = { ...resolved, kind: 'shader', title: 'BSL', compatible: true };
        await resolve('https://modrinth.com/shader/bsl');

        expect(await screen.findByText(/Shaders are client-only content/)).toBeVisible();
        expect(screen.queryByRole('button', { name: /Choose a version/ })).not.toBeInTheDocument();
        expect(host?.location().pathname).not.toContain('software');
    });

    it('shows why an incompatible mod cannot be installed', async () => {
        resolved = { ...resolved, compatible: false, reason: 'It is built for Forge, and this server runs Fabric.' };
        await resolve('https://modrinth.com/mod/forge-only');

        expect(await screen.findByText('It is built for Forge, and this server runs Fabric.')).toBeVisible();
        expect(screen.getByText('Not compatible')).toBeVisible();
        expect(screen.queryByRole('button', { name: /Choose a version/ })).not.toBeInTheDocument();
    });

    it('links to the .mrpack import on the Software page', async () => {
        await openImport();

        expect(await screen.findByRole('link', { name: /Import it from Software/ })).toHaveAttribute(
            'href',
            expect.stringContaining('/server/a1b2c3d4/software')
        );
    });
});

describe('import: Prism Launcher list', () => {
    const modrinth = (id: string, title: string) => ({
        provider: 'modrinth' as const,
        project_id: id,
        version_id: `${id}-v`,
        title,
        icon_url: null,
    });

    beforeEach(() => {
        prismItems = [
            {
                line: 1,
                name: 'Sodium',
                matched: modrinth('sod', 'Sodium'),
                match: 'url',
                side: 'both',
                compatible: true,
                selected: true,
            },
            {
                line: 2,
                name: 'Iris',
                matched: modrinth('iris', 'Iris'),
                match: 'filename',
                side: 'client',
                compatible: false,
                selected: false,
                reason: 'Client-only: it is a shader loader.',
            },
            {
                line: 3,
                name: 'Odd Mod',
                matched: { ...modrinth('odd', 'Odd Mod'), provider: 'curseforge' },
                match: 'name',
                side: 'unknown',
                compatible: true,
                selected: false,
            },
            {
                line: 4,
                name: 'Lithium',
                matched: modrinth('lith', 'Lithium'),
                match: 'name',
                side: 'server',
                compatible: true,
                selected: false,
            },
            {
                line: 5,
                name: 'Ghost',
                matched: null,
                match: 'none',
                side: 'unknown',
                compatible: false,
                selected: false,
            },
        ];
    });

    const preview = async (text = 'Sodium\nIris') => {
        await openImport();
        fireEvent.change(await screen.findByLabelText('Mod list'), { target: { value: text } });
        fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
        await screen.findByText(/will be installed/);
    };

    const box = (name: string) => screen.getByRole('checkbox', { name: `Install ${name}` });

    it('reads a chosen file in the browser into the box', async () => {
        await openImport();

        const file = new File(['- [Sodium](https://modrinth.com/mod/sodium)'], 'mods.md', { type: 'text/markdown' });

        fireEvent.change(await screen.findByLabelText('Choose file'), { target: { files: [file] } });

        await waitFor(() =>
            expect(screen.getByLabelText('Mod list')).toHaveValue('- [Sodium](https://modrinth.com/mod/sodium)')
        );
        expect(screen.getByLabelText('Choose file')).toHaveAttribute('accept', '.txt,.md,.html,.json,.csv');
        expect(calls('post', '/import/prism/preview')).toHaveLength(0);
    });

    it('applies the tick rules: only verified, compatible matches start ticked', async () => {
        await preview();

        expect(calls('post', '/import/prism/preview')[0]?.body).toEqual({ text: 'Sodium\nIris' });
        expect(box('Sodium')).toBeChecked();
        expect(box('Iris')).not.toBeChecked();
        expect(box('Iris')).toHaveAttribute('data-disabled');
        expect(box('Odd Mod')).not.toBeChecked();
        expect(box('Odd Mod')).not.toHaveAttribute('data-disabled');
        expect(box('Lithium')).not.toBeChecked();
        expect(box('Lithium')).not.toHaveAttribute('data-disabled');
        expect(box('Ghost')).toHaveAttribute('data-disabled');
        expect(screen.getByText('1 of 5 will be installed')).toBeVisible();
    });

    it('strikes out a client-only row, gives its reason, and cannot be ticked', async () => {
        await preview();

        const name = screen.getByText('Iris');

        expect(name.className).toContain('line-through');
        expect(screen.getByText('Client-only: it is a shader loader.')).toBeVisible();
        expect(screen.getByText('Client-only')).toBeVisible();

        fireEvent.click(box('Iris'));

        expect(box('Iris')).not.toBeChecked();
        expect(screen.getByText('1 of 5 will be installed')).toBeVisible();
    });

    it('shows the match type and side of each row', async () => {
        await preview();

        expect(screen.getByText('Link')).toBeVisible();
        expect(screen.getByText('File')).toBeVisible();
        expect(screen.getAllByText('Name')).toHaveLength(2);
        // Only matched rows carry a side badge; an unmatched row has nothing to verify.
        expect(screen.getAllByText('Unverified')).toHaveLength(1);
        expect(screen.getByText('No matching project was found on Modrinth or CurseForge.')).toBeVisible();
    });

    it('selects all compatible rows, leaving unverified ones to the user', async () => {
        await preview();
        fireEvent.click(box('Sodium'));

        expect(screen.getByText('0 of 5 will be installed')).toBeVisible();

        fireEvent.click(screen.getByRole('button', { name: 'Select all compatible' }));

        expect(box('Sodium')).toBeChecked();
        expect(box('Lithium')).toBeChecked();
        expect(box('Odd Mod')).not.toBeChecked();
        expect(box('Iris')).not.toBeChecked();
        expect(screen.getByText('2 of 5 will be installed')).toBeVisible();
    });

    it('installs exactly the ticked rows through POST /import/prism/install', async () => {
        await preview();
        fireEvent.click(box('Odd Mod'));
        fireEvent.click(screen.getByRole('button', { name: 'Select all compatible' }));
        fireEvent.click(box('Sodium'));

        expect(screen.getByText('2 of 5 will be installed')).toBeVisible();
        fireEvent.click(screen.getByRole('button', { name: 'Install selected' }));

        await waitFor(() => expect(calls('post', '/import/prism/install')).toHaveLength(1));
        expect(calls('post', '/import/prism/install')[0]?.body).toEqual({
            items: [
                { provider: 'curseforge', project_id: 'odd', version_id: 'odd-v' },
                { provider: 'modrinth', project_id: 'lith', version_id: 'lith-v' },
            ],
        });
        expect(await screen.findByText(/Installing 2 mods/)).toBeVisible();
    });

    it('disables Install selected with nothing ticked, and hides it without mods.install', async () => {
        await preview();
        fireEvent.click(box('Sodium'));

        expect(screen.getByRole('button', { name: 'Install selected' })).toBeDisabled();
        cleanup();
        host?.dispose();

        await openImport(['mods.read']);
        fireEvent.change(await screen.findByLabelText('Mod list'), { target: { value: 'Sodium' } });
        fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
        await screen.findByText(/will be installed/);

        expect(screen.queryByRole('button', { name: 'Install selected' })).not.toBeInTheDocument();
    });
});

describe('import: progress tray', () => {
    const startImport = async () => {
        prismItems = [
            {
                line: 1,
                name: 'Sodium',
                matched: {
                    provider: 'modrinth',
                    project_id: 'sod',
                    version_id: 'sod-v',
                    title: 'Sodium',
                    icon_url: null,
                },
                match: 'url',
                side: 'both',
                compatible: true,
                selected: true,
            },
        ];
        await openImport();
        fireEvent.change(await screen.findByLabelText('Mod list'), { target: { value: 'Sodium' } });
        fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Install selected' }));
    };

    it('polls the operation every two seconds until it succeeds, then asks for a restart', async () => {
        operations = [
            { id: 7, kind: 'mods', status: 'running' },
            { id: 7, kind: 'mods', status: 'succeeded' },
        ];
        await startImport();

        const tray = await screen.findByRole('status', { name: 'Import progress' });

        expect(tray).toHaveTextContent('Installing 1 mod…');
        expect(within(tray).getByRole('link', { name: 'View log' })).toHaveAttribute('href', '/server/a1b2c3d4');
        expect(calls('get', '/software/operations/7')).toHaveLength(1);

        await waitFor(() => expect(tray).toHaveTextContent('1 mod installed. Restart the server to load them.'), {
            timeout: 5000,
        });
        expect(calls('get', '/software/operations/7').length).toBeGreaterThanOrEqual(2);

        const polled = calls('get', '/software/operations/7').length;

        await act(async () => {
            await new Promise((resolveWait) => setTimeout(resolveWait, 2300));
        });
        // A finished operation is not polled again.
        expect(calls('get', '/software/operations/7')).toHaveLength(polled);
        expect(screen.getAllByText('Changes take effect after a restart.').length).toBeGreaterThan(0);
    }, 15000);

    it('reports a failed operation with its error', async () => {
        operations = [{ id: 7, kind: 'mods', status: 'failed', error: 'Hash mismatch for sodium.jar' }];
        await startImport();

        expect(await screen.findByText(/The import failed: Hash mismatch for sodium\.jar/)).toBeVisible();

        fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

        await waitFor(() => expect(screen.queryByRole('status', { name: 'Import progress' })).not.toBeInTheDocument());
    });
});
