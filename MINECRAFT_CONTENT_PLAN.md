# Minecraft content v2: server software, modpacks, worlds, imports

This builds on the shipped Mods tab (`MODRINTH_INSTALLER_PLAN.md`, `MODS_POLISH_SPEC.md`). The design rules are in
`../front-end landing/pterodactyl/PANEL_DESIGN.md` and the project `CLAUDE.md` (UI must show on the **Astrelyse** theme,
built from shared primitives). Everything here applies to **Java** Minecraft servers only.

## 0. Rules that apply everywhere

1. **Server-side only.** Nothing client-only is ever shown, selected or installed:
   - Modrinth search always uses the facet `server_side:required|optional`. Install, version change and import refuse
     a project whose `server_side` is `unsupported` with 422 `{error:'client_only'}`.
   - `.mrpack` files whose `env.server` is `unsupported` are skipped.
   - **CurseForge has no side flag**, so every CurseForge file is checked against Modrinth by sha1
     (`POST /v2/version_files`, `algorithm: sha1`) and then its project's `server_side`. A file Modrinth says is
     client-only is hidden or skipped. A file Modrinth doesn't know is shown with `side: 'unknown'`, the badge
     "Unverified", and it is unticked by default in batch flows.
   - Search rows, version rows and batch items carry `side: 'server' | 'both' | 'unknown'`.
2. **Strict loader matching.** A server only sees content for what it runs. There is no loader override any more. The
   loader comes from detection, and it changes only through the Software page. The game version override stays.
   Compatible sets:
   | Server | Accepts |
   | --- | --- |
   | fabric | fabric |
   | quilt | quilt, fabric |
   | forge | forge |
   | neoforge | neoforge |
   | paper | paper, spigot, bukkit |
   | purpur | purpur, paper, spigot, bukkit |
   | folia | folia |
   | spigot | spigot, bukkit |
   | velocity / bungeecord / waterfall | itself only |

   This applies to search facets (OR within one facet group), the versions list, dependencies, update lookups,
   imports and modpack contents. A Fabric mod never appears on a Forge server.
3. **Every heavy operation runs inside the server's install container** through an install plan (section 1), never
   as hundreds of Wings pulls. The panel does every API call (CurseForge key, Modrinth lookups, filtering). The
   container only downloads, checks hashes and unpacks.
4. Hosts the plan may download from (enforced in the panel when the plan is built, and again in the install script):
   - `cdn.modrinth.com`
   - `edge.forgecdn.net`, `mediafilez.forgecdn.net`
   - `piston-meta.mojang.com`, `piston-data.mojang.com`
   - `meta.fabricmc.net`, `maven.fabricmc.net`
   - `meta.quiltmc.org`, `maven.quiltmc.org`
   - `maven.minecraftforge.net`, `maven.neoforged.net`
   - `api.papermc.io`, `fill-data.papermc.io`
   - `api.purpurmc.org`

   All https, with no userinfo or port.

## 1. The Astrelyse Minecraft egg and install plans (backend lane S1)

**Egg** `database/Seeders/eggs/minecraft/egg-astrelyse-minecraft-java.json` ("Minecraft Java (Astrelyse)"):
- Tag `minecraft`, workload profile `game`.
- Docker images: Java 8, 11, 17, 21 and 25 yolks.
- Startup: `java -Xms128M -XX:MaxRAMPercentage=95.0 -jar {{SERVER_JARFILE}} nogui`, except Forge/NeoForge ≥ 1.17,
  which use `@user_jvm_args.txt @libraries/.../unix_args.txt`. The install script writes a `start.sh` and the startup
  is `bash start.sh`. Pick one approach and document it.
- Variables:
  - `SERVER_TYPE` (vanilla|paper|purpur|folia|fabric|quilt|forge|neoforge)
  - `MC_VERSION`
  - `LOADER_VERSION` (blank means latest stable)
  - `SERVER_JARFILE`
  - `ASTRELYSE_PLAN_SHA256` (not user-viewable or editable)
- Install container: `eclipse-temurin:21-jdk-jammy`. The script installs `curl jq unzip ca-certificates` first.

**Install plan.** Before a reinstall, the panel writes `/.astrelyse/plan.json` into the server through Daemon
`putContent`. It sets `ASTRELYSE_PLAN_SHA256` to the sha256 of the exact bytes, then calls the existing reinstall.
The script refuses to run a plan whose hash doesn't match. When there's no plan, it does a plain software install from
the variables, so stock reinstalls keep working.

```json
{
  "version": 1,
  "operation": "software|modpack|world|clear",
  "wipe": { "enabled": false, "keep": ["world", "world_nether", "world_the_end", "server.properties", "ops.json", "whitelist.json", "banned-players.json", "banned-ips.json", "eula.txt"] },
  "software": { "type": "fabric", "minecraft": "1.21.1", "loader": "0.16.9" },
  "remove": ["mods/old.jar"],
  "files": [{ "path": "mods/lithium.jar", "url": "https://cdn.modrinth.com/…", "sha1": "…", "sha512": "…", "size": 123 }],
  "archives": [{ "url": "https://…" , "local": null, "sha1": "…", "strip": "overrides/", "into": "", "only": null }],
  "eula": true
}
```

- `archives[].local` is a server-relative path, for imports the user uploaded. `strip` removes a leading folder.
  `into` is the destination folder. `only` limits extraction to a sub-folder.
- The script order is: verify the hash → wipe (keeping the listed entries) → remove → install software (vanilla
  piston-meta; Paper/Folia fill API; Purpur API; Fabric meta server launcher jar; Quilt installer `install server`;
  Forge/NeoForge installer `--installServer`) → files (curl, then check sha512 or sha1, failing on mismatch) → archives
  → write `eula.txt` → delete `/.astrelyse/plan.json`.
- It prints clear step lines (`[astrelyse] 3/6 Downloading 142 mods…`) so the install log reads well.
- Every path is checked so it stays inside `/mnt/server` (no `..`, no absolute paths), and symlinks are refused.
- The Java image is picked from the Minecraft version when the panel builds a software plan: ≤1.16.5 → 8, 1.17 → 16,
  1.18–1.20.4 → 17, 1.20.5–1.21.x → 21, and 25 for 26.x and newer. The panel sets `servers.image` through the
  existing action.

**Services** (`app/Services/Servers/Software/`):
- `InstallPlan` (value object, `toJson()` deterministic)
- `InstallPlanRunner::run(Server $s, InstallPlan $plan, string $kind, array $summary, User $by): InstallOperation`
- `SoftwareCatalog` (versions per type, cached 1h; stable/latest flags; snapshots behind `include_snapshots`)
- `SoftwareSwitcher` (builds the plan, updates the variables and image, converts the egg when needed)
- `ServerFileWiper` (the clear action)

The detector reads `SERVER_TYPE` first when it's present.

**Table** `server_install_operations`:
- `id, server_id, user_id null, kind, status (pending|running|succeeded|failed), summary json, plan_sha256,
  error text null, started_at, finished_at, timestamps`
- Status comes from the server's install status. `RecordServerInstallResult` closes the newest running operation.

**Egg conversion.** A server on another Minecraft Java egg (not Bedrock) can be moved to the Astrelyse egg by its
owner with `software.manage`. The action changes `egg_id` and maps the version variables (`MC_VERSION`,
`MINECRAFT_VERSION` or `VANILLA_VERSION` → `MC_VERSION`; type from detection). It keeps files, and logs activity.

**Client API** `/api/client/servers/{server}/software` (permissions `software.read`, `software.manage`):

| method | path | body / query | returns |
| --- | --- | --- | --- |
| GET | `/` | — | `{current:{type,minecraft,loader,egg_managed:bool}, types:[{type,label,kind:'mod'\|'plugin'\|'vanilla',icon}], operation:{…latest}\|null}` |
| GET | `/catalog` | `type, include_snapshots?` | `{minecraft:[{id,type:'release'\|'snapshot',latest:bool}], loaders:{<mc>:[{id,stable:bool}]}}` (loaders only for fabric/quilt/forge/neoforge; builds for paper/purpur/folia) |
| POST | `/install` | `{type, minecraft, loader?, wipe:{enabled, keep_worlds:bool}, mods_action:'keep'\|'disable'\|'remove'}` | 202 operation |
| POST | `/reinstall` | — | 202 operation (same software, repair) |
| POST | `/clear` | `{keep_worlds:bool, confirm: <server name>}` | 202 operation (the server must be offline) |
| POST | `/convert` | — | 200 `current` |
| GET | `/operations/{id}` | — | an operation |

When the family changes (mod ↔ plugin ↔ vanilla), `mods_action` decides what happens to `mods/` and `plugins/`.
`disable` moves them to `mods.disabled-<date>/`. Existing `server_mod_installs` rows are marked accordingly.

## 2. Modpacks, worlds, link install and Prism import (backend lane S2)

It uses S1's `InstallPlan` / `InstallPlanRunner` and Haiku's parsers (lane H). Routes go under
`/api/client/servers/{server}/content`. Permissions: modpack and world installs need `software.manage`; link and
import installs of mods need `mods.install`.

**Modpacks**
- Search: Modrinth `project_type:modpack` plus the server-side facet. CurseForge `classId=4471`.
- A modpack may change the loader, so search is not limited to the current loader. Every result shows the loader and
  game version it needs.
- `GET content/modpacks/search` and `GET content/modpacks/{provider}/{id}/versions` return versions with `loader` and
  `minecraft` parsed from the dependencies or the file's game versions.
- `POST content/modpacks/preview {provider, project_id, version_id}` returns
  `{software:{type,minecraft,loader}, files:{server:n, skipped_client:n, unverified:n}, size_bytes, warnings[]}`. It
  never installs anything.
- `POST content/modpacks/install {provider, project_id, version_id, wipe:{enabled, keep_worlds}}` → 202 operation.
- Modrinth: download the `.mrpack`'s `modrinth.index.json`. The panel downloads the mrpack itself (≤ 100 MB, streamed
  to a temp file) only to read the index. `files[]` without `env.server = unsupported` go into the plan, and
  `overrides/` and `server-overrides/` become archives using the mrpack's CDN url.
- CurseForge: use the file's `serverPackFileId` when present (one archive, strip its top folder if it has one).
  Otherwise read `manifest.json`, resolve every file id (batch `POST /v1/mods/files`), run the Modrinth sha1 side
  check, and put `overrides/` in as an archive.
- After success, create `server_mod_installs` rows for the installed mod files (provider ids from the index or a
  hash lookup), so the Installed tab manages them. Record `servers`' modpack in a new
  `server_modpacks (server_id unique, provider, project_id, version_id, title, icon_url, version_number)` table.
- `GET /software` includes `modpack` when one is present.

**Import a `.mrpack` the user uploaded** (for example a Prism or Modrinth App export)
- `POST content/modpacks/import-local {path}` takes a server-relative `.mrpack` or `.zip`.
- It uses Wings decompress into `/.astrelyse/import/<uuid>/`, reads the index through Daemon, then builds the plan
  with `archives[].local`. The temp folder is cleaned after.

**Worlds ("public worlds")**
- Search CurseForge `classId=17` (Worlds) when a key is set. Rows show the game version.
- `POST content/worlds/install {provider:'curseforge', project_id, file_id, mode:'replace'|'new', backup:true}`
  installs a CurseForge world.
- `POST content/worlds/import-local {path, …same}` installs a world zip the user uploaded.
- The plan archive goes `into` the level name read from `server.properties` (`level-name`, default `world`). If
  `backup`, rename the old world to `world-backup-<YYYYMMDD-HHmm>` first through a plan `remove`/move step (add
  `moves:[{from,to}]` to the plan schema if needed and tell S1). The archive root is found by locating `level.dat`
  and stripping above it.
- 422 `{error:'not_a_world'}` when the zip has no `level.dat`, which is checked by listing after decompress for local
  zips, or from the CurseForge file's metadata when possible, otherwise by the script failing clearly.

**Link install** `POST content/resolve {url}` returns
`{kind:'mod'|'plugin'|'modpack'|'world', provider, project_id, version_id?, title, icon_url, compatible:bool, reason?}`.
It uses lane H's `ModLinkParser`. The UI then opens the right drawer. Incompatible results (wrong loader, client-only,
wrong game version) come back with `compatible:false` and a human `reason`.

**Prism import**
- `POST content/import/prism/preview {text}` (≤ 256 KB) uses lane H's `PrismListParser` and returns items
  `[{line, name, url?, matched:{provider, project_id, version_id, title, icon_url, filename}|null, match:'url'|'filename'|'name'|'none', side, compatible, selected:bool, reason?}]`.
- Resolution order: an explicit Modrinth or CurseForge URL → the filename, through the Modrinth hash-less search by
  slug-ish name → a name search on Modrinth limited to the server's loader and version (top hit only when its title
  normalises to an exact match, otherwise `match:'name'` with `selected:false`).
- `selected` is true only for `compatible && side !== 'unknown'`.
- `POST content/import/prism/install {items:[{provider, project_id, version_id}]}` re-validates every item server-side
  and installs them as one plan (kind `mods`), so it doesn't fire 100 pulls. The response is a 202 operation, and
  rows are created on success.
- The plain `/mods/install` single-file path stays as it is.

**The rule changes from section 0** are implemented in `ModrinthProvider`, `CurseForgeProvider` and `ModInstaller`
(the client_only 422, the compatible-loader sets, CurseForge side checks with `side` on rows). The loader override
parameter is removed from the mods endpoints: they ignore `loader` and always use the detected set.

## 3. Parsers (lane H, Haiku). Pure PHP, no I/O

`app/Services/Servers/Mods/Import/ModLinkParser.php`, method `parse(string $url): ?ParsedLink`. `ParsedLink` has
`provider, kind, slug_or_id, version_id?, file_id?`. It handles:
- `modrinth.com/{mod|plugin|datapack|modpack|shader|resourcepack}/{slug}`, plus `/version/{id}`
- `modrinth.com/project/{id}`
- `cdn.modrinth.com/data/{projectId}/versions/{versionId}/{file}`
- `curseforge.com/minecraft/{mc-mods|bukkit-plugins|modpacks|worlds}/{slug}`, plus `/files/{fileId}` and
  `/download/{fileId}`
- `www.` prefixes, trailing slashes, query strings and fragments

Anything else, including other hosts and `javascript:`, returns null. Shader and resourcepack links return a
ParsedLink with kind `shader` or `resourcepack`, so the resolver can say "client-only content can't be installed on a
server".

`app/Services/Servers/Mods/Import/PrismListParser.php`, method `parse(string $text): list<PrismEntry>`. `PrismEntry`
has `line, name, url?, version?, filename?`. It handles Prism Launcher's "Export mod list" formats:
- **HTML:** `<ul><li><a href=…>Name</a> [version] …`
- **Markdown:** `- [Name](url) [version]`
- **Plaintext:** one name per line, optionally `Name (filename)` or with a version
- **JSON:** an array of objects with name/url/version/filename/authors keys
- **CSV:** a header row, any column order

It auto-detects the format. It also accepts a plain list of URLs, one per line. Lines are trimmed, de-duplicated by
url or name, and capped at 1000 entries.

Unit tests cover every format, mixed casing, Windows line endings, junk lines, and HTML entities in names.

## 4. Software page (frontend lane S3)

A new server page **Software** (route `software`, icon `server-cog` or the nearest in the icon catalog), shown on every
Java Minecraft server (tag `minecraft`, not `bedrock`) with `software.read`. It sits in the nav right after Console.
It's built only from shared primitives (Card, Tabs, Drawer, Select, Badge, Alert, Dialog, Skeleton, Switch) so
Astrelyse skins it.

Tabs: **Server type · Modpacks · Worlds · Maintenance**

- **Header:** a "Currently running" card with the type icon tile, `Fabric 0.16.9 · Minecraft 1.21.1`, the modpack
  (if any) with its icon and version, and the latest operation's status chip (Installing… with a spinner, Failed with
  "View install log", or Succeeded with the time).
- **Server type:** a grid of type cards (Vanilla, Paper, Purpur, Folia, Fabric, Quilt, Forge, NeoForge). Each has an
  icon tile, a one-line description and a Mods/Plugins/Vanilla badge, and the current type is marked "Current".
  Selecting a card opens the configure panel below:
  - a Minecraft version select (releases, with a "Show snapshots" switch)
  - a Loader/Build select, defaulting to latest stable and marked "(recommended)"
  - a "Start fresh" switch with a nested "Keep worlds" switch
  - when the family changes, a radio for "Your current mods/plugins" (Keep · Move to a disabled folder (default) ·
    Delete)
  - a summary Alert ("The server will stop, install Fabric 0.16.9 for 1.21.1 and keep your worlds. Takes about a
    minute.")
  - a primary "Install" button behind a confirm Dialog
  - not on the Astrelyse egg: an Alert explains it, with a "Convert" button (`POST /convert`)
- **Modpacks:**
  - Browse modpacks from Modrinth and CurseForge (source tabs as in Mods) with search, sort and rows showing the
    loader and Minecraft badge and downloads.
  - The install drawer has the version picker → a preview (`/preview`) showing "142 server mods · 31 client-only
    skipped · 3 unverified", the software it will switch to, the size, and a "Start fresh (keep worlds)" switch
    (default on) → Install.
  - An "Import .mrpack" button opens the existing file upload flow targeted at `/.astrelyse/uploads/`, then
    `import-local`.
- **Worlds:** "Public worlds" browse (CurseForge Worlds; hidden with a note when there's no key) plus "Import world
  zip" (upload, then `import-local`). Install options: Replace the current world (with a backup copy, on by default)
  or Install alongside as a new world (shows the level name to set). Confirm Dialog.
- **Maintenance:**
  - "Reinstall current software" (repair, keeps files)
  - **"Clear server files"** (danger Card): a Keep worlds switch (default on), and a Dialog that makes the user type
    the server name. It's disabled while the server is running, with "Stop the server first" and a Stop button.
- **Operations:** after any action, the header chip shows progress. Poll `GET /operations/{id}` every 2s while it is
  running, and link to the Console for the live install log. The operation is never silent.

## 5. Mods page upgrade (frontend lane S4)

- **Strict loader:** remove the Loader select from the Change panel (version only). Add the explanatory note "Mods are
  matched to Fabric. Change the server type on the Software page." with a link.
- **Import tab** (third sub-tab: Installed · Browse · Import):
  - **"Install from link":** an input "Paste a Modrinth or CurseForge link" → Resolve → shows the resolved project
    card with compatibility (a reason when not compatible) → opens the existing install drawer. Modpack or world links
    route to the Software page with that item preselected (`?modpack=` / `?world=` search params; S3 reads them).
  - **"Import a Prism Launcher mod list":** a textarea plus "Choose file" (`.txt .md .html .json .csv`, read in the
    browser) → Preview → a review table: tick (auto-ticked when server-side and compatible), name, matched project
    with icon, match type badge (Link/File/Name), side badge (Server/Both/Unverified/Client-only), and the reason for
    disabled ticks. Toolbar: "Select all compatible", count "38 of 52 will be installed", Install selected (primary).
    Client-only rows are listed, struck through and impossible to tick.
  - **"Have a .mrpack?":** a link to Software › Modpacks › Import.
- **Visual upgrade:**
  - Browse gets category chips (from provider tags, single select, scrollable row) under the search.
  - Result rows get a side badge only when Unverified.
  - A project detail view in the drawer: a header with gallery thumbnails (first 4, `loading=lazy`), a body
    description (Modrinth `body` / CurseForge description, rendered as sanitised text or markdown with the existing
    markdown component if there is one, otherwise plain text clipped with "Read more on <provider> ↗"), and links
    (source, issues, wiki, discord), then the versions list.
  - Installed rows get a tidy two-line layout and a "Modpack" badge on mods that came from a modpack.
  - A batch install progress tray (bottom of the page): when an operation from Import is running, one Card shows
    "Installing 38 mods… View log".
- Keep every rule from `MODS_POLISH_SPEC.md`. One primary per region. No fade-ins.

## Lanes and file ownership

| Lane | Model | Owns |
| --- | --- | --- |
| **S1** Software backend | Sonnet | the Astrelyse egg JSON (+ seeder registration), `app/Services/Servers/Software/**`, `SoftwareController` + requests, the `server_install_operations` migration/model, `RecordServerInstallResult` hook, `software.*` permissions, detector `SERVER_TYPE` support, `tests/**/Software/**` |
| **S2** Content backend | Sonnet | `app/Services/Servers/Mods/**` except `Import/*Parser*`, `ContentController` + requests, the `server_modpacks` migration/model, `tests/**/Mods/**` and `tests/**/Content/**` |
| **H** Parsers | Haiku | `app/Services/Servers/Mods/Import/{ModLinkParser,ParsedLink,PrismListParser,PrismEntry}.php` + `tests/Unit/Services/Servers/Mods/Import/**` |
| **S3** Software page | Sonnet | `resources/scripts/**/software/**`, `views/server/software*`, `api/server/software/**`, `api/server/content/**` (shared hooks for modpacks/worlds) |
| **S4** Mods page | Sonnet | `resources/scripts/**/mods/**`, `views/server/mods*`, `api/server/mods/**` |

Shared files (`routes/api-client.php`, `app/Enum/Permissions.php`, `app/Models/Permission.php`,
`resources/lang/en/*`, `views/definitions.ts`, `views/pages.ts`, `views/models.ts`, `router/routeTree.ts`,
`themes/classic/views/index.ts`, `views/navigation.tsx`) are edited additively, re-reading immediately before each edit.
The frontend codes against the contracts here, not against the live backend. Nobody runs `sdk:generate` until the end.
