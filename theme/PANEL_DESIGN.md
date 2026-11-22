# Astrelyse panel theme — design and build contract

The contract for the Astrelyse theme of the Pterodactyl panel. It **extends** the site's `DESIGN.md` (repo root):
everything there about the two glass tiers, tokens, the rim, the lens and accessibility is binding here too. This file
says what is different in the panel, how the theme is built, and who owns which files. If code and this file
disagree, this file wins; if this file is wrong, say so in your report instead of quietly diverging.

Built by DPDX Development for Astrelyse. Every new file carries the DPDX banner, the ownership clause and the credit
footer: copy them from `theme/astrelyse/src/lens.ts` (TypeScript) or `theme/astrelyse/src/theme.css` (CSS).

## 0. Decisions (made by the founders, do not reopen)

- **Panel version: Pterodactyl `v2.0.0-beta.2`**, cloned at `pterodactyl/panel/` (its own git repository; never edit
  it, never commit to it). v2 has an official theme API, so the reskin is a **theme extension**, not a fork.
- The theme lives in `pterodactyl/theme/astrelyse/` and is built with the panel's SDK (`@pterodactyl/sdk`, linked
  from `panel/packages/sdk`). The guide is `panel/packages/sdk/THEMES.md`. **Read it before writing a view or a skin.**
  The worked example is `panel/packages/sdk/docs-samples/aurora/`.
- Dark only. Fonts are the site's: **Geist** (text), **Ancola** (headings, `font-header`), **Geist Mono** (console,
  code, identifiers). They are bundled in `src/fonts/`.
- **The admin area gets the same Liquid Glass as the rest of the panel** (reversed by the founders on 2026-11-16; it was
  "not restyled beyond tokens and skins"). The admin pages are upstream's, not views, so the theme reaches them through
  `layout.admin` (a wrapper marked `data-ast-area="admin"`), the UI kit skins and `src/styles/admin.css`, whose every
  selector sits under that attribute. Streams A–D are finished: their "foundation, do not edit" rule is lifted for the
  registration edits stream E needs (`theme.tsx`, the `theme.css` import, `views/shell/index.ts`). Everything else in this
  file still binds the admin area (still backdrop, no ambient motion, 120 ms hover, dense text on near-solid fills, lists
  are plain fills, at most 28 lenses, no glass on glass, the three accessibility media queries).

## 1. What is different from the landing page

The landing page is a show: the background moves, glass drifts, springs are long. **The panel is a tool the customer
operates.** The founders' brief, verbatim in spirit: it must feel like the same material as the site, with real
refraction, but the user must feel in control of it, and it must be highly responsive.

| | Landing page | Panel |
| --- | --- | --- |
| Backdrop | Animated (globe, starfield, orb) | **Completely still.** Fixed pools of brand light on `#05060A`. No drift, parallax or loop |
| Light on the rim | Follows pointer, drifts with scroll | Follows the **pointer only**, settles fast. Nothing moves unless the user moves |
| Hover | `.7s` spring | Tint and glow in **120ms** (`--t-fast`) |
| Press | `.14s` | **80ms** (`--t-press`), scale `.96` |
| Release | `.7s` spring | **320ms** spring (`--t-release`) |
| Ambient motion | Satellites bob | **None.** No idle shimmer, no looping animation, no entrance choreography |
| Page transitions | n/a | Instant. Do not add fade-ins or staggered reveals to pages or lists |

Rules that follow from this:

1. **Feedback is immediate and caused by the user.** Every control answers hover, focus and press within 120ms. A
   state change the user asked for (start a server, save a file) shows a pending state at once, never a silent wait.
2. **Nothing animates by itself.** The only self-running motion allowed is a spinner and live data updating (console
   output, graphs, stats). Data may change; chrome may not.
3. **Never block the pointer.** No overlay, transition or animation may delay a click. No `pointer-events:none`
   during transitions on things the user is trying to use.
4. **Dense text is not clear glass.** Console, editor, tables and long forms sit on near-solid fills
   (`--terminal-background`, `--editor-background`, `.fill`) inside a material card.
5. **Layout does not shift under the pointer.** Hover never changes size or position of neighbours; use `scale`,
   tint and light, never margin, padding or border width.

## 2. The classes (defined in `src/theme.css`)

| Class | Tier | Use for |
| --- | --- | --- |
| `lq` | Liquid Glass | Floating controls: buttons, the hamburger, the search trigger, chips, the power control cluster |
| `lq-touch` | | Add to **interactive** `lq`: pointer glow, tint step, press and release spring |
| `lq-primary` / `lq-danger` / `lq-caution` | | Tinted glass: the one primary action in a region (green), destructive (red), kill/force (orange) |
| `lq-nav` | | The navigation capsule: darker tint, more frost |
| `mat` | Material | Content containers: cards, stat tiles, chart cards, the console frame, the file manager frame |
| `mat-float` | | Add to `mat` for layers floating over arbitrary content: menus, select popups, dialogs, tooltips |
| `fill`, `fill-hover` | Plain fill | Anything **inside** a material surface: rows, inner tiles, inputs' neighbours. No backdrop-filter |

- Tune glass with `--lg-tint`, `--lg-drop`, `--lg-frost` (and `data-lg="<n>"` for refraction strength). Never set
  `background`, `box-shadow` or `backdrop-filter` on a glass element directly.
- `lq` and `lq-touch` own `::before` (rim) and `::after` (glow). Never reuse them; add a child element instead.
- An `lq` element needs a `border-radius`. Controls are capsules (`rounded-full`); containers use `rounded-3xl`
  (cards), `rounded-2xl` (rows, inner tiles).
- **Do not stack glass on glass.** A `mat` surface is a backdrop root: an `lq` inside it cannot see the page, so the
  lens skips it automatically (it keeps rim, glow and tint). Inside a card prefer a tinted button or a `fill`.
- **Lists are plain fills.** A row is `fill fill-hover`, never `mat` or `lq`: a list can run to hundreds of rows and
  each backdrop-filter costs a blur every frame its backdrop changes.
- The lens (`src/lens.ts`) finds `.lq` elements by itself as pages mount and unmount. It is capped at 28 lenses and
  skips elements larger than 520×140 px; a bigger surface must be `mat`. Do not call it or copy it.
- Colour roles are the panel's tokens (`bg-card`, `text-muted-foreground`, `bg-primary`, …), already mapped to the
  site palette in `theme.css`. Brand utilities: `ast-blue`, `ast-blue-deep`, `ast-lav`, `ast-green`, `ast-ink-3`.
  Text on clear glass is `text-foreground` or `text-muted-foreground`, never dimmer.
- Green means "go" and "online" only. One `lq-primary` per region.

## 3. Accessibility (not optional)

`theme.css` already handles `prefers-reduced-transparency`, `prefers-contrast: more` and `prefers-reduced-motion` for
the classes above. Anything you add must hold up under all three, keep a visible focus ring (`2px solid var(--lav)`,
offset 3px, already global), label every control, and name navigation landmarks. Motion is never the only signal.

## 4. How the theme is built

```
pterodactyl/
  PANEL_DESIGN.md            this file
  panel/                     upstream v2.0.0-beta.2 (read-only reference; SDK built in packages/sdk)
  theme/astrelyse/
    extension.json           manifest (theme id "astrelyse", dark only, settings: logo, lens)
    src/theme.css            fonts, tokens, both tiers, backdrop, a11y   ← foundation, do not edit
    src/lens.ts              light, touch glow, refraction lens          ← foundation, do not edit
    src/theme.tsx            entry: skins + the three view registries    ← foundation, do not edit
    src/skins/               UI kit skins                                 ← stream D
    src/styles/kit.css       data-ui hooks for primitives                 ← stream D
    src/views/shell/         + src/styles/shell.css                       ← stream A
    src/views/console/       + src/styles/console.css                     ← stream B
    src/views/server/        + src/styles/server.css                      ← stream C
    src/views/admin/         + src/styles/admin.css (layout.admin, scoped) ← stream E
    preview/                 static look-books (http://localhost:4319; admin.html is the admin one) ← foundation
```

Commands, all run in `pterodactyl/theme/astrelyse/`:

```sh
npx pterodactyl-theme list                 # every view, its kind and fixtures
npx pterodactyl-theme eject <view> --out src/views/<your-stream>   # copy classic's source to start from
npx pterodactyl-theme skins <Primitive> --out src/skins            # copy classic's skin (stream D)
npx tsc                                    # type-check
npm run build                              # writes dist/
npx vitest run --reporter=default          # tests (they read dist/, so build first)
```

There is **no PHP on this machine and no running panel**. `npm run doctor`, `types` and `pack` cannot run here.
Verification is: `npx tsc` clean, `npm run build` clean, and `renderView` tests against the SDK's fixtures. Final
checks against a live panel and node happen later; say plainly in your report what you could not verify.

## 5. Working rules for every stream

- Several sessions work **at the same time in this one folder, with no git**. Touch only your own files (table in
  section 4). Never edit `theme.css`, `lens.ts`, `theme.tsx`, `extension.json`, `package.json`, another stream's
  folder, anything under `panel/`, or anything outside `pterodactyl/`. If you need a foundation change (a token, a
  class, a setting), do not make it: put the exact request in your report.
- Register views only in your own `src/views/<stream>/index.ts`. Wrap pages and blocks in `lazyView`. Only
  `layout.auth` and thin layouts may be eager.
- **Keep every slot.** A layer that replaces a view must render that view's slots (THEMES.md, "What a theme must not
  do"). Prefer `<Default />` plus a frame, or re-placing the same blocks, over rewriting a page. Rewrite only where
  the classic markup cannot carry the design.
- Never bypass the engine: forms spread `fieldProps` and submit through the model; actions go through
  `model.actions`. A view decides what to show, never how data is fetched.
- Tailwind classes only, no prefix; no CSS imported from JavaScript (the build fails). Page-specific CSS goes in your
  own `src/styles/<stream>.css` inside `@layer components`.
- Tests go in your own folder as `*.spec.tsx`, using `renderView` with fixtures, one per view you override, covering
  at least the default fixture and one empty/loading/error fixture where the view has one.
- `dist/` is shared by all streams' builds. If a build or a test fails on a half-written `dist/` file, run the build
  again; never delete `dist/`.
- Do not run `npm install`, do not start a dev server, do not run `graphify update`. If you need a package, stop and
  report it.
- Finish with `npx tsc` and `npm run build` clean and your tests passing, and report: views overridden, anything you
  left classic and why, foundation changes you need, and what you could not verify without a live panel.

## 6. Stream scopes

| Stream | Owns | Views |
| --- | --- | --- |
| **A · Shell** | `src/views/shell/**`, `src/styles/shell.css` | `layout.app`, `layout.auth`, `layout.account` (thin), `app.search`, `page.auth.*`, `page.dashboard`, `dashboard.*`, `page.account.*`, `account.*`, `activity.log` |
| **B · Console and files** | `src/views/console/**`, `src/styles/console.css` | `layout.server`, `page.server.console`, `server.power`, `server.terminal`, `server.stats`, `server.graphs`, `server.feature.*`, `page.server.files`, `page.server.files.editor`, `server.files.*` |
| **C · Server pages** | `src/views/server/**`, `src/styles/server.css` | `page.server.databases`, `backups`, `schedules`, `schedules.detail`, `users`, `users.create`, `network`, `startup`, `settings`, `activity` and their blocks (`server.databases`, `server.backups`, `server.schedule*`, `server.subuser*`, `server.allocations`, `server.startup.*`, `server.rename`, `server.reinstall`, `server.sftp`, `server.debug`), plus `server.conflict` |
| **D · UI kit** | `src/skins/**`, `src/styles/kit.css` | No views. Skins for all 31 primitives (Button, Card, ListRow and PageHeading exist as the reference) |
| **E · Admin** | `src/views/admin/**`, `src/styles/admin.css`, `preview/admin.html` | `layout.admin` only (wrapper `data-ast-area="admin"`); the admin pages are not views, so everything else is scoped CSS under that attribute. Skin fixes it needs go in `src/skins/` and must not change customer pages |

## 7. Structure and navigation (revised by the founders; supersedes any earlier brief)

**The panel keeps Pterodactyl's structure: one page per job.** Console, Files, Databases, Schedules, Users, Backups,
Network, Startup, Settings and Activity are separate pages, exactly as in stock Pterodactyl. Never merge pages, never
put a second page's content on a page (no files or backups on the console page), and keep each page's content what
classic puts there. The theme changes how the panel looks, not what is where.

**Navigation is one menu, opened by a hamburger button.** So A and B agree without talking:

- `layout.app` (stream A) draws a slim **top bar**, always the same on every page: hamburger button, brand, the
  `app.search` trigger, and the user menu (avatar, account, sign out). **Nothing page-specific or server-specific
  ever goes in the top bar**: no server tabs, no power buttons, no server name. It is the same bar on the dashboard,
  in the account pages and inside a server.
- The hamburger opens **the menu**: a side panel (`mat mat-float`) holding *all* navigation. First the global links
  (`model.links`: Dashboard, Admin for root admins, Account) between the `nav.items.before` / `.after` slots. Then,
  when the user is inside an area, that area's own pages from `model.area` (THEMES.md, "The shell knows the area"):
  inside a server, the server's name and state, then Console, Files, Databases, Schedules, Users, Backups, Network,
  Startup, Settings, Activity (whatever `area.nav.items` gives, plus `area.adminLink`), with the area's
  `*.navigation.before` / `.after` slots. In the account area, the account pages. The active page is marked with a
  tinted fill.
- On wide screens (`lg` and up) the menu is a sidebar that stays open beside the page and the hamburger collapses or
  reopens it; the choice is remembered (localStorage). Below `lg` it is a drawer over the page that closes when a
  link is followed, on Escape and on a click outside, and traps focus while open. Opening and closing takes at most
  160ms and is instant under reduced motion. Page content never jumps sideways while the pointer is over it.
- Because the shell draws every area's navigation, `layout.account`, `layout.server` and `layout.admin` do **not**
  draw tabs. `layout.account` and `layout.admin` are thin layouts (page in `<Main>`). `layout.server` (stream B)
  draws only the **server header** above the page, inside the page column: the server's name, identifier in mono,
  live state chip and the `server.power` cluster (hidden while `model.conflict` is set), then the page in `<Main>`.
  The power buttons therefore exist only inside a server, never in the global bar.

**Stats always show usage against what the plan allows.** A CPU, memory or disk reading is never a bare number:
show the value *and its limit* (`38% of 200%`, `2.41 GiB of 4 GiB`, `7.9 GiB of 20 GiB`), with a thin meter, and
"Unlimited" when the limit is 0. `ServerStatMetric` carries `limit` and `alarm`; pass `alarm` through as the tone.
This applies to the console's stat tiles (`server.stats`), the dashboard's server cards
(`dashboard.serverCard.metrics`) and anywhere else a metric appears. Network and uptime have no limit and show the
value alone.
