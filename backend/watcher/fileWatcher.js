/**
 * WinFTM .exp file watcher
 * Watches a configured export file path for changes.
 * When WinFTM writes a new reading, chokidar fires a 'change' event.
 * We read the file, parse only NEW sections since last read, and store them.
 *
 * WinFTM handshake:
 *   - WinFTM writes NET_EXPT.END after writing the .exp file
 *   - We must delete NET_EXPT.END to allow the next measurement export
 *   - Our app is read-only w.r.t. the .exp file itself
 */

'use strict';

const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const { parseExpFile, normaliseReading, normaliseBlockStats } = require('../parser/expParser');
const { getDb } = require('../db/database');

let watcherInstance = null;
let lastKnownSize = 0;
let cachedHeader = {};

/**
 * Start watching the WinFTM export file.
 * @param {string} expFilePath - Absolute path to the .exp file (e.g. C:\FischerExport\results.exp)
 * @param {function} onNewReading - Callback(reading) called for each new reading stored
 */
function startWatcher(expFilePath, onNewReading) {
  if (watcherInstance) {
    watcherInstance.close();
  }

  const dir = path.dirname(expFilePath);
  const handshakeFile = path.join(dir, 'NET_EXPT.END');

  console.log(`[Watcher] Watching: ${expFilePath}`);

  watcherInstance = chokidar.watch(expFilePath, {
    persistent: true,
    usePolling: false,
    awaitWriteFinish: {
      stabilityThreshold: 300,
      pollInterval: 100,
    },
    ignoreInitial: false,
  });

  watcherInstance.on('add', () => processFile(expFilePath, handshakeFile, onNewReading));
  watcherInstance.on('change', () => processFile(expFilePath, handshakeFile, onNewReading));

  watcherInstance.on('error', (err) => {
    console.error('[Watcher] Error:', err);
  });

  return watcherInstance;
}

function stopWatcher() {
  if (watcherInstance) {
    watcherInstance.close();
    watcherInstance = null;
    console.log('[Watcher] Stopped');
  }
}

/**
 * Called whenever the .exp file is written.
 * Reads only the portion of the file after our last known position.
 */
function processFile(expFilePath, handshakeFile, onNewReading) {
  let fd;
  try {
    fd = fs.openSync(expFilePath, 'r');
    const stat = fs.fstatSync(fd);
    const currentSize = stat.size;

    if (currentSize <= lastKnownSize) {
      // File was truncated/replaced — re-read from beginning
      if (currentSize < lastKnownSize) {
        console.log('[Watcher] File truncated, re-reading from start');
        lastKnownSize = 0;
        cachedHeader = {};
      } else {
        return; // No new data
      }
    }

    const newBytes = currentSize - lastKnownSize;
    const buf = Buffer.alloc(newBytes);
    fs.readSync(fd, buf, 0, newBytes, lastKnownSize);
    lastKnownSize = currentSize;

    const newText = buf.toString('utf8');
    const { header, readings, blockStats } = parseExpFile(newText);

    // Update cached header (sections may arrive incrementally)
    if (Object.keys(header).length > 0) {
      Object.assign(cachedHeader, header);
    }

    const db = getDb();
    const arrivedAt = new Date().toISOString();

    for (const raw of readings) {
      const reading = normaliseReading(raw, cachedHeader);
      reading.timestamp = arrivedAt;
      const id = insertReading(db, reading, arrivedAt);
      if (onNewReading) onNewReading({ ...reading, id });
    }

    // Delete the handshake file so WinFTM can export the next measurement
    if (fs.existsSync(handshakeFile)) {
      try {
        fs.unlinkSync(handshakeFile);
      } catch (e) {
        console.warn('[Watcher] Could not delete handshake file:', e.message);
      }
    }
  } catch (err) {
    console.error('[Watcher] processFile error:', err);
  } finally {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch (_) {}
    }
  }
}

function insertReading(db, reading, arrivedAt) {
  const stmt = db.prepare(`
    INSERT INTO readings (arrived_at, nbr, profile, block, elements_json, raw_json)
    VALUES (@arrivedAt, @nbr, @profile, @block, @elements_json, @raw_json)
  `);
  const info = stmt.run({
    arrivedAt,
    nbr: reading.nbr,
    profile: reading.profile,
    block: reading.raw['@BLK'] ?? null,
    elements_json: JSON.stringify(reading.elements),
    raw_json: JSON.stringify(reading.raw),
  });

  // Audit log
  db.prepare(`
    INSERT INTO audit_log (occurred_at, reading_id, action, detail_json)
    VALUES (?, ?, 'READING_RECEIVED', ?)
  `).run(arrivedAt, info.lastInsertRowid, JSON.stringify({ nbr: reading.nbr }));

  return info.lastInsertRowid;
}

module.exports = { startWatcher, stopWatcher };
