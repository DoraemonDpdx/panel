# Astrelyse customer bot

A friendly Discord bot for **customers**: look after their game servers, check invoices, open support tickets and get a one-time sign-in link to the website.

It talks **only to the website** (`POST ${SITE_URL}/api/bot/customer`, authenticated with `CUSTOMER_BOT_SECRET`). It holds **no panel API key**; the website resolves the Discord user to a customer account and does everything else. Team and admin work lives in the team bot (see `docs/BOT_SPLIT_PLAN.md` in the website repo).

Every reply is **ephemeral** (only the person who ran the command sees it). Stopping, restarting, force stopping, reinstalling and restoring a backup ask for confirmation first, with buttons only the invoker can press.

## Commands

| Command | What it does |
| --- | --- |
| `/servers` | List your servers |
| `/server info\|status\|power\|console\|backups\|backup-create\|backup-restore\|reinstall` | Look after one server (the `server` option autocompletes from your servers, cached 30 s) |
| `/billing invoices\|services` | Invoices (unpaid by default) and services |
| `/support tickets\|open` | Your tickets; `open` asks for subject and message in a form |
| `/status` | Platform status |
| `/login` | DMs you a one-time sign-in link (valid once, 5 minutes). The link is never shown in the channel or in the reply; if DMs are closed the bot explains how to allow them |
| `/account` | Your profile and a button to link Discord on the website (`/account/discord`) |
| `/help` | What the bot can do |

A customer whose Discord account is not linked gets a short explanation and a button to `${SITE_URL}/account/discord`. If one Discord account maps to several customer accounts, the bot shows a select menu and remembers the choice for 30 minutes.

## Setup

```bash
cp .env.example .env     # fill it in
npm ci
npm run register         # registers the slash commands
npm run dev              # or: npm run build && npm start
```

Environment: `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID` (optional; blank = global commands), `SITE_URL`, `CUSTOMER_BOT_SECRET`, `CONTROL_SECRET`, `CONTROL_PORT` (8787), `CONTROL_HOST` (127.0.0.1), `DATA_DIR` (`data`).

The bot only needs the `bot` and `applications.commands` scopes and no privileged intents. Members must allow DMs from server members for `/login`.

### Docker

```bash
docker build -t astrelyse-customer-bot .
docker run -d --restart on-failure --env-file .env -p 127.0.0.1:8787:8787 -v customerbot-data:/app/data astrelyse-customer-bot
```

## Control API (for the website's `/customerbot` dashboard)

Off unless `CONTROL_SECRET` is set. Send `Authorization: Bearer <CONTROL_SECRET>`; 20 wrong tokens a minute per address are answered with 429.

| Route | Answer |
| --- | --- |
| `GET /health` | No auth. `{ ok, ready }` |
| `GET /v1/status` | `{ ok, user: { tag, avatar }, uptimeSeconds, pingMs, guilds, commands, node }` |
| `POST /v1/stop` | Answers, then exits 0 |
| `POST /v1/restart` | Answers, then exits 75; needs a supervisor that restarts on failure (`docker --restart on-failure`, systemd `Restart=on-failure`) |
| `GET /v1/stats` | `{ commands: { "24h": { commands: { "<name>": n }, total }, "7d": … }, loginsIssued: { "24h", "7d" }, dmsFailed: { "24h", "7d" } }` |
| `GET /v1/settings` | `{ servers, billing, support, login, status }` booleans |
| `PUT /v1/settings` | Any subset of those booleans; unknown keys or non-booleans are `400` and change nothing |

A disabled feature answers "This isn't available right now." Toggles live in `data/settings.json`, stats in `data/stats.json`. `/account` and `/help` cannot be switched off.

## Development

```bash
npm run typecheck
npm test        # vitest, fetch is mocked
npm run build
```
