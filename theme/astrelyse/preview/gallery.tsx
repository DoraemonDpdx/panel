// Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse. Proprietary: belongs to DPDX.
// Renders the theme's real views in a browser from the SDK's fixtures: ?view=<name>&fixture=<name>.
import '../dist/theme.css';
import { preloadTheme, renderView } from '@pterodactyl/sdk/testing';
import catalogue from '@pterodactyl/sdk/views.json';
import theme from '../src/theme';

type Entry = { name: string; fixtures?: string[] };
const raw = catalogue as unknown as { views?: Entry[] } | Entry[] | Record<string, { fixtures?: string[] }>;
const entries: Entry[] = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { views?: Entry[] }).views)
      ? (raw as { views: Entry[] }).views
      : Object.entries(raw as Record<string, { fixtures?: string[] }>).map(([name, v]) => ({ name, fixtures: v?.fixtures }));

const params = new URLSearchParams(location.search);
const view = document.getElementById('view') as HTMLSelectElement;
const fixture = document.getElementById('fixture') as HTMLSelectElement;
const err = document.getElementById('err') as HTMLElement;

const current = params.get('view') ?? 'layout.app';
for (const e of entries) view.add(new Option(e.name, e.name, false, e.name === current));
const fixtures = entries.find((e) => e.name === current)?.fixtures ?? [];
const chosen = params.get('fixture') ?? fixtures[0];
for (const f of fixtures) fixture.add(new Option(f, f, false, f === chosen));

const go = (v: string, f?: string) => {
    const q = new URLSearchParams({ view: v });
    if (f) q.set('fixture', f);
    location.search = q.toString();
};
view.onchange = () => go(view.value);
fixture.onchange = () => go(view.value, fixture.value);

try {
    await preloadTheme([theme]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rendered = renderView(current as any, { themes: [theme], fixture: chosen, strict: false } as any);
    if (!rendered.container.isConnected) document.body.prepend(rendered.container);
} catch (e) {
    err.textContent = String(e instanceof Error ? (e.stack ?? e.message) : e);
}
