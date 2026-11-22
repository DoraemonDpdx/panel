// Built by DPDX Development · Bengaluru · dpdx.in · for Astrelyse. Proprietary: belongs to DPDX.
// Browser previews of the theme with no panel behind them (run `npm run build` first):
//   /             a hand-written mock of one page, to judge material and layout
//   /gallery.html the theme's REAL views, rendered from the SDK's fixtures (pick a view and a fixture)
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { pterodactylTestAliases, pterodactylTestDirectory } from '@pterodactyl/sdk/vitest';

const root = fileURLToPath(new URL('.', import.meta.url));
const theme = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
    root,
    resolve: { alias: pterodactylTestAliases({ root: theme }) },
    server: { port: 4319, strictPort: true, fs: { allow: [theme, pterodactylTestDirectory] } },
});
