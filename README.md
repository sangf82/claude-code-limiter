<p align="center">
  <h1 align="center">claude-code-limiter</h1>
  <p align="center">
    Share one Claude Code subscription across your team — with enforced per-user quotas, credit budgets, and a kill switch.
  </p>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/claude-code-limiter"><img src="https://img.shields.io/npm/v/claude-code-limiter?color=blue&label=npm" alt="npm version"></a>
  <a href="https://github.com/howincodes/claude-code-limiter/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License"></a>
  <a href="https://ghcr.io/howincodes/claude-code-limiter"><img src="https://img.shields.io/badge/docker-ghcr.io-blue?logo=docker" alt="Docker"></a>
  <a href="https://railway.app/template/YOUR_TEMPLATE_ID"><img src="https://railway.app/button.svg" alt="Deploy on Railway" height="20"></a>
</p>

<p align="center">
  <b>One subscription. Multiple users. Fair usage for everyone.</b>
</p>

---

## :fire: The Problem

You're paying **$100/month** for Claude Code Max. Three developers on your team share it. Maybe an intern too.

Then someone discovers Opus and sends 50 prompts in an hour. Now the entire subscription is rate-limited for the rest of the day. Everyone else gets nothing.

Claude Code has **zero built-in usage controls**. No per-user limits. No quotas. No visibility into who's using what. You're flying blind, and you're paying the bill.

## :bulb: The Solution

**claude-code-limiter** gives you a complete usage control layer for shared Claude Code subscriptions:

- **Per-user quotas** — each person gets their own daily/weekly/monthly limits
- **Credit budgets** — one budget across all models; users decide how to spend it
- **Real-time dashboard** — see who's using what, right now
- **Kill switch** — instantly revoke access and force logout, remotely

It works by installing a system-level hook on each user's machine that checks limits on every prompt. The hook talks to a lightweight server you self-host. Users can't bypass it without the machine's root password.

```
┌──────────────────────────────────────────────────────┐
│              Your Server (Docker / Cloud)              │
│  ┌─────────┐  ┌──────────┐  ┌─────────────────────┐  │
│  │ REST API │  │  SQLite  │  │    Web Dashboard    │  │
│  └────┬─────┘  └────┬─────┘  └──────────┬──────────┘  │
│       └──────────────┴──────────────────┘              │
└────────────┬─────────────┬──────────────┬──────────────┘
             │             │              │
        ┌────┘      ┌─────┘       ┌──────┘
        ▼            ▼             ▼
   ┌─────────┐ ┌─────────┐ ┌───────────┐
   │  Dev A's │ │  Dev B's│ │  Your     │
   │  MacBook │ │  Laptop │ │  Browser  │
   │          │ │         │ │ (Dashboard)│
   │ hook.js  │ │ hook.js │ └───────────┘
   │    ↕     │ │    ↕    │
   │  local   │ │  local  │
   │  cache   │ │  cache  │
   └─────────┘ └─────────┘
```

Hooks check local cache first (zero latency), sync with the server in the background, and fail-closed if anything is missing. Deleting local files doesn't reset counts — the server is the source of truth.

---

## :rocket: Quick Start

### 1. Deploy the server

The server must be reachable from every user's machine. Deploy it anywhere with a public URL.

**Option A: One-click cloud deploy (easiest)**

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/YOUR_TEMPLATE_ID)

Or use [Render](https://render.com), [Fly.io](https://fly.io), or any cloud provider. Set `ADMIN_PASSWORD` as an environment variable.

**Option B: Docker on a VPS**
```bash
docker run -d \
  --name claude-limiter \
  -p 3000:3000 \
  -v claude-limiter-data:/data \
  -e ADMIN_PASSWORD=your-secure-password \
  ghcr.io/howincodes/claude-code-limiter:latest
```

**Option C: Docker Compose with auto-HTTPS**
```bash
cd packages/server
DOMAIN=limiter.yourdomain.com ADMIN_PASSWORD=secret docker compose up -d
```
Caddy handles SSL certificates automatically.

**Option D: Office/home network**
```bash
# Run on any machine on your network
ADMIN_PASSWORD=secret npx @claude-limiter/server
# Server is at http://192.168.x.x:3000 — reachable by all machines on the same network
```

> **Important:** Every user's machine needs to reach the server URL. `localhost` only works on your own machine. Use a public URL, VPS IP, or local network IP.

### 2. Add users in the dashboard

Open your server URL (e.g. `https://limiter.yourdomain.com/dashboard`) and log in with your admin password.

Click **Add User** → set their name, limits, and credit budget → copy the install code.

### 3. Install on each user's machine

```bash
sudo npx claude-code-limiter setup \
  --code CLM-alice-a8f3e2 \
  --server https://limiter.yourdomain.com
```

Restart Claude Code. That's it. The user is now rate-limited.

---

## :no_entry: What Users See When Blocked

When a user hits their limit, the next prompt is blocked with a clear message:

```
Daily sonnet limit reached for Alice.
Used 20/20 prompts today.

All usage today:
  haiku:  12/40  (28 left)
  opus:    5/5   (0 left)
  sonnet: 20/20  (0 left)

Credit balance: 0/100

Options:
  Switch to another model (if quota remains)
  Try again later
```

When an admin kills access remotely:

```
Your Claude Code access has been revoked by the admin.
Contact your admin to restore access.
```

When a model is outside its allowed time window:

```
Opus is only available 9:00 AM - 6:00 PM (America/New_York).
Current time: 8:15 PM. Try sonnet or haiku instead.
```

---

## :sparkles: Features

### Limit Types

| Type | Example | Description |
|------|---------|-------------|
| **Per-model caps** | `opus: 5/day, sonnet: 20/day` | Hard limit per model per time window |
| **Credit budgets** | `100 credits/day` | One budget across all models — opus costs 10, sonnet costs 3, haiku costs 1 |
| **Time-of-day rules** | `opus: 9am–6pm only` | Restrict expensive models to business hours |

### Window Types

| Window | Behavior |
|--------|----------|
| `daily` | Resets at midnight local time |
| `weekly` | Resets Monday midnight |
| `monthly` | Resets 1st of month |
| `sliding_24h` | Rolling 24-hour window — no midnight gaming |

### Credit Weights (configurable)

| Model | Default Cost |
|-------|-------------|
| Opus | 10 credits |
| Sonnet | 3 credits |
| Haiku | 1 credit |

With a **100 credit/day** budget, a user can do: **10 Opus** prompts, **or 33 Sonnet**, **or 100 Haiku**, or any mix.

### Admin Controls

- :bar_chart: **Real-time dashboard** — live usage bars, per-user breakdowns, event feed via WebSocket
- :zap: **Kill switch** — instantly revoke access + force `claude auth logout` on the user's machine
- :pause_button: **Pause/resume** — temporarily suspend a user without revoking
- :gear: **Live config push** — change limits on the server; users pick them up on next prompt (no reinstall)

---

## :bar_chart: Dashboard

> **Screenshot placeholder:** The dashboard shows an overview page with all users listed in cards. Each card has the user's name, a colored status badge (active/paused/killed), per-model usage progress bars, credit balance, and last active timestamp. A live event feed on the right shows recent prompts in real time via WebSocket. The user detail page shows monthly trend charts, active limit rules, time-of-day schedules, and machine info (hostname, platform).

<!-- TODO: Replace with actual screenshot -->
<!-- ![Dashboard Screenshot](docs/images/dashboard.png) -->

---

## :gear: How It Works

Every Claude Code prompt passes through four hook events:

```
User types a prompt
        │
        ▼
┌─ SessionStart ──────────────────────────────────┐
│  Captures active model (opus/sonnet/haiku)       │
│  Syncs config + limits from server               │
└──────────────────────────────────────────────────┘
        │
        ▼
┌─ UserPromptSubmit (THE GATE) ───────────────────┐
│  Calls server /check → "Is this prompt allowed?" │
│  Server checks: status → time rules →            │
│    per-model caps → credit budget                 │
│  If denied → blocks with usage summary            │
│  If server down → falls back to local cache       │
└──────────────────────────────────────────────────┘
        │ (allowed)
        ▼
   Claude does its work
   (tool calls pass through PreToolUse
    for kill/pause enforcement only)
        │
        ▼
┌─ Stop ──────────────────────────────────────────┐
│  Increments usage counter (local + server)       │
│  One count per completed turn                    │
└──────────────────────────────────────────────────┘
```

**Key design decisions:**
- We count **turns** (user prompts), not individual tool calls
- The hook has **zero npm dependencies** — uses only Node.js built-ins
- Local-first: checks are instant, server syncs happen in the background
- **Fail-closed**: if all limiter files are deleted, access is denied (not allowed)

---

## :lock: Security

8 layers of protection. The only way to bypass this is with the machine's root/admin password — and if someone has that, they already have access to the subscription credentials anyway.

| # | Layer | What It Prevents |
|---|-------|-----------------|
| 1 | **Managed settings** | `managed-settings.json` in system directory — can't be overridden by user or project config |
| 2 | **allowManagedHooksOnly** | Users cannot define their own hooks to bypass the limiter |
| 3 | **OS file permissions** | Hook, config, and server files are root-owned — users can read but not modify |
| 4 | **Watchdog daemon** | Runs every 5 min, SHA-256 integrity check, auto-restores tampered files from root-only backup |
| 5 | **Server-side tracking** | Deleting local usage files doesn't reset counts — the server is the source of truth |
| 6 | **Kill switch** | Instant remote lockout + forces `claude auth logout` |
| 7 | **Per-user auth tokens** | Each user has a unique token stored in a root-owned file — prevents impersonation |
| 8 | **Fail-closed** | Missing config = denied, not allowed. Watchdog restores files within 5 minutes |

### File Locations

```
macOS:   /Library/Application Support/ClaudeCode/
Linux:   /etc/claude-code/
Windows: C:\Program Files\ClaudeCode\

<base>/
├── managed-settings.json       ← hooks + allowManagedHooksOnly
├── .backup/                    ← root-only, watchdog restore source
│   ├── managed-settings.json
│   ├── hook.js
│   ├── config.json
│   └── checksums.json          ← SHA-256 hashes of all protected files
└── limiter/
    ├── hook.js                 ← the rate limiter (zero npm deps)
    ├── config.json             ← cached limits + credit weights
    ├── server.json             ← server URL + auth token
    ├── cache.json              ← last server response (offline fallback)
    ├── session-model.txt       ← current model
    └── usage/
        └── YYYY-MM-DD.json    ← local counters
```

---

## :whale: Self-Hosting

### Docker (recommended)

```bash
docker run -d \
  --name claude-limiter \
  -p 3000:3000 \
  -v claude-limiter-data:/data \
  -e ADMIN_PASSWORD=your-secure-password \
  ghcr.io/howincodes/claude-code-limiter:latest
```

### Docker Compose with HTTPS

```yaml
# docker-compose.yml
version: "3.8"
services:
  limiter:
    image: ghcr.io/howincodes/claude-code-limiter:latest
    environment:
      - ADMIN_PASSWORD=your-secure-password
    volumes:
      - limiter-data:/data

  caddy:
    image: caddy:2-alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy-data:/data
    depends_on:
      - limiter

volumes:
  limiter-data:
  caddy-data:
```

```
# Caddyfile
limiter.yourdomain.com {
    reverse_proxy limiter:3000
}
```

### One-Click Cloud Deploy

| Platform | Deploy |
|----------|--------|
| Railway  | [![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/YOUR_TEMPLATE_ID) |
| Render   | [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/howincodes/claude-code-limiter) |
| Fly.io   | `fly launch --image ghcr.io/howincodes/claude-code-limiter:latest` |

### LAN Mode (no domain needed)

Run Docker on any machine on your home network. Point users to `http://192.168.1.x:3000`. No HTTPS needed for local networks. The hook's 3-second timeout gracefully handles Wi-Fi blips by falling back to local cache.

---

## :wrench: Configuration

### Limit Rules

Limits are configured per-user via the dashboard. Rules stack — the most restrictive one wins.

**Per-model cap:**
```json
{ "type": "per_model", "model": "opus", "window": "sliding_24h", "value": 5 }
```

**Credit budget:**
```json
{ "type": "credits", "window": "daily", "value": 100 }
```

**Time-of-day restriction:**
```json
{
  "type": "time_of_day",
  "model": "opus",
  "schedule_start": "09:00",
  "schedule_end": "18:00",
  "schedule_tz": "America/New_York"
}
```

### Credit Weights

Configured per-team on the server. Defaults:

```json
{ "opus": 10, "sonnet": 3, "haiku": 1 }
```

Change these in **Dashboard → Settings** to match your usage priorities.

### Evaluation Order

All rules are checked on every prompt. First "deny" wins:

```
1. Is user killed or paused?        → BLOCK
2. Is model in allowed time window?  → if no, BLOCK
3. Is per-model cap exceeded?        → if yes, BLOCK
4. Is credit budget exceeded?        → if yes, BLOCK
5. ALLOW
```

---

## :computer: CLI Reference

### Setup (run on each user's machine)

```bash
sudo npx claude-code-limiter setup --code <INSTALL_CODE> --server <SERVER_URL>
```

Installs the hook, managed settings, watchdog daemon, and registers with the server. Requires `sudo` because files are written to system-protected directories.

### Check Status

```bash
npx claude-code-limiter status
```

```
╔══════════════════════════════════════════════╗
║     claude-code-limiter — Status              ║
╚══════════════════════════════════════════════╝

  User:          Alice
  Date:          2026-03-24
  Active model:  sonnet
  Server:        https://your-server:3000

  ┌────────────┬───────┬───────┬──────────────────────┬──────────┐
  │ Model      │ Used  │ Limit │ Progress             │ Left     │
  ├────────────┼───────┼───────┼──────────────────────┼──────────┤
  │ opus       │   3   │   5   │ ██████████░░░░░░░░   │    2     │
  │ sonnet     │  12   │  20   │ ██████████░░░░░░░░   │    8     │
  │ haiku      │   0   │   ∞   │   ∞ unlimited        │    ∞     │
  └────────────┴───────┴───────┴──────────────────────┴──────────┘

  Credits: 61/100 remaining
```

### Force Sync

```bash
sudo npx claude-code-limiter sync
```

Pulls the latest config and limits from the server immediately.

### Uninstall

```bash
sudo npx claude-code-limiter uninstall
```

Removes the hook, managed settings, watchdog daemon, and all local data. Requires `sudo`.

---

## :question: FAQ

### Can a user bypass this?

Not without the machine's root/admin password. The hook runs from a system-protected directory with root-owned files. `allowManagedHooksOnly` prevents users from adding their own hooks. The watchdog daemon restores any tampered files every 5 minutes. Even if they delete everything, the hook fails closed (denies access, doesn't allow it).

### What if a user deletes the local usage files?

Nothing happens. Usage is tracked server-side. Deleting local files just means the hook falls back to server-side counts on the next check. The watchdog also restores config files from a root-only backup.

### Does this affect Claude.ai (the web app)?

No. This only controls **Claude Code** (the CLI/terminal tool). Claude.ai in the browser is completely unaffected.

### What happens if the server goes down?

The hook falls back to locally cached limits and usage data. Limits are still enforced. When the server comes back, everything syncs up. If there's no cache at all (fresh install, server never reached), the hook denies access (fail-closed).

### Does this count tool calls or prompts?

**Prompts (turns).** A single prompt might trigger 10+ tool calls (reading files, writing code, running commands). We count the turn, not each tool call. This means one user prompt = one unit of quota, regardless of how much work Claude does.

### What about auto-continue? Does that count as multiple turns?

Yes. If Claude hits an output limit and auto-continues, each continuation fires a `Stop` event and counts as a separate turn. This is intentional — each turn consumes real model capacity against your subscription. Admins should set limits with this in mind.

### Can I use this for a team at work?

Absolutely. It works for any group sharing a single Claude Code subscription — families, small teams, studios. Each deployment supports one admin and multiple users.

---

## :building_construction: Project Structure

```
claude-code-limiter/
├── package.json
├── bin/
│   ├── cli.js                  ← npx claude-code-limiter (client CLI)
│   └── server.js               ← npx claude-code-limiter serve
├── src/
│   ├── hook.js                 ← standalone hook (zero npm deps)
│   ├── installer.js            ← setup, uninstall, sync
│   ├── server/
│   │   ├── index.js            ← Express app
│   │   ├── db.js               ← SQLite schema + migrations
│   │   ├── routes/
│   │   │   ├── hook-api.js     ← /api/v1/* (hook communication)
│   │   │   └── admin-api.js    ← /api/admin/* (dashboard backend)
│   │   ├── services/
│   │   │   ├── limiter.js      ← limit evaluation engine
│   │   │   ├── usage.js        ← tracking + aggregation
│   │   │   └── auth.js         ← JWT (admin) + token (hook) auth
│   │   └── ws.js               ← WebSocket live updates
│   └── dashboard/
│       ├── index.html
│       ├── css/style.css
│       └── js/app.js
├── docker/
│   ├── Dockerfile
│   └── docker-compose.yml
└── tests/
    ├── hook.test.js
    ├── limiter.test.js
    └── api.test.js
```

**Two logical components, one npm package:**
- **Hook** (`src/hook.js`) — zero npm dependencies, uses only Node.js built-ins. Gets copied to the system directory during setup.
- **Server** — Express.js, better-sqlite3, ws. Serves the REST API, dashboard, and WebSocket feed on a single port.

---

## :handshake: Contributing

PRs welcome! This project is open source under the MIT license.

```bash
# Clone and install
git clone https://github.com/howincodes/claude-code-limiter.git
cd claude-code-limiter
npm install

# Start the server in development
npm start

# Run tests
npm test
```

**Key guidelines:**
- `src/hook.js` must remain **zero npm dependencies** — Node.js built-ins only
- The server uses Express + better-sqlite3 — keep it simple
- Dashboard is vanilla HTML/CSS/JS — no build step, no framework

See [CONTRIBUTING.md](https://github.com/howincodes/claude-code-limiter/blob/main/CONTRIBUTING.md) for details.

---

## :page_facing_up: License

[MIT](LICENSE) — Basha, 2026

---

<p align="center">
  <b>Stop sharing blindly. Start sharing fairly.</b><br>
  <a href="https://github.com/howincodes/claude-code-limiter">GitHub</a> · <a href="https://github.com/howincodes/claude-code-limiter/issues">Issues</a> · <a href="https://github.com/howincodes/claude-code-limiter/discussions">Discussions</a>
</p>
