# Astrelyse Client UI — Build Lanes

How `ASTRELYSE_CLIENT_UI_PLAN.md` is split into parallel implementation sessions. Each lane owns a set of files; two
lanes never write the same file except where noted under "Shared files".

## Ground rules for every lane

- Work **in this checkout** (`/Users/ayush/Documents/Astrelyse/panel`), on the current branch. The branch has ~200
  uncommitted changes that worktrees would not see. **Commit nothing, switch no branch, stash nothing, never
  `git checkout -- <file>` or `git restore` a file you did not create.**
- **Build for the Astrelyse theme** (see `CLAUDE.md`): it replaces the shell, dashboard, console, settings and
  server-page views, so a classic-only change does not show on the real panel. Phases 1–2 missed this; the T-A/T-B/T-C
  sessions are porting them.
- Design contract: `../front-end landing/DESIGN.md` and `../front-end landing/pterodactyl/PANEL_DESIGN.md` win over the
  plan on look and motion (no idle animation, no fade-ins, no glass-on-glass, 120/80/320 ms timings).
- Open-question defaults (plan section 10): env file = managed block in `.env`; saved commands shared with subusers
  (backend storage); bot vitals read a bot-exposed status endpoint only (no token); linked-service variables injected
  only after the user confirms the link; auto-assignment capped by the server's existing `allocation_limit`.
- Checks before reporting done: `npm run tsc`, `npm run lint`, `npm test` (vitest), and the PHP test suite for any PHP
  you touched (`composer.json` scripts / `vendor/bin/pest` or `php artisan test`). Report failures honestly; pre-existing
  failures unrelated to your lane can be noted, not fixed.
- After code changes, run `graphify update .` (repo CLAUDE.md rule).

### Shared files (edit additively, re-read immediately before each edit)

- `app/Models/Egg.php` and egg import/export: lane P1-C adds `workload_profile`, lane P1-B adds `port_spec`.
- `resources/lang/en/*`: add keys only; never reorder or reformat.
- `packages/sdk/**` generated types: regenerate with `npm run sdk:generate` only at the end of your lane; it is
  deterministic, so the last run includes every lane's changes.

## Phase 1 (running now)

| Lane | Scope | Owns |
| --- | --- | --- |
| **P1-A Primitives** | Plan §7: `StatusDot`, `Drawer`, `Tabs`, `Breadcrumb`, `Stepper`, `Skeleton`, `KeyboardShortcut` (+ `?` overlay), `SecretField` (on `SecretInput`); register in `themes/primitives.ts`; Astrelyse skin rules; density/accent options in `ThemeSettingsDialog` | `resources/scripts/components/elements/**` new files, `themes/primitives.ts`, `themes/skins*`, `../front-end landing/pterodactyl/theme/astrelyse/**` |
| **P1-B Ports & env** | Plan §5 whole: migrations, `port_spec`, bindings, env settings, auto-assign, guards, `EnvironmentService` injection, env-file writer, API, `settings.ports` permission, Settings card, Network role column | `app/Services/Servers/**` (new + `EnvironmentService`, `SubuserPermissionCatalog`), new controllers/requests, `routes/api-client.php`, `views/server/settings/**`, `views/server/network/**` |
| **P1-C Workload profiles** | Plan §2 profile part: egg `workload_profile` (game, bot, web, database, lavalink, generic), exposed on server API, `ServerLayout` tab filtering, dashboard workload icon + type filter row | `views/layout/ServerLayout.tsx`, `views/dashboard/**`, server API transformer/resource, admin egg form field |

Phase 1 status: done and verified (2026-11-19). Remaining suite failures belong to the uncommitted roles/auth work.

## Phase 2 (running now)

All lanes use the Phase 1 primitives (`StatusDot`, `Drawer`, `Tabs`, `Skeleton`, `KeyboardShortcut` registry,
`SecretField`) instead of hand-rolling. Paths below are under `resources/scripts/themes/classic/views/` unless
absolute.

| Lane | Scope | Owns |
| --- | --- | --- |
| **P2-A Command palette** | Plan §3.1 palette: ⌘K/Ctrl+K, fuzzy servers/pages/actions, grouped, recent first, keyboard nav; register shortcuts with the P1-A registry | `layout/Search.tsx`, `layout/AppLayout.tsx`, new palette files |
| **P2-B Console** | Plan §3.1 console toolbar, saved commands (shared with subusers, backend storage), prompts as a card stack, structured log viewer | `server/console/Terminal.tsx`, `server/console/ConsolePage.tsx`, `server/console/prompts/**`, `components/server/console/**`, `components/server/features/**`, saved-commands backend |
| **P2-C Power and stats** | Plan §3.1 power split button (+ delayed restart with warning) and sparkline stats, `ProgressBar` thresholds | `server/console/Power.tsx`, `server/console/Stats.tsx`, `components/elements/ProgressBar.tsx` |
| **P2-D Dashboard** | Plan §4.1 whole: card upgrades (StatusDot, copy address, mini CPU sparkline, pin), grid/list, grouping, filter chips, persisted per user, bulk actions, empty/onboarding state | `dashboard/**`, pin/preference backend |

Shared in Phase 2: `routes/api-client.php`, `SubuserPermissionCatalog.php`, `resources/lang/en/*` (additive edits
only, re-read before each edit). P2-C must not edit `ConsolePage.tsx`; ask P2-B's owner via the report if a layout
change there is needed.

Phase 2 status: done and verified (2026-11-20). Open: the packed SDK is stale because `sdk:generate` fails on the
untracked mods work; the new pages have not been viewed in a browser.

## Later phases

| Phase | Lanes |
| --- | --- |
| 2 | Command palette (`layout/Search`) · console toolbar + saved commands + prompt card stack · power split button + sparkline stats · server card upgrades (StatusDot, copy, pin) + dashboard grid/list, filters, bulk |
| 3 | Timeline scrubber + graph annotations · crash autopsy · change journal with undo · vitals ring + forecast |
| 4 | Projects + service linking + start order · git deploy + releases · env & secrets manager + runtime picker |
| 5 | Lavalink dashboard/config/snippets · database Connect/allowlist/metrics · domains/traffic/maintenance |
| 6 | Files upgrades · backups upgrades · schedules upgrades · account security · pocket mode |
