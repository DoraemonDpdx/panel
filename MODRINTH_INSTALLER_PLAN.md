# Modrinth Mod & Plugin Installer — Plan

Let users of **non-vanilla Java Minecraft servers** search Modrinth and install mods/plugins in one click. The panel
detects the server's **loader** (Fabric, Forge, NeoForge, Quilt, Paper, Purpur, Spigot…) and **Minecraft version**
automatically and sends both as Modrinth search filters, so users only see files that run on their server.

CurseForge is out of scope.

## Scope

- **Eligible:** egg tagged `minecraft`, **not** `bedrock`, and the detected platform is not `vanilla`.
- **Installs into:** `mods/` for mod loaders (fabric, quilt, forge, neoforge), `plugins/` for plugin platforms
  (paper, purpur, folia, spigot, bukkit, sponge, velocity, bungeecord, waterfall).
- **The download is done by Wings**, through the existing `PullsFiles` contract (`app/Actions/Files/PullFile.php`).
  The panel never stores the jar.
- **v1 features:** search, version picker, install, a list of installed mods, remove, and "update available".
- **Not in v1:** modpacks (`.mrpack`), installing dependencies automatically (the UI lists required dependencies
  with their own Install buttons), and CurseForge.

## Detection (`MinecraftPlatformDetector`)

`Pterodactyl\Services\Servers\Mods\MinecraftPlatformDetector::detect(Server $server): DetectedPlatform`

`DetectedPlatform` (final readonly, `toArray()`):

| field | type | notes |
| --- | --- | --- |
| `eligible` | bool | minecraft tag, not bedrock, platform not null/vanilla |
| `platform` | ?string | Modrinth loader slug: `fabric quilt forge neoforge paper purpur folia spigot bukkit sponge velocity bungeecord waterfall vanilla` |
| `game_version` | ?string | raw value, may be `latest` |
| `project_type` | ?string | `mod` or `plugin` |
| `install_dir` | ?string | `mods` or `plugins` (no slashes) |
| `source` | string | `egg_name`, `startup`, `variable`, or `none`, describing how the platform was found |

Rules, first match wins:
1. Not tagged `minecraft`, or tagged `bedrock` → not eligible.
2. Platform from the egg **name**, then the **startup command / docker image**, then **variable names**:
   - `neoforge` (check before forge) · `forge` (`FORGE_VERSION`) · `fabric` (`FABRIC_VERSION`, `fabric-server-launch`)
     · `quilt` · `purpur` · `folia` · `paper` · `spigot` · `bukkit` · `sponge` (`SPONGE_VERSION`) · `velocity`
     · `waterfall` · `bungee` → `bungeecord` · `vanilla` (`VANILLA_VERSION`, name "Vanilla").
3. Game version from the server's variable values, first non-empty of: `MC_VERSION`, `MINECRAFT_VERSION`,
   `VANILLA_VERSION`, `GAME_VERSION`, `VERSION`. For `SPONGE_VERSION` like `1.12.2-7.3.0`, take the part before `-`.
   Proxy platforms (velocity/bungeecord/waterfall) have `game_version = null`.

## Backend API (client API, under `/api/client/servers/{server}/mods`)

New permissions in `app/Enum/Permissions.php` + subuser catalog: `mods.read`, `mods.install` (install, update and
remove). Install is rate-limited with the existing `ResourceLimit::FilePull` middleware.

| method | path | permission | body / query | returns |
| --- | --- | --- | --- | --- |
| GET | `/mods/platform` | mods.read | — | `{object:'mod_platform', attributes: DetectedPlatform + resolved_game_version}` |
| GET | `/mods/search` | mods.read | `query?, loader?, game_version?, offset=0, limit=20 (max 50), sort=relevance\|downloads\|updated\|newest` | `{object:'list', data:[{project_id, slug, title, description, icon_url, downloads, author, categories, installed:bool}], meta:{total, offset, limit, loader, game_version}}` |
| GET | `/mods/projects/{projectId}/versions` | mods.read | `loader?, game_version?` | `{object:'list', data:[{id, name, version_number, version_type, date_published, game_versions, loaders, file:{filename,url,size,sha512}, dependencies:[{project_id, version_id, dependency_type}]}]}` |
| GET | `/mods/installed` | mods.read | — | `{object:'list', data:[{id, project_id, version_id, title, icon_url, filename, version_number, present:bool, update:{version_id,version_number}\|null}]}` |
| POST | `/mods/install` | mods.install | `{project_id, version_id}` | `{object:'mod_install', attributes:{…installed row}}` (202) |
| DELETE | `/mods/installed/{install}` | mods.install | — | 204 |

Behaviour:
- `loader`/`game_version` default to the detected values. The query can override them so the UI can change the
  filters. `game_version = latest` resolves to the newest `release` from Modrinth `GET /v2/tag/game_version`
  (cached for 6 hours).
- Search uses Modrinth `GET /v2/search` with facets `[["project_type:<type>"],["categories:<loader>"],["versions:<v>"]]`.
- Install: fetch `GET /v2/version/{id}`, check that the version belongs to `project_id` and lists the server's loader,
  and that the file URL host is `cdn.modrinth.com`. Choose the `primary` file (or else the first `.jar`), and refuse
  anything else. Pull it into `/<install_dir>` with the filename taken from Modrinth (basename only). If a different
  version of the same project is already installed, delete the old file after a successful pull. Log activity as
  `server:mods.install` and `server:mods.remove`.
- Remove: delete `/<install_dir>/<filename>` through Daemon files, then delete the row.
- `installed.present` comes from one directory listing of `install_dir`. `update` comes from one Modrinth
  `POST /v2/version_files/update` call (hashes sha512, loaders, game_versions), cached for 10 minutes.
- Modrinth HTTP client: `Pterodactyl\Services\Servers\Mods\ModrinthClient` (Laravel `Http`, base
  `https://api.modrinth.com/v2`, `User-Agent: astrelyse-panel/<config('app.version')>`, timeout 10s, search cached
  5 minutes per query). On Modrinth errors return a `DisplayException` with a friendly message.
- Non-eligible servers get 409 `{error: 'mods_unsupported'}` from every endpoint except `/platform`.

Storage: migration `server_mod_installs` (`id, server_id FK cascade, provider='modrinth', project_id, version_id,
title, icon_url null, filename, version_number, sha512, install_dir, timestamps`, unique `(server_id, provider,
project_id)`). Model `ServerModInstall` with `Server::modInstalls()`.

## Frontend

- A **Mods** server tab (route `mods`, icon `puzzle`), shown only when `platform.eligible` is true and the user has
  `mods.read`. Label: "Mods", or "Plugins" when `project_type` is `plugin`.
- Page: a detected-platform chip (loader + version, editable through two selects that override the filters), a
  search box with debounce and a sort select, a result grid with infinite or paginated loading, and an Install button.
  The button opens a version picker drawer with the newest compatible version preselected and required dependencies
  listed with their own Install buttons. An "Installed" section lists each mod with its version, a "missing on disk"
  badge, an Update button and a Remove button with confirmation.
- Follow the existing view registry pattern (`views/definitions.ts`, `views/pages.ts`, `router/routeTree.ts`, classic
  theme views under `themes/classic/views/server/mods/`), react-query hooks in `api/server/mods/`, and English keys in
  `resources/lang/en/`.

## Addendum: installed-mods management

This was added after kickoff, at the user's request. The Mods tab gets an **Installed** view that manages every jar in
`install_dir`, not only the ones the panel installed.

- **Disable/enable:** rename `<file>.jar` ↔ `<file>.jar.disabled` through Daemon `rename`. `server_mod_installs` gains
  `enabled bool default true`, and `filename` always stores the base `.jar` name.
- **Change version:** a picker of every compatible version (newer and older). Choosing one installs it and deletes the
  old file, which is the same as update. If the mod was disabled, the new file stays disabled.
- **Delete:** removes the jar (or `.jar.disabled`) and the row.
- **Mod page link:** `https://modrinth.com/<project_type>/<slug>` (store `slug` and `project_type` on the row).
- **Untracked jars** (found on disk with no row): listed with their filename and `tracked:false`. Enable, disable and
  delete work by filename, and there is no version picker.

API changes and additions:

| method | path | permission | body | returns |
| --- | --- | --- | --- | --- |
| GET | `/mods/installed` | mods.read | — | each row adds `slug, project_type, page_url, enabled:bool, tracked:bool`, and `id` is null for untracked rows. `filename` is the on-disk name |
| POST | `/mods/installed/toggle` | mods.install | `{filename, enabled:bool}` | updated row |
| POST | `/mods/installed/delete` | mods.install | `{filename}` | 204 |
| POST | `/mods/installed/{install}/version` | mods.install | `{version_id}` | updated row (202) |

`filename` must be a basename matching `^[\w.\-+]+\.jar(\.disabled)?$` that exists in `install_dir`.
`DELETE /mods/installed/{install}` stays as an alias.

## Addendum 2: CurseForge (second provider)

The user asked for CurseForge alongside Modrinth, so it is now in scope. Modpacks are still out.

**Provider abstraction.** Add `interface ModProvider` (search, versions, version, project, latestFor) with
`ModrinthProvider` (wrapping the existing `ModrinthClient`) and `CurseForgeProvider`. `ModInstaller` works through a
`ModProviderRegistry`. Every endpoint takes `provider = modrinth|curseforge` (query for GETs, body for POSTs), and it
defaults to `modrinth`. Rows already have a `provider` column.

**CurseForge API** (verify these against https://docs.curseforge.com before relying on them):
- base `https://api.curseforge.com/v1`, header `x-api-key`. Minecraft `gameId=432`, `classId` 6 for mods and 5 for
  Bukkit plugins.
- `GET /mods/search?gameId&classId&searchFilter&gameVersion&modLoaderType&sortField&sortOrder=desc&index&pageSize`
  (pageSize ≤ 50, and index + pageSize ≤ 10000).
- `modLoaderType`: Forge 1, Fabric 4, Quilt 5, NeoForge 6. For plugin platforms, filter by gameVersion only.
- `GET /mods/{id}` (slug, `links.websiteUrl`, `logo.thumbnailUrl`, `allowModDistribution`), `GET /mods/{id}/files`
  (with gameVersion and modLoaderType), and `GET /mods/{id}/files/{fileId}` (`fileName`, `downloadUrl` (may be null),
  `releaseType` 1/2/3, `gameVersions`, `dependencies[{modId, relationType}]` where 3 means required, and
  `hashes[{value, algo}]` where 1 is sha1).
- Updates: `POST /mods` `{modIds}` → `latestFilesIndexes`. Pick the newest file that matches the loader and game
  version.

**API key.** It's an admin setting, `curseforge:api_key`, stored encrypted and set in the admin panel's Settings page
(Advanced). It is never sent to clients. Without a key, CurseForge is unavailable, and `GET /mods/platform` adds
`providers: ['modrinth']`, or `['modrinth','curseforge']` when the key is set. Calling `provider=curseforge` without a
key returns 409 `{error:'provider_unavailable'}`.

**Distribution.** When `allowModDistribution` is false or `downloadUrl` is null, the file can't be pulled. Search
results and versions carry `distributable: false` and `page_url`. Install returns 422 `{error:'not_distributable',
page_url}`, and the UI shows "Download on CurseForge" (an external link) instead of Install.

**Security.** The CurseForge download host must be exactly `edge.forgecdn.net` or `mediafilez.forgecdn.net` (https,
no userinfo or port). IDs are `^\d{1,10}$` for CurseForge and `^[A-Za-z0-9]{8}$` for Modrinth, validated per
provider. The filename rules are unchanged.

**Contract additions.** Search rows, version rows and installed rows gain `provider`, `page_url` and `distributable`.
The `sha512` column becomes nullable and `sha1` is added (CurseForge gives sha1 only). Untracked jars stay
provider-less.

**Install fix (bug found in review).** Pull with `foreground: true` when replacing an existing file, so the old jar is
deleted only after the new one is on disk. If the pull fails, keep the old file and row and return the error.

**UI.** Browse gets a source switch [Modrinth | CurseForge], which is hidden when only one provider is available.
Installed rows show a small provider mark, and "View on Modrinth" becomes "View on CurseForge" for CurseForge rows.

## Labour split

| Lane | Model | Owns |
| --- | --- | --- |
| **A — Detection** | Haiku | `app/Services/Servers/Mods/MinecraftPlatformDetector.php`, `DetectedPlatform.php`, `tests/Unit/Services/Servers/Mods/**` |
| **B — Backend** | Sonnet | `ModrinthClient`, `ModInstaller` service, controller, requests, routes, permissions, migration, model, factory, `tests/Integration/Api/Client/Server/Mods/**` |
| **C — Frontend** | Sonnet | everything under `resources/scripts/**` for the Mods tab, plus `resources/lang/en/*` keys |

Lanes B and C code against the contracts above. Lane B can consume `DetectedPlatform` by its interface before Lane A
finishes. Run `npm run sdk:generate` once, at the very end.
