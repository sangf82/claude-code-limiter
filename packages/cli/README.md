# @howincodes/claude-code-limiter

Per-user rate limits for [Claude Code](https://code.claude.com). Share one subscription across your team — with enforced quotas.

This is the **client CLI** that gets installed on each user's machine. It installs a system-level hook that checks limits on every prompt.

For the server/dashboard, see [@howincodes/claude-code-limiter-server](https://www.npmjs.com/package/@howincodes/claude-code-limiter-server).

## Install

Your admin will give you an install code and server URL:

```bash
sudo npx @howincodes/claude-code-limiter setup \
  --code CLM-alice-a8f3e2 \
  --server https://limiter.yourteam.com
```

Restart Claude Code. Done.

## Commands

```bash
# Check your current usage and limits
npx @howincodes/claude-code-limiter status

# Force sync with server (requires sudo)
sudo npx @howincodes/claude-code-limiter sync

# Remove the limiter (requires sudo)
sudo npx @howincodes/claude-code-limiter uninstall
```

## What happens when you hit a limit?

```
Daily opus limit reached.
Used 5/5 prompts today.

All usage today:
  opus:    5/5   (0 left)
  sonnet: 12/20  (8 left)
  haiku:  3/40   (37 left)

Credit balance: 15/100

Options:
  Switch to another model (if quota remains)
  Try again later
```

## How it works

The installer places a hook in Claude Code's `managed-settings.json` — the highest-priority config that can't be overridden. The hook checks limits on every prompt and counts usage on every completed turn.

- **Zero npm dependencies** — uses only Node.js built-ins
- **Works offline** — falls back to local cache if server is unreachable
- **Fail-closed** — missing config = blocked, not unlimited
- **6 security layers** — managed-settings, file permissions, watchdog daemon, server-side tracking, kill switch, fail-closed default

## For admins

See the [main repo](https://github.com/howincodes/claude-code-limiter) for full setup: server deployment, dashboard, Docker, and configuration.

## License

MIT
