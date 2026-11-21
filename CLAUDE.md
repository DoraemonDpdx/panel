# Astrelyse panel

## UI work targets the Astrelyse theme

This panel runs the **Astrelyse** theme (`pterodactyl:theme = astrelyse`), not classic. Every client or admin UI
change must be built so it shows **on the Astrelyse theme**. A change that lives only in the classic views is not done.

- Theme source: **`theme/astrelyse/` in this repo** (`extends: classic`). This is the copy to edit; it is versioned
  with the panel. Run `npm ci` there once (its `node_modules` and `dist` are gitignored); it links this repo's
  `packages/sdk`.
- The old folder `/Users/ayush/Documents/Astrelyse/front-end landing/pterodactyl/theme/astrelyse` is a retired copy.
  Do not edit it, and do not build or publish from it.
- The theme **replaces** these classic views with its own, under `src/views/`:
  - `shell/`: `AppLayout`, `AuthLayout`, `ServerList`, `ServerCard`, `AreaNav`
  - `console/`: `ConsolePage`, `Terminal`, `Power`, `Stats`, `Graphs`, `ServerLayout`, the file manager
  - `server/`: `settings`, `pages`, `startup`, `Frame`
  - `admin/`: `AdminLayout`

  If you change one of these in `resources/scripts/themes/classic/views/`, make the same change in the theme's version.
  Views the theme does not replace fall through to classic.
- Shared logic (models, API clients, primitives in `resources/scripts/components/**`, SDK exports) belongs in the panel.
  Both themes then render it. Skin new primitives in the theme's `src/skins` and `src/styles` as well as classic.
- Look and motion follow `DESIGN.md` and `theme/PANEL_DESIGN.md` in this repo (Liquid Glass, still backdrop, no idle
  animation, no glass on glass). They win over any plan file.

## Seeing a change in the browser

- The panel serves **built** assets, not a Vite dev server. After frontend changes, run `npx vite build` in this repo
  (`npm run build` also runs `sdk:generate` first).
- After theme changes, build and publish the theme in one step:
  `php artisan p:extension:dev theme/astrelyse`.
  The panel serves the theme from `public/assets/extensions/astrelyse/<hash>/`, so copying `dist/` into
  `extensions/astrelyse/` alone does not change what the browser loads.
- Tests run against classic views, so passing tests do not prove a feature shows on Astrelyse. Check the real page.

## Feature plan

`ASTRELYSE_CLIENT_UI_PLAN.md` is the feature plan. `ASTRELYSE_CLIENT_UI_BUILD.md` tracks how it is split into phases
and lanes.
