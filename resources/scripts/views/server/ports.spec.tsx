/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { AxiosAdapter } from 'axios';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import http from '@/api/http';
import type { ServerPorts } from '@/api/server/ports';
import { createExtensionTestHost, createTestServer, type ExtensionTestHost } from '@/sdk/testing';
import { View } from '@/views/View';

let host: ExtensionTestHost | undefined;
let requests: { method: string; url: string; body: unknown }[];
let ports: ServerPorts;
const adapter = http.defaults.adapter;

const basePorts = (): ServerPorts => ({
    roles: [
        {
            role: 'PORT',
            required: true,
            allocation: { id: 1, ip: '203.0.113.10', ip_alias: null, port: 25565 },
            auto: true,
            status: 'free',
            reason: null,
        },
        {
            role: 'QUERY_PORT',
            required: false,
            allocation: { id: 2, ip: '203.0.113.10', ip_alias: null, port: 25566 },
            auto: false,
            status: 'in_use',
            reason: 'The port is already in use by another server on the node.',
        },
    ],
    free_allocations: [{ id: 3, ip: '203.0.113.10', ip_alias: null, port: 25580 }],
    settings: { file_name: '.env', format: 'dotenv', mode: 'managed', conflict_policy: 'warn', extra: [] },
    restart_required: false,
    allocation_limit: 5,
    allocation_count: 3,
    can_add_role: true,
    variables: { PORT: '25565', QUERY_PORT: '25566' },
});

const respond = (method: string, url: string) => {
    if (url.endsWith('/preview')) {
        return {
            attributes: {
                path: '.env',
                mode: 'managed',
                format: 'dotenv',
                content: '# >>> astrelyse ports\nPORT=25565\n# <<< astrelyse ports\n',
                conflicts: [],
                writes_file: true,
            },
        };
    }

    return method === 'put'
        ? { attributes: ports, meta: { write: { written: true, error: null, conflicts: [] } } }
        : { attributes: ports };
};

beforeEach(() => {
    requests = [];
    ports = basePorts();
    http.defaults.adapter = (async (config) => {
        const body: unknown = config.data ? JSON.parse(String(config.data)) : undefined;
        const method = config.method ?? 'get';
        const url = config.url ?? '';

        requests.push({ method, url, body });

        const data = respond(method, url);

        return { data, status: 200, statusText: 'OK', headers: {}, config };
    }) satisfies AxiosAdapter;
});

afterEach(() => {
    cleanup();
    host?.dispose();
    host = undefined;
    http.defaults.adapter = adapter;
});

async function renderCard(children: ReactNode, permissions?: string[]) {
    const server = createTestServer({ identifier: 'a1b2c3d4', owner: !permissions, permissions });

    host = createExtensionTestHost({ server });
    await act(async () => {
        render(children, { wrapper: host!.Wrapper });
    });

    return server;
}

describe('ports and environment card', () => {
    it('lists the port roles with their status', async () => {
        await renderCard(<View name='server.ports' />);

        expect(await screen.findByText('QUERY_PORT')).toBeVisible();
        expect(screen.getByText('203.0.113.10:25565')).toBeVisible();
        expect(screen.getByText('In use')).toBeVisible();
        expect(screen.getAllByText('The port is already in use by another server on the node.')[0]).toBeVisible();
    });

    it('shows the file as it would be written', async () => {
        await renderCard(<View name='server.ports' />);

        await waitFor(() => expect(screen.getByLabelText('Environment file preview')).toHaveTextContent('PORT=25565'));
    });

    it('previews once on load and once per edit, never in a loop', async () => {
        await renderCard(<View name='server.ports' />);

        const previews = () => requests.filter((request) => request.url.endsWith('/preview')).length;

        await waitFor(() => expect(screen.getByLabelText('Environment file preview')).toHaveTextContent('PORT=25565'));
        // Long enough for several debounce cycles; a render-triggered loop would fire one per cycle.
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 1500));
        });
        expect(previews()).toBe(1);

        fireEvent.change(screen.getByLabelText('Environment file name'), { target: { value: 'ports.env' } });
        await waitFor(() => expect(previews()).toBe(2));
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 1000));
        });
        expect(previews()).toBe(2);
    });

    it('hides Reassign automatically from everyone but root admins', async () => {
        await renderCard(<View name='server.ports' />);

        expect(await screen.findByText('QUERY_PORT')).toBeVisible();
        expect(screen.getByRole('button', { name: 'Add role' })).toBeVisible();
        expect(screen.queryByRole('button', { name: 'Reassign automatically' })).not.toBeInTheDocument();
    });

    it('shows Reassign automatically to a root admin', async () => {
        const server = createTestServer({ identifier: 'a1b2c3d4', owner: true });

        host = createExtensionTestHost({
            server,
            user: {
                uuid: 'root',
                username: 'root',
                email: 'root@example.test',
                language: 'en',
                rootAdmin: true,
                useTotp: false,
                createdAt: new Date(0),
                updatedAt: new Date(0),
            },
        });
        await act(async () => {
            render(<View name='server.ports' />, { wrapper: host!.Wrapper });
        });

        expect(await screen.findByRole('button', { name: 'Reassign automatically' })).toBeVisible();
    });

    it('is read-only without the settings.ports permission', async () => {
        await renderCard(<View name='server.ports' />, ['websocket.connect']);

        expect(await screen.findByText('QUERY_PORT')).toBeVisible();
        expect(screen.getByText(/needs the settings.ports permission/)).toBeVisible();
        expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Regenerate now' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Add role' })).not.toBeInTheDocument();
        expect(screen.getByLabelText('Environment file name')).toBeDisabled();
    });

    it('warns when a restart is required', async () => {
        ports = { ...basePorts(), restart_required: true };
        await renderCard(<View name='server.ports' />);

        expect(await screen.findByText('Restart required')).toBeVisible();
    });

    it('saves the file settings', async () => {
        const server = await renderCard(<View name='server.ports' />);
        const input = await screen.findByLabelText('Environment file name');

        fireEvent.change(input, { target: { value: 'config/ports.env' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));

        await waitFor(() => {
            const save = requests.find((request) => request.method === 'put');

            expect(save?.url).toBe(`/api/client/servers/${server.attributes.uuid}/settings/ports`);
            expect(save?.body).toMatchObject({ settings: { file_name: 'config/ports.env', mode: 'managed' } });
        });
    });

    it('adds a role automatically', async () => {
        await renderCard(<View name='server.ports' />);

        fireEvent.change(await screen.findByLabelText('New port role'), { target: { value: 'rcon_port' } });
        fireEvent.click(screen.getByRole('button', { name: 'Add role' }));

        await waitFor(() => {
            const change = requests.find((request) => request.method === 'put');

            expect(change?.body).toEqual({ roles: [{ role: 'RCON_PORT', auto: true, allocation_id: null }] });
        });
    });

    it('regenerates the file now', async () => {
        const server = await renderCard(<View name='server.ports' />);

        fireEvent.click(await screen.findByRole('button', { name: 'Regenerate now' }));

        await waitFor(() =>
            expect(
                requests.some(
                    (r) =>
                        r.method === 'post' &&
                        r.url === `/api/client/servers/${server.attributes.uuid}/settings/ports/regenerate`
                )
            ).toBe(true)
        );
    });
});
