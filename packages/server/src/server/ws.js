'use strict';

const { WebSocketServer } = require('ws');

let wss = null;

/**
 * Set up a WebSocket server on the given HTTP server.
 * Listens on the /ws path.
 * @param {http.Server} server
 */
function setupWebSocket(server) {
  wss = new WebSocketServer({ noServer: true });

  // Handle upgrade requests for /ws path
  server.on('upgrade', (request, socket, head) => {
    const { pathname } = new URL(request.url, `http://${request.headers.host}`);
    if (pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (ws) => {
    // Send a welcome message
    ws.send(JSON.stringify({
      type: 'connected',
      timestamp: new Date().toISOString(),
    }));

    ws.on('error', (err) => {
      console.error('WebSocket client error:', err.message);
    });
  });

  console.log('WebSocket server ready on /ws');
}

/**
 * Broadcast an event to all connected dashboard clients.
 * @param {object} event - Event object with at least a `type` field.
 *   Supported types: user_check, user_blocked, user_counted, user_killed, user_status_change
 */
function broadcast(event) {
  if (!wss) return;

  const message = JSON.stringify(event);
  for (const client of wss.clients) {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(message);
    }
  }
}

/**
 * Get the number of connected clients.
 */
function getClientCount() {
  if (!wss) return 0;
  let count = 0;
  for (const client of wss.clients) {
    if (client.readyState === 1) count++;
  }
  return count;
}

module.exports = {
  setupWebSocket,
  broadcast,
  getClientCount,
};
