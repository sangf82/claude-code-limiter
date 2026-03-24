'use strict';

const path = require('path');
const express = require('express');
const http = require('http');
const db = require('./db');
const hookApi = require('./routes/hook-api');
const adminApi = require('./routes/admin-api');
const { setupWebSocket } = require('./ws');

const app = express();
const server = http.createServer(app);

// --- Middleware ---
app.use(express.json());

// CORS for dashboard (same-origin by default, but allow configurable origins)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// --- Static files: serve dashboard (React SPA built with Vite) ---
const dashboardDir = path.join(__dirname, '..', '..', '..', 'dashboard', 'dist');
app.use('/dashboard', express.static(dashboardDir));
app.get('/dashboard/*', (req, res) => res.sendFile(path.join(dashboardDir, 'index.html')));

// --- API Routes ---

// Hook API (per-user auth via auth_token)
app.use('/api/v1', hookApi);

// Admin API (JWT session auth)
app.use('/api/admin', adminApi);

// --- Health check ---
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// --- Redirect root to dashboard ---
app.get('/', (req, res) => {
  res.redirect('/dashboard');
});

// --- WebSocket setup ---
setupWebSocket(server);

// --- Error handling middleware ---
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// --- Start function ---
function start(port) {
  // Determine data directory
  const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');
  const dbPath = path.join(dataDir, 'limiter.db');

  // Initialize database
  db.init(dbPath);

  // Seed default team
  const adminPassword = process.env.ADMIN_PASSWORD;
  db.seed(adminPassword);

  server.listen(port, () => {
    console.log(`Claude Code Limiter server listening on port ${port}`);
    console.log(`Dashboard: http://localhost:${port}/dashboard`);
    console.log(`Hook API:  http://localhost:${port}/api/v1`);
    console.log(`Admin API: http://localhost:${port}/api/admin`);
    console.log(`WebSocket: ws://localhost:${port}/ws`);
  });
}

// If run directly: node src/server/index.js
if (require.main === module) {
  const PORT = parseInt(process.env.PORT, 10) || 3000;

  if (!process.env.ADMIN_PASSWORD) {
    console.warn('WARNING: ADMIN_PASSWORD not set. Using default "changeme".');
  }

  start(PORT);
}

module.exports = { app, server, start };
