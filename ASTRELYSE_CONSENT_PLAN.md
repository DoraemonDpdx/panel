# Customer-data consent: one system for site, panel and both bots

Status: plan, written 2026-11-19. Implemented in four parallel workstreams (A–D below).

## Problem

The site (`../front-end landing`) already gates customer data behind consent: staff ask, the customer approves,
a grant lasts 24 h (`lib/console/consent.ts`, table `data_access_requests`). Notes, note history and
`/api/console/customers/[id]` all call `canViewCustomer` / `activeGrant`.

The game panel has no such gate. Any role holder (`users.role_id`, non-root) with `admin:users.read` /
`admin:servers.read` can list and open every customer. This plan closes that gap and makes one consent
request show up everywhere at once:

- **site dashboard**: popup + `/dashboard/privacy`
- **game panel**: popup + account page
- **Discord DM**: from whichever bot (main site bot or panel bot) gets to it first

A decision in any one place resolves the request everywhere. The other UIs drop the prompt on their next poll
and the DM is edited to say where it was answered.

## Ground rules (apply to every workstream)

1. **Single source of truth** is the site's Supabase table `data_access_requests`. The panel keeps **no**
   consent table. It asks the site over a server-to-server API and **fails closed**: if the site is down or
   misconfigured, a role holder gets no customer data.
2. **Who needs consent**
   - Site: role `staff`. Admins and founders bypass, as today.
   - Panel: any user with a non-null `role_id` who is not `root_admin` and not `is_owner`. Root admins and
     owners bypass.
   - Viewing your own account never needs consent.
3. **Lookup by email returns nothing for staff**, in both places. The panel staff lookup does not offer email,
   and if a staff member submits an email anyway, the answer is always `{ found: false }`. No site call is
   made, no request is created and nothing reveals whether the account exists. The site's
   `/api/console/customers/lookup` behaves the same for staff: email gives `{found:false}`. Admins and founders
   keep email lookup. Staff may look up by **AST UID** (`AST-XXXXXXXX`), **Discord user id**, or, on the
   panel only, **panel user UUID**.
4. **Knowing an identifier is never enough.** Entering a UUID, UID or Discord id only creates or reuses a
   pending request and returns a masked name (`J*** D***`). No other field is shown until the grant is live.
5. **Grant TTL**: 24 h. **Pending TTL**: 72 h. These are the existing constants, unchanged.
6. **Audit everything**: lookups, requests, decisions and every consented read. Use the site `audit()` on the
   site and the panel `Activity` log on the panel.
7. **UI**: every popup, modal and toast follows `DESIGN.md` (Astrelyse Liquid Glass), now copied into the
   panel root. Use glass material, tokens, motion and the accessibility rules (focus trap, `Esc` = dismiss
   for later, never auto-approve, reduced-motion honoured).

## decided_via / origin labels (shared vocabulary)

| value        | meaning                       | human label            |
|--------------|-------------------------------|------------------------|
| `panel`      | site dashboard (legacy name)  | "the Astrelyse website" |
| `game_panel` | game panel (NEW)              | "the game panel"       |
| `discord`    | DM button                     | "Discord"              |
| `email`      | email link                    | "the email link"       |

`origin` (NEW column on the request) uses `site` | `game_panel` | `discord`.

---

## A. Site: schema, APIs, popup (`/Users/ayush/Documents/Astrelyse/front-end landing`)

### A1. Migration `supabase/migrations/20261129000000_consent_everywhere.sql` (additive, idempotent)

- `data_access_requests`:
  - add `origin text not null default 'site' check (origin in ('site','game_panel','discord'))`
  - add `ticket_channel_id text`, the Discord channel used to ping staff after a decision
  - widen the `decided_via` check to `('panel','email','discord','game_panel')`
- `consent_dm_events`, the DM outbox:
  `id uuid pk, request_id uuid fk → data_access_requests on delete cascade, kind text check in ('request','resolved'),
  discord_id text not null, status text check in ('pending','claimed','sent','failed','skipped') default 'pending',
  claimed_by text check in ('main','panel'), claimed_at timestamptz, tried_by text[] not null default '{}',
  attempts int default 0, error text, created_at timestamptz default now(), sent_at timestamptz`.
  Indexes: `(status, created_at)` and `(request_id)`.
- `consent_dms`, where a DM lives:
  `request_id uuid pk fk cascade, bot text check in ('main','panel'), channel_id text, message_id text, sent_at timestamptz`.
- **Triggers** (security definer, `search_path = public`). These cover every path: lookup, ticket
  request-access, /userinfo, panel, lazy expiry and admin cancel.
  - `after insert on data_access_requests`: if `status='pending'` and the customer's `users.discord_id` is not
    null, insert a `request` event.
  - `after update of status`: when the status leaves `pending`, or goes from `approved` to `revoked`/`expired`,
    insert a `resolved` event for the same discord_id. Mark any still-`pending` `request` event for that request
    as `skipped`, so no DM goes out for an already-answered request.
- RLS on, no policies (service role only), like every other table.

### A2. `POST /api/bot/consent-events` (BOT_API_SECRET via `botAuthorised`)

Same pattern as `app/api/bot/billing-events/route.ts`. Body is a discriminated union:

- `{ action: "claim", bot: "main" | "panel" }`
  - Requeue stale claims older than 10 min. Mark `request` events older than the request's `expires_at` as
    `skipped`.
  - A `request` event can be claimed by **either** bot, but not by one already in `tried_by`.
  - A `resolved` event can only be claimed by the bot named in `consent_dms.bot` for that request. If no
    `consent_dms` row exists, mark it `skipped`.
  - Claim atomically: `update ... set status='claimed', claimed_by=$bot where id=$id and status='pending'
    returning`. Whoever wins the row sends it. Batch size is 10.
  - Response: `{ events: [{ id, kind, requestId, discordId, staffName, ticketSubject|null, requestExpiresAt,
    reason, state: "pending"|"approved"|"denied"|"expired"|"revoked", decidedVia|null, decidedAt|null,
    grantExpiresAt|null, dm: { channelId, messageId } | null }] }`.
  - `staffName` is a first name or display name only, never an email.
- `{ action: "ack", id, ok: true, channelId?, messageId? }`. For a `request` event this upserts `consent_dms`.
  Then mark the event `sent`.
- `{ action: "ack", id, ok: false, code: "dm_closed" | "unknown_user" | "other", retry?: boolean, error? }`:
  - add the bot to `tried_by`
  - if the other bot is not yet in `tried_by` and `code` is `dm_closed` or `other`, set it back to `pending` so
    the other bot can try
  - otherwise retry up to 4 attempts, then `failed`.

### A3. `POST /api/bot/consent` (existing): extend

- Accept button ids from both bots. Body is unchanged.
- The response adds `ticketChannelId` from the request row and `decidedVia`/`state` on `409 already_answered`,
  so the bot can say "already approved on the game panel".

### A4. Panel bridge: `POST /api/panel/consent/*`

Auth uses the new env `PANEL_API_SECRET`. Read it via `lib/env.ts` and compare with `timingSafeEqual` on the
Bearer token. A missing secret means 503. Every route is `force-dynamic` and `no-store`, and the body is zod
`strictObject`. The panel identifies people by **email** (panel `users.email` = site `users.email`,
lower-cased). These emails travel only server-to-server and never reach a staff browser.

| route | body | result |
|---|---|---|
| `lookup` | `{ staffEmail, target: { customerEmail } \| { uid } \| { discordId }, reason? }` | `{ found:false }` or `{ found:true, maskedName, customerUid, access:"pending"\|"granted", requestId, expiresAt, customerEmail? }`. `customerEmail` is present **only** when `access==="granted"`, so the panel can map to its own user. Staff are resolved by email to a site user with role staff/admin/owner; otherwise `403 { error:"not_team" }`. Site admins/owners get `granted`. Reuse `findCustomer`, `activeGrant`, `openRequest`, `createRequest` (now with `origin:'game_panel'`), `notifyCustomer`, the per-staff rate limit `lookup:<staffId>` 20/h, and `audit`. **Note:** `target.customerEmail` is used only when the panel already resolved a panel UUID to a local user. The panel never forwards staff-typed emails. |
| `check` | `{ staffEmail, customerEmail }` | `{ granted, state, expiresAt }`, built on `accessState` |
| `staff-requests` | `{ staffEmail }` | `listForStaff` rows. For `approved` rows, also `customerEmail` (server-to-server only). |
| `customer/list` | `{ customerEmail }` | `{ pending: [...], active: [...], recent: [...] }`. `recent` is the request ids decided in the last 10 min with `decidedVia` and `status`, so a UI that still shows a prompt can say "approved on the website". Items: `{ id, staffName, reason, status, requestedAt, expiresAt, origin, decidedVia }`. |
| `customer/decide` | `{ customerEmail, requestId, decision:"approve"\|"deny"\|"revoke" }` | Calls `decide(customerId, requestId, decision, "game_panel")` and audits `consent.<decision>` with `via:'game_panel'`. Returns `200 { ok:true }`, or `409 { error:"already_answered", state, decidedVia }`. |

Unknown customer email returns `404 { error:"unknown_customer" }`. The panel treats this as "no requests" for
list, and as deny for check.

### A5. Site changes elsewhere

- `lib/console/consent.ts`: `createRequest(..., opts?: { origin?, ticketChannelId? })` and
  `decide(..., via: "panel"|"email"|"discord"|"game_panel")`. Update types such as the `QueueRow.decidedVia`
  union and the admin consent page labels.
- `app/api/console/customers/lookup/route.ts`: for **staff**, `email` gives `{found:false}`. It still audits
  `by:'email', found:false, blocked:true`. Update `CustomerLookup.tsx` copy so staff are offered only UID or
  Discord id.
- `app/api/bot/userinfo/route.ts` and `bot/src/commands/userinfo.js`: create the request with
  `origin:'discord', ticketChannelId`. The command must **stop sending the DM itself**, because the outbox now
  does it. The command just replies "request sent to the customer".
- **Popup on the site.** Add a new `components/access/ConsentPrompt.tsx` mounted in `app/dashboard/layout.tsx`
  for client accounts.
  - It polls `GET /api/account/access-requests` every 15 s, on `visibilitychange`/`focus`, and over a
    `BroadcastChannel('astrelyse-consent')` between tabs.
  - It shows a Liquid Glass modal per DESIGN.md for the oldest pending request: staff name, reason, "access
    ends after 24 h", **Approve**, **Deny** and "Decide later". "Decide later" hides it for 30 min, stored in
    sessionStorage.
  - If the request vanishes from `pending` while open, close it and show a glass toast: "Already answered on
    {label}". Use `recent` from the list endpoint, so extend `listForCustomer` to return `recent` with
    `decidedVia`.
  - `PrivacyView.tsx` gets the same 15 s refresh.

---

## B. Bots: DM delivery (main bot `front-end landing/bot`, panel bot `panel/packages/discord-bot`)

Both bots run the **same worker** against `/api/bot/consent-events`. Each bot sends its own name: the main bot
uses `bot:"main"` and the panel bot uses `bot:"panel"`. Whichever bot claims first sends the DM, and only that
bot can later edit it.

- **Poll** every 5 s, `unref`'d. It is off when the env `CONSENT_DM=off`. Panel bot: add the setting to the zod
  `config.ts` with default `on`.
- **`request` event**: open a DM with `discordId` and send an embed in Astrelyse colours:
  - title "Astrelyse support is asking to view your account"
  - fields for staff name, reason (if any), "Access ends 24 h after you approve" and "Request expires
    <t:…:R>"
  - buttons `Approve` (success, id `uc:a:<requestId>`) and `Deny` (danger, id `uc:d:<requestId>`), plus a
    link button "Review on the website" → `${siteUrl}/dashboard/privacy`
  - Ack with `channelId`/`messageId`. On Discord error 50007 (cannot DM) ack `ok:false, code:"dm_closed"`, and
    on unknown user ack `code:"unknown_user"`.
- **`resolved` event**: fetch `dm.channelId`/`dm.messageId`, edit the embed and remove the buttons.
  - approved → green, "Approved on {label}", "Support can view your account until <t:grantExpiresAt:f>.
    Revoke any time on the website or panel."
  - denied → red, "Denied on {label}. Nothing was shared."
  - expired → grey, "This request expired."
  - revoked → grey, "Access revoked on {label}."
  - Use the label table above. If the message is gone, still ack ok.
- **Button handler** (`uc:` prefix, both bots):
  - Accept `uc:<a|d>:<id>` and the legacy `uc:<a|d>:<id>:<channelId>`. `deferUpdate`, then POST
    `/api/bot/consent`.
  - On 200, edit immediately (as today, with "Approved on Discord").
  - On 409, edit to the resolved state using `state`/`decidedVia`, e.g. "Already approved on the game panel",
    and remove the buttons.
  - Ping staff in `ticketChannelId` if present and reachable. Never include customer data in the ping.
- Main bot: refactor `bot/src/events/consent.js` and add `bot/src/consentDm.js` (worker), started from
  `index.js` like `billingDm.js`. Add `consentEvents` to `bot/src/api.js`.
- Panel bot: add `src/consent/worker.ts`, `src/consent/buttons.ts` and a `DashboardClient` method for raw POST
  (the existing client uses `BOT_API_SECRET` and the site URL). Wire them in `index.ts`. Add vitest tests for
  customId parsing, the claim→send→ack flow with mocked fetch/discord, and the label mapping.

---

## C. Panel backend (Laravel, `/Users/ayush/Documents/Astrelyse/panel`)

- **Config/env**: `config/services.php` → `'astrelyse_site' => ['url' => env('ASTRELYSE_SITE_URL'), 'secret' => env('PANEL_API_SECRET')]`.
  Document both in `.env.example`.
- **`app/Services/Consent/SiteConsentClient.php`**: wraps the A4 routes using the `Http` facade with an 8 s
  timeout and a Bearer token. Every failure throws `ConsentUnavailableException`, which callers treat as **no
  access**.
- **`app/Services/Consent/CustomerAccessGate.php`**
  - `needsConsent(User $actor): bool`: true when `role_id !== null && !root_admin && !is_owner`.
  - `canView(User $actor, User $customer): bool`
    - true if the actor doesn't need consent, or `$actor->id === $customer->id`
    - false if the target is itself a role holder or root admin, so staff can't open other staff
    - otherwise `check` over the bridge, cached ≤ 15 s per (actor, customer) pair and never past `expiresAt`
  - `assertCanView(...)` throws `ConsentRequiredException` (403, Pterodactyl error envelope, `code:
    "ConsentRequired"`, `meta: { user_uuid }`).
- **New permission** `admin:customers.request` in `app/Enum/Permissions.php`. It is needed to call lookup. The
  role editor picks it up via `Role::grantablePermissions()`.
- **Enforce** in the admin API for role holders:
  - `UserController` show/update/delete, `DisableTwoFactorController`, and any `users/{user}/...` sub-route →
    `assertCanView($actor, $user)`.
  - `UserController@index` for role holders returns **only users with a live grant to this actor**: ask the
    site via `staff-requests`, map approved emails to local users, and paginate that set. `filter[email]` and
    free-text search that looks like an email return an empty page.
  - Admin servers: show/update/delete/sub-resources (databases, mounts, backups, startup, transfer, activity)
    → `assertCanView($actor, $server->user)`. Index for role holders → only servers whose owner is in the
    granted set.
  - Admin activity log: role holders see only entries whose actor or subject is themselves or a granted
    customer.
  - Admin `UserResource`/`ServerResource` stay unchanged. The filter happens before them.
  - Check `app/Http/Controllers/Api/Admin/**` and `routes/api-admin.php` for every route that takes `{user}`
    or `{server}`. Add a feature test per route family.
- **New admin endpoints** (`routes/api-admin.php`, prefix `/customers`, permission `admin:customers.request`):
  - `POST /lookup` `{ by: "uuid"|"uid"|"discord"|"email", value, reason? }`
    - `email` returns `{ found:false }` with no site call and a `customer.lookup` activity entry with
      `blocked: email`.
    - `uuid` resolves the local panel user (must be a plain customer). If there is none, return
      `{found:false}`. Otherwise call site lookup with `customerEmail`.
    - `uid`/`discord` call site lookup directly.
    - Response: `{ found, masked_name, customer_uid, access, expires_at, user_uuid? }`. `user_uuid` appears
      only when granted, mapped from the email the site returned.
  - `GET /requests` lists the actor's requests (from `staff-requests`), with `user_uuid` for approved ones.
- **Customer endpoints** (`routes/api-client.php`, account group):
  - `GET /api/client/account/access-requests` → `customer/list` for `auth()->user()->email`.
  - `POST /api/client/account/access-requests/{id}` `{ decision }` → `customer/decide`. Map a 409 to
    `409 { already_answered, state, decided_via }`.
  - The client API is open to every logged-in user. Root admins and role holders simply get empty lists.
  - Log activity `user:consent.approve|deny|revoke`.
- **Tests** (PHPUnit, `tests/Integration/Api/...`): fake the `Http` client. Cover these cases:
  - role holder without a grant gets 403 on user and server show
  - with a grant gets 200
  - site down gives 403
  - root admin bypasses
  - email lookup gives `found:false` with no HTTP call
  - index filtering
  - customer list/decide proxying and the 409 mapping
- Run `graphify update .` after the change, per the project CLAUDE.md.

---

## D. Panel frontend (`resources/scripts`)

- **Port Liquid Glass**: add the DESIGN.md tokens (§3) and the `.lg` material anatomy (§4) to the panel
  styles, preferably as a small `resources/scripts/components/ui/glass/` module (`GlassModal`, `GlassToast`,
  `GlassButton`). Follow the §8 accessibility rules and the §9 rules, and honour
  `prefers-reduced-motion`/`prefers-reduced-transparency`. Don't copy the site's `lib/liquid.ts` lens effect
  unless it fits. The static material plus press motion is enough.
- **Customer popup** `components/consent/ConsentPrompt.tsx`, mounted once in the authenticated app shell:
  - Same behaviour as the site popup (A5): poll every 15 s, on focus/visibility, and over a BroadcastChannel
    across tabs. Show the oldest pending request with Approve/Deny/Decide later.
  - If the request vanishes, close and toast "Already answered on {label}".
  - A 409 on decide shows the same toast.
  - Copy matches the site word-for-word: "Astrelyse support is asking to view your account", and so on.
- **Account page**: a "Data access" card listing active grants (staff name, ends at, **Revoke**) and pending
  requests.
- **Admin area, role holders only**. Root admins and owners see today's UI.
  - The Users page becomes **Customer lookup**: identifier type select (Panel UUID / AST UID / Discord ID, with
    no email option), value, optional reason. The result is a masked-name card with its state (waiting /
    granted until X / denied / expired). It shows "Open account" only when granted.
  - Below it, "My requests" comes from `GET /api/admin/customers/requests`.
  - Granted customers list (from users index).
  - Any 403 `ConsentRequired` from an admin user/server page renders a glass **ConsentGate** panel with
    "Request access" (calls lookup with `by:"uuid"`), instead of a generic error.
- Add generated API types if the project uses `openapi-ts` (`openapi-ts.config.ts`). Add vitest tests for
  the prompt's vanish/409 behaviour.

---

## Contract checklist (all streams must match)

- Button custom ids: `uc:a:<uuid>`, `uc:d:<uuid>`. The legacy 4-part form is still accepted.
- Bot names: `main`, `panel`.
- Labels: `panel`→"the Astrelyse website", `game_panel`→"the game panel", `discord`→"Discord", `email`→"the email link".
- Env: site `PANEL_API_SECRET`; panel `ASTRELYSE_SITE_URL`, `PANEL_API_SECRET`; bots `CONSENT_DM` (default on).
- Poll intervals: UI 15 s, bots 5 s. Panel grant cache ≤ 15 s.
- Fail closed everywhere.

## Rollout order

1. Apply migration A1.
2. Deploy the site.
3. Set `PANEL_API_SECRET` on the site and the panel.
4. Deploy the panel.
5. Restart both bots.

Until step 4, panel role holders keep today's behaviour. **Do not** ship C without A deployed, or role holders
lose all customer access (fail closed).
