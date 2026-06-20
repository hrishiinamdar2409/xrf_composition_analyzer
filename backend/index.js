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

const PORT = process.env.PORT || 3001;

const app = express();
app.use(express.json());

// Fallback path configuration root tracking parameter
let activeExpFilePath = 'C:\\FischerExport';

/**
 * Normalizes input targets and activates recursive watcher surveillance 
 * across targeted product subdirectory paths.
 */
const applyExpFileWatcher = (nextPath) => {
  activeExpFilePath = nextPath;
  
  const fs = require('fs');
  let watchTargetDirectory = activeExpFilePath;

  // CRITICAL FIX: If configuration targets an explicit file path handle, 
  // safely extract the parent root directory context instead.
  try {
    if (fs.existsSync(activeExpFilePath) && fs.statSync(activeExpFilePath).isFile()) {
      watchTargetDirectory = path.dirname(activeExpFilePath);
    } else if (path.extname(activeExpFilePath)) {
      // If path does not exist yet but ends with a file suffix extension name
      watchTargetDirectory = path.dirname(activeExpFilePath);
    }
  } catch (_) {
    if (path.extname(activeExpFilePath)) {
      watchTargetDirectory = path.dirname(activeExpFilePath);
    }
  }

  // Initialize tree watcher surveillance
  startWatcher(watchTargetDirectory, (reading) => {
    broadcastNewReading(reading);
  });
  
  console.log(`[Server] Watcher reinitialized. Watching directory tree: ${watchTargetDirectory}`);
};

const settingsRouter = createSettingsRouter({
  onExpFilePathChange: applyExpFileWatcher,
});

// Serve React frontend static files (built output)
app.use(express.static(path.join(__dirname, '..', 'frontend', 'dist')));

// API routes
app.use('/api/readings', readingsRouter);
app.use('/api/samples', samplesRouter);
app.use('/api/settings', settingsRouter);
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