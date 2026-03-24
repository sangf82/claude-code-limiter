#!/usr/bin/env node

'use strict';

// ---- Color helpers (no external deps) ----

const supportsColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = {
  red:    (s) => supportsColor ? `\x1b[31m${s}\x1b[0m` : s,
  green:  (s) => supportsColor ? `\x1b[32m${s}\x1b[0m` : s,
  yellow: (s) => supportsColor ? `\x1b[33m${s}\x1b[0m` : s,
  cyan:   (s) => supportsColor ? `\x1b[36m${s}\x1b[0m` : s,
  bold:   (s) => supportsColor ? `\x1b[1m${s}\x1b[0m`  : s,
  dim:    (s) => supportsColor ? `\x1b[2m${s}\x1b[0m`  : s,
};

// ---- Help text ----

const HELP = `
${c.bold('claude-code-limiter')} - Share one Claude Code subscription across multiple users

${c.bold('USAGE')}
  claude-code-limiter <command> [options]

${c.bold('COMMANDS')}
  ${c.cyan('setup')}       Install the limiter hook on this machine (requires sudo)
  ${c.cyan('uninstall')}   Remove all limiter files and restore original settings (requires sudo)
  ${c.cyan('status')}      Show current usage and limits for this machine's user
  ${c.cyan('sync')}        Force re-sync config from the server (requires sudo)
  ${c.cyan('serve')}       Start the limiter server (REST API + dashboard)

${c.bold('OPTIONS')}
  --code <CODE>       One-time install code from the admin dashboard (setup only)
  --server <URL>      Server URL, e.g. https://limiter.example.com (setup only)
  --port <PORT>       Port for the server to listen on (serve only, default: 3000)
  --yes, -y           Skip confirmation prompts
  --help, -h          Show this help message

${c.bold('EXAMPLES')}
  ${c.dim('# Install on a user\'s machine (admin gives them the code)')}
  sudo npx claude-code-limiter setup --code CLM-alice-a8f3e2 --server https://your-server:3000

  ${c.dim('# Check current usage')}
  npx claude-code-limiter status

  ${c.dim('# Force re-sync config from server')}
  sudo npx claude-code-limiter sync

  ${c.dim('# Remove the limiter from this machine')}
  sudo npx claude-code-limiter uninstall

  ${c.dim('# Start the server')}
  npx claude-code-limiter serve --port 3000

  ${c.dim('# Start the server via Docker')}
  docker run -p 3000:3000 -v data:/data -e ADMIN_PASSWORD=xxx claude-code-limiter
`.trim();

// ---- Argument parsing (no external deps, just process.argv) ----

const argv = process.argv.slice(2);

function hasFlag(name) {
  return argv.includes(name);
}

function getOption(name) {
  const idx = argv.indexOf(name);
  if (idx !== -1 && idx + 1 < argv.length) {
    return argv[idx + 1];
  }
  return undefined;
}

// Find the first positional arg (not a flag and not a flag's value)
function getCommand() {
  const flagsWithValue = new Set(['--code', '--server', '--port']);
  const skip = new Set();
  for (let i = 0; i < argv.length; i++) {
    if (flagsWithValue.has(argv[i])) {
      skip.add(i);
      skip.add(i + 1);
    }
  }
  for (let i = 0; i < argv.length; i++) {
    if (!skip.has(i) && !argv[i].startsWith('-')) {
      return argv[i];
    }
  }
  return undefined;
}

const showHelp    = hasFlag('--help') || hasFlag('-h');
const skipConfirm = hasFlag('--yes')  || hasFlag('-y');
const code        = getOption('--code');
const server      = getOption('--server');
const port        = getOption('--port');
const command     = getCommand();

// ---- Help / no command ----

if (showHelp || !command) {
  console.log(HELP);
  process.exit(showHelp ? 0 : 1);
}

// ---- Error helpers ----

function die(msg) {
  console.error(c.red('Error: ') + msg);
  process.exit(1);
}

// ---- Route commands ----

async function main() {
  switch (command) {
    case 'setup': {
      if (!code) {
        die('--code is required for setup.\n'
          + c.dim('Usage: sudo npx claude-code-limiter setup --code <CODE> --server <URL>'));
      }
      if (!server) {
        die('--server is required for setup.\n'
          + c.dim('Usage: sudo npx claude-code-limiter setup --code <CODE> --server <URL>'));
      }
      const installer = require('../src/installer.js');
      await installer.setup({ code, server, skipConfirm });
      break;
    }

    case 'uninstall': {
      const installer = require('../src/installer.js');
      await installer.uninstall({ skipConfirm });
      break;
    }

    case 'status': {
      const installer = require('../src/installer.js');
      await installer.status();
      break;
    }

    case 'sync': {
      const installer = require('../src/installer.js');
      await installer.sync();
      break;
    }

    case 'serve': {
      const serverPort = parseInt(port || process.env.PORT || '3000', 10);
      if (isNaN(serverPort) || serverPort < 1 || serverPort > 65535) {
        die('Invalid port number. Must be between 1 and 65535.');
      }
      const app = require('../../server/src/server/index.js');
      app.start(serverPort);
      break;
    }

    default:
      console.error(c.red(`Unknown command: ${command}`));
      console.log('');
      console.log(HELP);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(c.red('Fatal error: ') + err.message);
  if (process.env.DEBUG) {
    console.error(err.stack);
  }
  process.exit(1);
});
