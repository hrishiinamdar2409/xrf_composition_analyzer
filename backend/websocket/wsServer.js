/**
 * WebSocket server — pushes real-time reading events to connected browsers
 */

'use strict';

const { WebSocketServer } = require('ws');

let wss = null;

function startWebSocket(server) {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'CONNECTED' }));
  });

  console.log('[WebSocket] Server ready on /ws');
}

/**
 * Broadcast a new reading event to all connected browser clients.
 * @param {object} reading
 */
function broadcastNewReading(reading) {
  if (!wss) return;
  const msg = JSON.stringify({ type: 'NEW_READING', payload: reading });
  for (const client of wss.clients) {
    if (client.readyState === 1 /* OPEN */) {
      client.send(msg);
    }
  }
}

module.exports = { startWebSocket, broadcastNewReading };
