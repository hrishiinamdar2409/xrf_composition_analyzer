/**
 * Goldscope Dashboard — Express server entry point
 */

'use strict';

const http = require('http');
const path = require('path');
const express = require('express');
const { startWebSocket, broadcastNewReading } = require('./websocket/wsServer');
const { startWatcher } = require('./watcher/fileWatcher');
const { getDb } = require('./db/database');

const readingsRouter = require('./routes/readings');
const samplesRouter = require('./routes/samples');
const createSettingsRouter = require('./routes/settings');
const auditRouter = require('./routes/audit');

const PORT = process.env.PORT || 3000;
const CONFIG_PIN = String(process.env.GOLDSCOPE_CONFIG_PIN || '2580');

const app = express();
app.use(express.json());

function requireConfigPin(req, res, next) {
  const supplied = String(req.get('x-config-pin') || '');
  if (!supplied || supplied !== CONFIG_PIN) {
    return res.status(401).json({ error: 'Configuration access denied' });
  }
  return next();
}

let activeExpFilePath = 'C:\\FischerExport\\results.exp';
const applyExpFileWatcher = (nextPath) => {
  activeExpFilePath = nextPath;
  startWatcher(activeExpFilePath, (reading) => {
    broadcastNewReading(reading);
  });
  console.log(`[Server] Reconfigured export watcher path: ${activeExpFilePath}`);
};

const settingsRouter = createSettingsRouter({
  onExpFilePathChange: applyExpFileWatcher,
});

// Serve React frontend static files (built output)
app.use(express.static(path.join(__dirname, '..', 'frontend', 'dist')));

// API routes
app.use('/api/readings', readingsRouter);
app.use('/api/samples', samplesRouter);
app.use('/api/settings', requireConfigPin, settingsRouter);
app.use('/api/audit', auditRouter);

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'));
});

// Initialise database
getDb();

// Start HTTP + WebSocket server
const server = http.createServer(app);
startWebSocket(server);

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[Server] Goldscope Dashboard running at http://localhost:${PORT}`);

  // Load export file path from settings and start watcher
  const settingsPath = path.join(__dirname, '..', 'settings.json');
  let expFilePath = activeExpFilePath;
  try {
    const fs = require('fs');
    if (fs.existsSync(settingsPath)) {
      expFilePath = JSON.parse(fs.readFileSync(settingsPath, 'utf8')).expFilePath || expFilePath;
    }
  } catch (_) {}

  applyExpFileWatcher(expFilePath);
});
