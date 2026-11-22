/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, expect, it } from 'vitest';
import { publishAreaNav } from '@/router/nav';
import {
    createExtensionTestHost,
    createTestServer,
    type ExtensionTestHost,
    type TestServerOptions,
} from '@/sdk/testing';
import { useNavigation } from './navigation';

let host: ExtensionTestHost | undefined;

beforeAll(() => {
    publishAreaNav('server', [
        { segment: '', label: 'Console', exact: true },
        { segment: 'files', label: 'Files', permission: 'file.*' },
        { segment: 'players', label: 'Players', profiles: ['game'] },
        { segment: 'releases', label: 'Releases', profiles: ['bot', 'web'] },
    ]);
});

afterEach(() => {
    cleanup();
    host?.dispose();
    host = undefined;
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

async function tabsFor(options: TestServerOptions) {
    host = createExtensionTestHost({
        server: createTestServer({ identifier: 'abc', permissions: ['file.read'], owner: false, ...options }),
        path: '/server/abc',
    });

    await act(async () => {
        render(<Items />, { wrapper: host!.Wrapper });
    });

    return screen.getAllByRole('listitem').map((entry) => entry.textContent);
}

it('shows game-only tabs to game servers only', async () => {
    expect(await tabsFor({ workloadProfile: 'game' })).toEqual(['Console', 'Files', 'Players']);
});

it('shows each tab to the profiles it names', async () => {
    expect(await tabsFor({ workloadProfile: 'bot' })).toEqual(['Console', 'Files', 'Releases']);
});

it('hides tabs a profile has no use for', async () => {
    expect(await tabsFor({ workloadProfile: 'database' })).toEqual(['Console', 'Files']);
});

it('keeps every tab for generic servers so nothing regresses', async () => {
    expect(await tabsFor({ workloadProfile: 'generic' })).toEqual(['Console', 'Files', 'Players', 'Releases']);
});
