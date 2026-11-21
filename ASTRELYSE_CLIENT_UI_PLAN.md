# Astrelyse Client UI — Feature Plan

The full set of proposed client-side features for the Astrelyse panel, in one file. It covers every idea from the
planning thread, plus the **automatic port and env file system** (section 5).

This plan **extends** the Astrelyse design contracts and does not replace them:

- `front-end landing/DESIGN.md` (Liquid Glass: tiers, tokens, rim, lens, accessibility)
- `front-end landing/pterodactyl/PANEL_DESIGN.md` (how the panel differs from the landing page)

If this file and those two disagree on look or motion, **they win**. This file only says *what* to build.

> Status: proposal. Nothing here is built. It was written from the file layout of `resources/scripts` and the two
> design docs above, without reading every component. Verify against the code before scoping.

**Tags:** `(new)` = a component or feature that does not exist yet. `(update)` = a change to something that exists.

| Where | What |
| --- | --- |
| `resources/scripts/themes/classic/views/` | Client pages (console, files, backups, schedules, network, startup, settings, account, activity) |
| `resources/scripts/components/` | Shared primitives (`elements`, `ui`, `form`, `server`, `admin`) |
| `resources/scripts/themes/primitives.ts` | The primitive list and the state each skin can read |
| `app/Services/Servers/EnvironmentService.php` | Where server env vars are assembled (hook for section 5) |
| `front-end landing/pterodactyl/theme/astrelyse/` | The Liquid Glass theme extension that skins all of this |

---

## 1. Look and feel contract

Everything below is built in the existing Astrelyse Liquid Glass style. These are the rules that apply to every new
component in this plan.

### 1.1 Principles (from `DESIGN.md`)

1. Glass is a layer, not a decoration: floating controls and navigation only.
2. Content comes first. Glass must never compete with what is behind it.
3. Use full Liquid Glass sparingly. Everything else uses the quieter Material tier.
4. Legibility beats effect. Dense text sits on near-solid fills.
5. Reduced transparency, increased contrast and reduced motion each have a defined fallback. None is optional.

### 1.2 The panel is a tool, not a show (from `PANEL_DESIGN.md`)

| Rule | Consequence for this plan |
| --- | --- |
| Backdrop is completely still | No animated backdrops, parallax or drifting glass |
| Hover in 120 ms, press in 80 ms, release 320 ms spring | Every new control uses `--t-fast`, `--t-press`, `--t-release` |
| Nothing animates by itself | No idle shimmer, no looping pulse. Only spinners and live data may move |
| Pages and lists appear instantly | No fade-ins or staggered reveals |
| Layout never shifts under the pointer | Hover uses scale, tint and light, never size or margin |
| No glass on glass | Nested elements get a tint or a plain fill |
| At most 28 lenses per screen | Lists and tables are plain fills, not one lens per row |

### 1.3 Tokens

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#05060A` | Page background |
| `--bg-2` | `#0A0C14` | Raised background |
| `--ink` | `#F2F4FA` | Primary text |
| `--ink-2` | `#A3A9BC` | Secondary text |
| `--ink-3` | `#6B7189` | Tertiary text |
| `--blue` | `#1846FF` | Brand, glows, info |
| `--lav` | `#B8B8FF` | Accent text, cool light inside glass |
| `--green` | `#39FF14` | Primary action, online state |

Fonts: **Geist** (text), **Ancola** (headings, `font-header`), **Geist Mono** (console, code, identifiers, ports, env
keys). Dark only.

### 1.4 Which tier each new component uses

| Component in this plan | Tier | Notes |
| --- | --- | --- |
| Command palette | Liquid Glass | Floating control layer; results list is a plain fill inside it |
| Drawer / side sheet | Material | Holds content; form fields on near-solid fills |
| Toolbars, chips, split buttons, pickers | Liquid Glass | Capsule shapes |
| Console, editor, logs, tables, env editors | Material, near-solid inner fill | Dense text is never clear glass |
| Cards (server, vitals, security, project) | Material | |
| StatusDot | None | A flat coloured dot; state changes only, no pulse |
| Skeleton | None | Static plain-fill shapes. No shimmer sweep |
| Toasts and prompt cards | Material | Stacked cards, appear instantly |

### 1.5 Adjustments made so the ideas fit the contract

Some earlier ideas assumed animation that the panel forbids. They are kept, redesigned:

| Original idea | Adjusted version |
| --- | --- |
| Metallic logo that flows faster under load | Static metallic mark whose **state** (healthy, busy, offline) changes the paint. It changes when the state changes, never on its own |
| Ambient health tint that shifts | A static edge tint set from the current health state. It changes on state change only |
| Pulsing StatusDot for "starting" | Solid dot plus the existing spinner while a transition is in progress |
| Animated stat sparklines | Sparklines update with live data, which is allowed. No decorative easing |
| Progress "breathing" | Not used |

---

## 2. Workload profiles and projects (the foundation)

The platform hosts Minecraft and other games, Discord bots, Node.js, Python and Go apps, Lavalink, databases and
websites. The panel should adapt to what each service is.

- **(update) Workload-aware layout.** Each egg declares a profile: `game`, `bot`, `web`, `database`, `lavalink` or
  `generic`. `ServerLayout` shows only the relevant tabs and widgets. A bot gets Releases and Env, a database gets
  Connect and Backups, a site gets Domains and Traffic. Game-only parts (player roster) disappear everywhere else.
- **(new) Projects.** A user groups a bot, its database, Lavalink and its website into one project. The project page
  shows a dependency graph, a combined status and combined resource use.
- **(new) One-click service linking.** Attach a database to a bot and `DATABASE_URL` is injected into the bot's env
  automatically. Attach Lavalink and its host, port and password are injected the same way. If a password is rotated,
  linked services update and restart. This uses the port and env system in section 5.
- **(new) Start order.** A project starts services in dependency order (database, then Lavalink, then bot) and waits
  for each health check. Stop runs in reverse.
- **(update) Dashboard.** Group servers by project, show a workload icon, and add a type filter row.

---

## 3. Features for every workload

### 3.1 Console and logs

- **(new) Command palette (`⌘K` / `Ctrl+K`).** Fuzzy-search servers, pages and actions (start, stop, restart,
  back up). Arrow keys and Enter select. Results grouped, recent first. Built on `layout/Search`.
- **(update) Console toolbar.** Log search with highlights, filter chips (errors, warnings, player events), pause
  scroll, clear, download log, timestamps toggle.
- **(new) Saved commands.** Pinned one-click buttons such as `save-all` or `say Restarting`, each with an optional
  confirm step, stored per server. Visible to subusers who have console permission.
- **(update) Console prompts as a card stack.** The EULA, Java, PID-limit, Steam disk, GSL token and Hytale prompts
  become dismissible cards over a corner of the console instead of blocking it. Each carries a short explanation and
  a "fix it for me" button.
- **(update) Structured log viewer.** Detects JSON or leveled logs and adds level filters. Stack traces collapse into
  one expandable block. Useful for Node, Python and Go.
- **(update) Sparkline stats.** Tiny CPU, memory, disk and network lines in `Stats`, from the websocket data that
  already arrives. `ProgressBar` changes tone at thresholds (green below 70%, amber to 90%, red above).
- **(update) Power button as a split button.** `Start` or `Restart` as the main action; Restart, Stop and Kill in a
  dropdown. Kill confirms. Optional "restart in N seconds" that sends a warning first.

### 3.2 Debugging and time

- **(new) Timeline scrubber ("Rewind").** One timeline under the console and graphs. Dragging it moves the console,
  graphs and player count to that moment together. Clicking a CPU spike jumps the console to those log lines. Keeps a
  rolling window (for example 24 hours).
- **(update) Event annotations on graphs.** Vertical markers on `Graphs` for restarts, deploys, backups, file edits,
  setting changes and player peaks, with a hover label.
- **(new) Crash autopsy.** On an unexpected exit, a card assembles the last 30 log lines, the memory graph before the
  crash, files changed in the last hour and any schedule that just ran. It ends in a plain verdict and a fix button.
  It recognises per-runtime causes: `Cannot find module`, `EADDRINUSE`, a missing env var, OOM kills, Python
  tracebacks and Go panics.
- **(new) Change journal with undo.** Every file save, startup variable change and schedule edit becomes a timestamped
  entry, like a git log for the server, each with a diff and an Undo button.
- **(new) Vitals ring.** One 0 to 100 score from CPU, memory, disk, latency or TPS, backup freshness and 2FA state.
  Selecting it shows what drags the score down, with a fix button per item.
- **(new) Resource forecast.** "Disk full in about 6 days at the current growth", plus memory and backup-storage
  trends, shown in `Stats`.
- **(new) Session replay for support.** Record the last N minutes of console as a replayable clip and attach it to a
  support ticket. Staff can scrub through it.

### 3.3 Automation

- **(update) Visual log-trigger builder.** Turns the existing `useConsolePatternTrigger` into a no-code flow: when the
  log matches a pattern, run an action (send command, restart, back up, notify), with a rate condition such as
  "3 times in 5 minutes".
- **(update) Conditional schedules.** Task conditions: "restart at 4am only if no players are online, wait up to 30
  minutes otherwise", "only if memory is above 90%", "only if the last backup is older than 6 hours".
- **(new) Health checks and auto-recovery.** Define an HTTP or TCP check. Repeated failure triggers a restart. A
  crash-loop breaker stops restarting after N failures and raises an alert. A 90-day uptime bar shows history.

### 3.4 Deploy, runtime and secrets (bots, Node, Python, Go, sites)

- **(new) Git deploy with releases.** Connect a repo and branch; a push builds and deploys. A Releases tab lists each
  deploy with commit, build log and status. Rollback to any release is one click.
- **(update) Env and secrets manager.** `StartupVariables` gains masked values, `.env` import and export, secret
  versus plain flags and an audit entry on every reveal.
- **(update) Runtime picker.** `StartupImage` lists Node, Python and Go versions with EOL badges and a
  "newer LTS available" hint.
- **(new) Scripts panel.** Reads `package.json` scripts, `Makefile` targets or a `Procfile` and shows each as a run
  button with its own output.
- **(new) Dependency audit.** Detects `package.json`, `requirements.txt` or `go.mod`, lists outdated and vulnerable
  packages, offers "update and redeploy".
- **(update) Watch mode toggle.** Restart on file change for development servers.
- **(new) Secret leak guard.** Scans logs and files for token and API-key patterns, warns, and offers to redact and
  rotate.

### 3.5 Players and sharing

- **(new) Live player roster.** Parses join and leave lines into a roster with session length. A menu per player for
  kick, op, ban, whitelist and message. A join/leave timeline shows peak hours. Player chat is separated from system
  logs.
- **(new) Guest pass links.** A time-limited, scope-limited, revocable link to a read-only live console or stats view.
- **(new) Public status page.** A shareable page showing online state, player count and connect address, with a custom
  slug and an embeddable badge.
- **(new) Presence and edit locks.** Avatars show who else is on the server. A file being edited by someone else shows
  a lock chip and a view-only option.

---

## 4. Per-page features

### 4.1 Dashboard

- **(update) Server card upgrades.** `StatusDot`, copy-address button (`CopyOnClick`), mini CPU sparkline, pin or
  favourite star.
- **(new) Grid/list toggle, grouping and filters.** Group by project, node, game or tag; filter chips for All,
  Running, Offline, Suspended. Choice persists per user.
- **(new) Bulk actions.** Checkbox per card; an action bar for Start, Stop, Restart with per-server results.
- **(update) Empty and onboarding state.** A first-run `Empty` with steps, and a note for accounts that only have
  subuser access.

### 4.2 Files

- **(new) Quick-open (`⌘P`).** Fuzzy file-name search across the server.
- **(update) Tabbed editor.** Several files open at once, unsaved dots, diff against the saved version.
- **(update) Drag-and-drop move, breadcrumb dropdown, context menu.** Drag a row onto a folder or breadcrumb to move
  it; right-click for Rename, Move, Copy, Archive, Download, Delete, Permissions.
- **(update) Upload tray.** A floating panel with per-file progress, speed, pause, cancel, retry, and folder upload.
- **(new) File previews.** Image, pretty JSON and log tail in `FileDetails`; archive contents before extracting.
- **(new) Editor extras.** Minimap, JSON/YAML/`.properties` validator with inline errors, "restore this file from the
  last backup" as a diff.
- **(new) Schema-aware config editor.** For known files (such as `server.properties`), a form view with toggles,
  sliders and descriptions, switchable to raw text, preserving comments.

### 4.3 Backups

- **(update) Timeline view.** Grouped by day, size-delta badge, storage `ProgressBar` against the limit.
- **(new) Restore wizard.** Pick backup, choose options, review. Warns the server must stop and offers "back up the
  current state first".
- **(update) Lock and protect.** Lock icon per backup, and a "next scheduled backup in 3h 12m" line.

### 4.4 Schedules

- **(update) Visual cron builder.** Replaces `ScheduleCheatsheet`. Pick frequency, see the cron fields it writes and
  the next 5 run times in the user's timezone.
- **(update) Reorderable tasks, run history, run now.** Drag to reorder, a strip of success and failure dots, a
  "Run now" button with live state.
- **(new) Templates.** Nightly restart, hourly backup, warn-then-restart. Pre-fills the schedule and its tasks.

### 4.5 Network

- **(update) Allocations.** One-click copy for `ip:port`, a Primary badge, inline notes, and a **role** per allocation
  (section 5). A port-check indicator if the backend supports it.

### 4.6 Startup

- **(update) Startup variables.** Grouped by category, a "modified from default" badge with reset, and a live
  startup-command preview as you type.

### 4.7 Settings

- **(update) Danger zone.** A red-outlined card for Reinstall and Rename with confirmation dialogs.
- **(update) SFTP card.** Host, port, username and a copyable `sftp://user@host:port` URL with "open in client".
- **(new) Ports and environment card.** The settings page for the automatic port system in section 5.

### 4.8 Account and security

- **(new) Security checklist card.** A score ring covering 2FA, a passkey, password age and saved recovery codes, with
  a fix button per item.
- **(new) Active sessions and devices.** Device, browser, IP and last active, with Revoke and "sign out everywhere
  else". Needs backend session tracking.
- **(update) API keys.** One-time reveal with copy and a "I have saved it" confirmation, a last-used column, expiry
  presets (7, 30, 90 days, never).
- **(update) Activity.** Filters by event type, user and date range, CSV export, and `ActivityMetadataButton` opens a
  drawer instead of a dialog.

---

## 5. Automatic port and env file system

Servers should never need to hard-code a port. The panel assigns ports automatically, names them by role, injects
them as environment variables, and writes them into an env file the app can read. Everything is changeable in
**Server → Settings → Ports and environment**.

### 5.1 Concepts

| Term | Meaning |
| --- | --- |
| Allocation | An `ip:port` on a node, as in the panel today |
| Port role | A named purpose for an allocation, such as `PORT`, `QUERY_PORT`, `RCON_PORT`, `LAVALINK_PORT`, `HTTP_PORT` |
| Port spec | What an egg declares it needs: a list of roles, each marked required or optional |
| Env file | A generated file in the server's root that lists the assigned ports and addresses |
| Mode | How the env file is written: managed block, separate file, or off |

### 5.2 Automatic assignment

1. **(update) Egg declares a port spec.** Each egg lists the roles it needs, for example a Minecraft egg:
   `PORT` (required), `QUERY_PORT` (optional), `RCON_PORT` (optional). A Lavalink egg: `PORT` (required). A website:
   `HTTP_PORT` (required).
2. **(new) Auto-assign on create.** When a server is created, the panel picks free allocations on its node, binds one
   to each required role, and marks the primary allocation as `PORT`.
3. **(new) Auto-assign on demand.** Adding a role in settings picks the next free allocation automatically, up to the
   server's allocation limit. If the limit is reached, it shows a clear message and a link to request more.
4. **(new) Collision and range guard.** A port is never assigned if it is used on the node, below 1024, outside the
   node's configured range, or already bound to another role on the same server.
5. **(new) Manual override.** Any role can be switched from Auto to a chosen allocation from a picker of that server's
   free allocations.

### 5.3 Environment variables injected at start

These are added through the existing `EnvironmentService::setEnvironmentKey()` hook, so they reach the container on
every start with no change to the egg's own variables. Egg variables and configured variables keep priority over
built-ins, as `EnvironmentService` already documents.

| Variable | Value |
| --- | --- |
| `SERVER_IP` | The primary allocation IP (already exists) |
| `SERVER_PORT` | The primary allocation port (already exists) |
| `PORT` | Alias of `SERVER_PORT`, because Node, Python and many hosts expect it |
| `<ROLE>` | One variable per role, for example `QUERY_PORT=25566` |
| `PORT_<n>` | The additional allocations by order, for example `PORT_1`, `PORT_2` |
| `ALLOCATION_LIST` | Comma-separated `ip:port` for every allocation, for apps that bind several |
| `PUBLIC_ADDRESS` | `ip:port` of the primary allocation, or the custom domain if one is linked |

Linked services (section 2) also receive the *other* service's address, such as `LAVALINK_HOST`, `LAVALINK_PORT` and
`DATABASE_URL`, built from the linked server's roles.

### 5.4 The env file

- **(new) Generated on every start,** before the process boots, and again immediately when a port changes.
- **File name:** default `.env`. Changeable in settings (for example `.env.astrelyse` or `config/ports.env`).
- **Format:** `dotenv` (default), `JSON`, or `YAML`.
- **Mode, changeable in settings:**

| Mode | Behaviour | Safety |
| --- | --- | --- |
| **Managed block** (default) | Writes only between `# >>> astrelyse ports` and `# <<< astrelyse ports` markers; every line outside the block is preserved | Never overwrites the user's own variables |
| **Separate file** | Writes a file the app loads itself, leaving `.env` untouched | Safest for apps that already have a `.env` |
| **Off** | Variables are injected into the process environment only; no file is written | For apps that read the environment directly |

- **Preview:** the settings page shows exactly what will be written, with the same Geist Mono styling as the
  console, before saving.
- **Conflict note:** if the user's own `.env` already defines `PORT`, the panel shows a warning and lets them choose
  "panel wins", "my value wins", or "leave it and warn me".

Example generated block:

```dotenv
# >>> astrelyse ports (managed, edit in Server → Settings → Ports and environment)
SERVER_IP=203.0.113.10
SERVER_PORT=25565
PORT=25565
QUERY_PORT=25566
RCON_PORT=25575
PUBLIC_ADDRESS=203.0.113.10:25565
# <<< astrelyse ports
```

### 5.5 The settings card (Ports and environment)

Built as a Material card with a near-solid inner fill, because it is dense text. Controls are Liquid Glass capsules.

| Section | Controls |
| --- | --- |
| **Ports** | A table of roles: role name (mono), allocation (`ip:port`), Auto or Manual toggle, status (free, in use, conflict), remove. An "Add role" button and a "Reassign automatically" button |
| **Env file** | File name input, format picker (dotenv, JSON, YAML), mode picker (Managed block, Separate file, Off), conflict policy picker |
| **Extra variables** | Optional custom key/value pairs written into the same file, with secret masking |
| **Preview** | Read-only code block of the file as it would be written, with a copy button |
| **Actions** | "Save", "Regenerate now", "Restart to apply". A banner appears whenever a change needs a restart |

Behaviours:

- **(new)** Changing a port while the server is running shows "Restart required" and offers a one-click restart.
- **(new)** Every change is written to the activity log, so it appears in the change journal (section 3.2).
- **(new)** Subuser permission `settings.ports` guards the card. It is read-only without it.
- **(update)** The Network page shows the same roles as a column, so both pages stay consistent.

### 5.6 Backend sketch

| Piece | Proposal |
| --- | --- |
| Egg | New `port_spec` JSON column on `eggs`: `[{ "role": "QUERY_PORT", "required": false }, ...]` |
| Binding | New table `server_port_bindings`: `server_id`, `allocation_id`, `role`, `auto` (bool), unique on `(server_id, role)` |
| Settings | New `server_env_settings`: `server_id`, `file_name`, `format`, `mode`, `conflict_policy`, `extra` (JSON) |
| Env | Register the injected variables with `EnvironmentService::setEnvironmentKey()` in a service provider |
| File write | Write the file through the daemon's existing file write endpoint during the pre-start step. The block merge happens in the panel so user lines are preserved |
| API | `GET` and `PUT /api/client/servers/{server}/settings/ports`, `POST .../settings/ports/preview`, `POST .../settings/ports/regenerate` |
| Permission | New subuser permission `settings.ports`, added to `SubuserPermissionCatalog` |
| Validation | Reject reserved ports, ports outside the node range, duplicate roles and allocations not owned by the server |

### 5.7 Acceptance checks

- A new server created from any egg gets all required roles with free ports, with no manual step.
- `PORT` equals `SERVER_PORT` unless the user changes the mapping.
- Changing a role's allocation updates the env file and the injected variables on the next start.
- A user's own lines in `.env` survive in managed-block mode, across ten regenerations.
- Setting mode to Off writes nothing to disk and still injects variables.
- A subuser without `settings.ports` sees the card read-only.
- A port in use on the node cannot be assigned, and the reason is shown.

---

## 6. Per-workload feature sets

### 6.1 Discord bots

- **(new) Bot vitals card:** gateway ping, guild count and shard status, from a status endpoint the bot exposes or,
  if the user opts in, from the token.
- **(new) Rate-limit detector:** spots repeated 429s in logs and shows when they began and which route is hot.
- **(new) Invite link builder:** paste a client ID, tick permissions in a grouped list, get an invite URL.
- **(update) Shard view:** a grid of shards with a `StatusDot` and per-shard restart.

### 6.2 Lavalink

- **(new) Lavalink dashboard:** connected clients, active players, playing tracks, frame deficit, CPU and memory, from
  Lavalink's stats endpoint.
- **(new) Config form:** `application.yml` as a form with source toggles, plugin management and a password field with
  regenerate.
- **(new) Connection snippet generator:** pick a library (discord.js, wavelink, and others) and get the exact node
  config with host, port and password filled from the ports system (section 5).
- **(new) Node health strip:** flags dropping players, high frame deficit and an unreachable node.

### 6.3 Database hosting

- **(new) Connect tab:** connection strings per language (Node, Python, Go, PHP, CLI), masked until revealed, with
  copy and an SSL-required note.
- **(new) IP allowlist editor:** add, remove, and "allow my current IP", with a lock-out warning.
- **(new) Query and table browser:** read-only by default, saved queries, CSV export.
- **(new) Live metrics:** open connections against the limit, slow queries, storage growth with a forecast.
- **(update) Backups:** point-in-time restore where the engine supports it, and "restore to a new instance".
- **(new) Credentials:** scoped extra users (read-only) and one-click password rotation that updates linked services.

### 6.4 Website hosting

- **(new) Domains tab:** add a custom domain, see exactly which DNS records to set (with copy), live propagation
  status, automatic SSL status and a www-to-apex redirect toggle.
- **(new) Branch previews:** a temporary URL per branch or pull request, with expiry and a promote button.
- **(new) Traffic panel:** requests per minute, status-code mix, top paths, slowest routes and bandwidth against the
  plan, parsed from access logs.
- **(new) Maintenance mode:** one toggle serves a branded holding page, with an optional allowlist for your own IP.
- **(new) Proxy mapping:** map a domain and path to an internal port or service, using the ports system.
- **(new) Cache purge** button for sites behind a cache.

### 6.5 Minecraft and other games

- **(new) Plugin and mod browser:** Modrinth and Spigot search, one-click install, version-compatibility check.
- The live player roster, timeline scrubber and event annotations (section 3) apply here too.

### 6.6 Pocket mode (mobile)

- **(new) Thumb-friendly layout:** a bottom bar with power, console and files. Swiping a server card right starts it
  and left stops it, with a confirmation.
- **(new) Idle sleep indicator:** a server with no players for N minutes shows a "sleeping" state with the resources
  saved, and a wake button. Needs backend support for actual sleep.

---

## 7. Cross-cutting components and options

- **(new) Drawer / side sheet** for details and short forms where a dialog is too heavy. Material tier.
- **(new) Tabs, Breadcrumb, Stepper** primitives, so pages stop hand-rolling them. Added to `themes/primitives.ts`
  so every skin can style them.
- **(new) Skeleton** loaders for lists, cards and charts. Static shapes, no shimmer.
- **(new) KeyboardShortcut** badges in tooltips and menus, and a `?` overlay listing every shortcut.
- **(new) StatusDot** shared by dashboard, console, nodes and projects: running, starting, stopping, offline,
  suspended. Flat dot; a spinner covers the transition.
- **(new) Secret field** with mask, reveal-with-audit and copy, reused by env, API keys, database passwords and
  Lavalink passwords. Builds on `SecretInput`.
- **(update) Theme options.** A density toggle (compact or comfortable) and accent presets through the existing
  `ThemeSettingsDialog`, applied through the theme tokens.
- **(update) Accessibility.** Every new component honours the three fallbacks: reduced transparency, increased
  contrast, reduced motion. Keyboard access and focus rings are required for the palette, drawer and port table.

---

## 8. Backend work needed

Most of this plan is frontend only. These items need server changes:

| Feature | Backend need |
| --- | --- |
| Automatic ports and env file | New tables, egg `port_spec`, `EnvironmentService` hook, daemon file write, permission (section 5.6) |
| Projects and service linking | A project model, link records, and injected linked-service variables |
| Quick-open | A file index or search endpoint |
| Active sessions | Session tracking and revoke |
| Port-check status | A reachability probe |
| Single-file restore from backup | Read one file out of a backup archive |
| Shared saved commands | Per-server storage readable by subusers |
| Git deploy and releases | Repo connection, build runner, release storage |
| Health checks and auto-recovery | A checker on the node or panel, restart policy |
| Domains, SSL, proxy mapping | DNS verification, certificate issuance, proxy config |
| Idle sleep | Node-level suspend and resume |

---

## 9. Suggested build order

| Phase | Scope | Why first |
| --- | --- | --- |
| 1 | Workload profiles in `ServerLayout`; **ports and env file system** (section 5); `StatusDot`, `Drawer`, `Tabs`, `Skeleton` | Foundation. Everything else depends on profiles, ports and shared primitives |
| 2 | Command palette; saved commands; server card upgrades; console toolbar; power split button | Visible polish, mostly frontend |
| 3 | Timeline scrubber with event annotations; crash autopsy; change journal; vitals ring | The most distinctive debugging features, on data already streamed |
| 4 | Projects and service linking; git deploy and releases; env and secrets manager | The platform differentiator for bots, apps and sites |
| 5 | Lavalink dashboard and snippets; database Connect tab; domains and traffic | Per-workload pages |
| 6 | Files, backups and schedules upgrades; account security; pocket mode | Broad polish |

---

## 10. Open questions

1. Should the env file default to **managed block in `.env`**, or to a separate file? The plan assumes managed block
   because it never overwrites user lines.
2. Do saved commands need to be shared with subusers, or are they per-user? Shared needs backend storage.
3. Is a token-based bot vitals card acceptable, or must it only read a status endpoint the bot exposes?
4. How many allocations does each plan allow? Auto-assignment is capped by that limit, so it decides how many roles a
   server can hold.
5. Should linked-service variables always be injected, or only after the user confirms the link?
