# Mods tab — polish spec

These findings come from a walkthrough of the live Astrelyse theme at `http://localhost:8000/server/ngilpprp/mods` (a
Paper server, desktop 1440×900 and mobile 375×812), with Modrinth and CurseForge both enabled. The design rules are in
`../front-end landing/pterodactyl/PANEL_DESIGN.md` and the panel's `CLAUDE.md`. Every item is required unless it is
marked optional.

## What works (keep it)

- The Astrelyse menu shows "Plugins" only on eligible servers. Detection is correct for every dev server.
- Live Modrinth and CurseForge search, filtered by loader and version, both return correct results.
- The install drawer lists compatible versions with the newest one selected. The single primary Install button is in
  the drawer footer, which is correct.

## Backend

B1. **Installed list fails as a whole when the node is unreachable.** `GET /mods/installed` returned 504, and the whole
    Installed tab became the "Something went wrong" illustration. Instead, when the directory listing fails, return
    the tracked rows with `present: null` and `meta.disk_unavailable: true`. Keep the Daemon timeout short (≤ 5s) for
    this listing. Never 5xx the list because of Wings. Add a test.

B2. **Fixtures for manual QA.** Add a seeder, `database/Seeders/ModsDemoSeeder.php` (not called by DatabaseSeeder),
    that creates a "Fabric" egg (tag `minecraft`, `MC_VERSION`, startup `java -jar fabric-server-launch.jar`) and a
    "NeoForge" egg cloned from the Forge egg, each with one server on the existing demo node. These let the mod-loader
    path be checked in the browser.

## Frontend: layout and hierarchy

F1. **Page heading.** Add a `PageHeading` with the title "Mods" or "Plugins" (by `project_type`) and a one-line
    description, "Install and manage <mods|plugins> from Modrinth and CurseForge." (drop the CurseForge part when it
    isn't available). The document title must follow the same label: it currently says "Mods" on a Plugins page.

F2. **Platform bar.** Today it is a raw chip ("paper 26.3"), a full-width unlabeled loader select and an unlabeled
    version input, stacked. Replace them with one compact row inside the page header area:
    - Read mode: the chip `Paper · 26.3` (loader display names: Paper, Purpur, Folia, Spigot, Bukkit, Sponge, Fabric,
      Quilt, Forge, NeoForge, Velocity, BungeeCord, Waterfall), plus a muted note "Detected from your server" and a
      small ghost button "Change".
    - Change mode: a labelled Loader select and Game version input side by side, plus "Reset to detected". When
      overridden, the chip reads `Fabric · 1.21.1 (custom)` with a caution tone.
    - When the detected version was `latest`, show `26.3 (latest)`.
    - No label may be missing: every control has a visible or visually hidden label.

F3. **Sub-tabs first.** The Installed/Browse tabs come directly under the heading and above everything else. The
    platform row belongs to the header, not between controls. Show a count on the Installed tab ("Installed 4"). The
    active tab must keep its active styling when focus moves into the page (it currently looks unselected once a
    select is focused).

F4. **Browse toolbar.** Remove the redundant "Browse" card title. Lay it out as one row: a search input that grows,
    the Sort select, and the Source control. At ≤ 640px it wraps to the search on row 1 and sort plus source on row 2.
    The source is a **segmented control** (Tabs primitive, or Button group) with the two options Modrinth and
    CurseForge, not a searchable combobox. Its accessible name is "Source": today it is announced as `textbox
    "modrinth"`, and it clears its text when opened. Remember the last source per server in localStorage, wrapped in
    try/catch.

F5. **Mobile is broken at 375px.** The Browse card is narrower than its content, the selects overflow past the card
    edge, and titles truncate to "WorldEdit for Bu…". Fix this so there is no horizontal overflow at 320 to 768px. Cards
    are full width. A result row stacks the icon and title, the description up to 2 lines, then meta and action on one
    line. The Install button never shrinks the title below about 60% of the width.

## Frontend: rows and actions

F6. **One primary per region.** Every result row has a green primary "Install", which breaks the rule that green
    means go, once per region. Row buttons become neutral/secondary ("Install"). The drawer footer keeps the single
    primary. An installed result shows a muted "Installed" badge with a "Manage" ghost button that jumps to the row in
    the Installed tab, not a second Install button.

F7. **Result row content.** Show the author, compact downloads ("105M"), last updated ("updated 3d ago") and up to
    two category chips. Show a small provider mark only in mixed contexts (the Installed list). In Browse the source is
    already known. A missing icon falls back to the first letter of the title on a `fill` tile, never an empty box.

F8. **Install drawer header.** Start the drawer with the project's icon, title, author and a one-line description, then
    "View on Modrinth/CurseForge ↗". Each version row shows the version number, release/beta/alpha as a Badge
    (beta = caution, alpha = danger tone), the date and size. Replace the game version list with a **compatibility
    line**: "Works on 26.3" (success tone) when it includes the server version, otherwise "Built for 26.1–26.2"
    (caution) with the full list in a tooltip. The current UI shows the first three versions (26.1, 26.1.1, 26.1.2),
    which made a compatible 26.3 build look incompatible. The whole row is selectable as a radio (role radiogroup,
    arrow keys move the selection), not a per-row "Select" button. Required dependencies appear under the selected
    version, each with "Install" or "Installed ✓".

F9. **Install feedback.** On confirm, close the drawer at once, show the row as pending ("Installing…" with a spinner
    in the button, button disabled), then show a success toast "VeinMiner 2.14.0 installed. Restart the server to load
    it." with a "Restart" action. Use `model.actions` or the existing power mutation, and show it only with
    `control.restart` permission. Failure toasts carry the API message. A 422 `not_distributable` swaps in the
    external "Download on CurseForge ↗" link, as it does today.

F10. **Installed rows.**
    - Layout: icon · title, with a provider mark and version under the title · enable Switch · overflow menu (⋯).
    - The overflow menu holds: Change version…, View on <provider> ↗, Delete…
    - "Update to X" is a visible secondary button next to the switch only when an update exists, and there is an
      "Update all (n)" button in the Installed toolbar when n ≥ 2.
    - Disabled rows are dimmed to 60% except the switch, and show a "Disabled" badge.
    - Untracked rows show the filename in mono, an "Untracked" badge with a tooltip ("Added outside the panel, so
      version management isn't available"), and only the switch and Delete.
    - "Missing on disk" is a danger badge with a "Remove entry" action.
    - When `meta.disk_unavailable` is set (B1), show a single caution Alert above the list: "Can't reach the server's
      files right now. Showing what the panel installed." Hide the present/missing badges and disable the toggle and
      delete.

F11. **Delete confirmation** names the file and says it can't be undone: "Delete WorldEdit (worldedit-7.3.jar)? The
    file is removed from /plugins. This can't be undone." The danger button reads "Delete". Toggle never needs a
    confirm.

F12. **Restart notice.** Show one non-blocking Alert ("Changes take effect after a restart.") with a Restart button
    (permission-gated) after any install, update, toggle or delete in this session. It persists until the server
    restarts (watch the websocket status) or is dismissed. Don't fire a toast for every toggle.

## Frontend: states

F13. **Empty states.**
    - Installed is empty: "No <plugins> yet. Browse Modrinth<and CurseForge> to add some." plus a "Browse" button that
      switches tabs.
    - Search with no results: "No results for 'xyz' on <Source> for <Paper 26.3>." with the action "Search all
      versions", which clears the game-version filter for this search only.

F14. **Errors.** The full-page "Something went wrong" illustration must never appear inside a tab. Use an inline Alert
    with Retry in its place. A provider outage is scoped to Browse ("Modrinth isn't responding. Try again or switch to
    CurseForge.") and never blocks Installed.

F15. **Loading.** Show skeleton rows matching the row layout: 6 in Browse, 4 in Installed. Never a lone centred
    spinner for a list. Load more shows skeletons appended at the bottom. No fade-in.

## Admin

A1. **CurseForge key field.** Admin → Settings → Advanced gets a "CurseForge API key" SecretField with the help text
    "From console.curseforge.com. Enables CurseForge in the server Mods tab." The status reads "Key saved" or "Not
    set" from `meta.curseforge_api_key_set`. Saving blank keeps the key. A "Remove key" action sends `!e`. Find the
    existing advanced settings form and follow the reCAPTCHA secret key pattern. Admin pages are styled by Astrelyse's
    scoped CSS, so check them there.

## Accessibility and motion (check every item)

- Every control is labelled. The Source and Loader selects in particular are currently announced by their value.
- Focus is visible and the order is logical. The drawer traps focus and returns it to the triggering button on close.
- Hover feedback appears within 120 ms. No fade-ins and no layout shift on hover. Respect reduced motion.
- Toggling a Switch announces the new state. Pending states set `aria-busy`.

## Done means

- `npm run tsc`, `npm run lint` (no new issues in mods files) and the mods vitest specs all pass. Add specs for F2,
  F4, F6, F8 (the compatibility line), F10, F13 and F14.
- The PHP tests for B1 and the admin settings pass.
- `npx vite build` has run, and the page has been checked in the browser on the **Astrelyse** theme at 1440 and 375
  width on Survival SMP (Paper), and on the seeded Fabric server from B2.
