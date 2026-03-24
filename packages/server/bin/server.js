#!/usr/bin/env node

'use strict';

// Server entry point for Docker CMD and `npm start`.
// Handles graceful shutdown on SIGTERM/SIGINT.

const app = require('../src/server/index.js');

const port = parseInt(process.env.PORT || '3000', 10);

console.log(`[server] Starting claude-code-limiter server...`);
console.log(`[server] NODE_ENV=${process.env.NODE_ENV || 'development'}`);
console.log(`[server] DATA_DIR=${process.env.DATA_DIR || '(default)'}`);

app.start(port);

// ---- Graceful shutdown ----

function shutdown(signal) {
  console.log(`\n[server] Received ${signal}. Shutting down gracefully...`);

  // Close the HTTP server so no new connections are accepted
  if (app.server) {
    app.server.close(() => {
      console.log('[server] HTTP server closed.');
      process.exit(0);
    });

    // Force exit after 10 seconds if connections don't drain
    setTimeout(() => {
      console.error('[server] Forcing shutdown after timeout.');
      process.exit(1);
    }, 10000).unref();
  } else {
    process.exit(0);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

// Catch unhandled errors so the container doesn't silently die
process.on('unhandledRejection', (err) => {
  console.error('[server] Unhandled rejection:', err);
});

process.on('uncaughtException', (err) => {
  console.error('[server] Uncaught exception:', err);
  process.exit(1);
});
