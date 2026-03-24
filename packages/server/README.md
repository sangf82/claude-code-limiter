# @howincodes/claude-code-limiter-server

Dashboard server for [claude-code-limiter](https://github.com/howincodes/claude-code-limiter). Manage per-user rate limits for shared Claude Code subscriptions.

This is the **admin server** — REST API + SQLite + real-time dashboard. Deploy it once, manage all your users from the browser.

For the client CLI (installed on each user's machine), see [@howincodes/claude-code-limiter](https://www.npmjs.com/package/@howincodes/claude-code-limiter).

## Deploy

### Docker (recommended)

```bash
docker run -d \
  --name claude-limiter \
  -p 3000:3000 \
  -v claude-limiter-data:/data \
  -e ADMIN_PASSWORD=your-secure-password \
  ghcr.io/howincodes/claude-code-limiter:latest
```

### Docker Compose with auto-HTTPS

```bash
DOMAIN=limiter.yourdomain.com ADMIN_PASSWORD=secret docker compose up -d
```

Caddy handles SSL certificates automatically.

### npm

```bash
ADMIN_PASSWORD=secret npx @howincodes/claude-code-limiter-server
```

### Office/home network

```bash
ADMIN_PASSWORD=secret npx @howincodes/claude-code-limiter-server
# Reachable at http://192.168.x.x:3000 by all machines on the network
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ADMIN_PASSWORD` | Yes (first run) | — | Dashboard login password |
| `PORT` | No | `3000` | Server port |
| `JWT_SECRET` | No | auto-generated | Secret for admin JWT tokens. Set this for persistent sessions across restarts |
| `DATA_DIR` | No | `./data` (local) or `/data` (Docker) | SQLite database location |

## Dashboard

Open `https://your-server/dashboard` and log in with your admin password.

**Overview** — All users at a glance: status, usage bars, credit consumption, live event feed

**User Detail** — Per-user breakdown: credit gauge, per-model bars, monthly trends, limits editor

**Add User** — Create a user, set limits, get an install code to copy

**Settings** — Credit weights (opus/sonnet/haiku costs), team name, password

## API

### Hook API (used by the CLI on each machine)

| Endpoint | Purpose |
|----------|---------|
| `POST /api/v1/sync` | Session start: sync config, report model |
| `POST /api/v1/check` | Gate check: is this prompt allowed? |
| `POST /api/v1/count` | Record a completed turn |
| `POST /api/v1/register` | Exchange install code for auth token |
| `GET /api/v1/health` | Health check for Docker/load balancers |

### Admin API (used by the dashboard)

| Endpoint | Purpose |
|----------|---------|
| `POST /api/admin/login` | Authenticate, get JWT |
| `GET /api/admin/users` | List users with live usage |
| `POST /api/admin/users` | Create user + install code |
| `PUT /api/admin/users/:id` | Update limits, kill, pause, reinstate |
| `DELETE /api/admin/users/:id` | Remove user |
| `GET /api/admin/usage` | Usage history for charts |
| `PUT /api/admin/settings` | Update credit weights, team name |

### WebSocket

Connect to `/ws` for real-time events: `user_check`, `user_blocked`, `user_counted`, `user_status_change`.

## Features

- **Per-model limits** — opus: 5/day, sonnet: 20/day, haiku: 50/day
- **Credit budgets** — 100 credits/day (opus=10, sonnet=3, haiku=1)
- **Sliding windows** — rolling 24h, or daily/weekly/monthly resets
- **Time-of-day rules** — opus only 9am-6pm
- **Kill switch** — instantly block a user + force logout
- **Live dashboard** — real-time usage via WebSocket
- **SQLite** — single file database, zero config, just mount a volume

## License

MIT
