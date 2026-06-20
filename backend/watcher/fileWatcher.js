/**
 * Modern WinFTM® JSON Multi-Folder Watcher
 * Watches recursive directory trees, processes existing historical files on startup,
 * tracks sequential append indices natively without destroying local files.
 * Enforces rigid block validation against filenames to prevent cached data leaks.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const { parseJsonEntries, normaliseElements } = require('../parser/expParser');
const { getDb } = require('../db/database');

let watcherInstance = null;

/**
 * Commences recursive watch surveillance across the FischerExport root directory tree.
 * @param {string} rootWatchDir - Directory location root path (e.g., C:\\FischerExport)
 * @param {function} onNewReading - Callback event router passing data live to WebSockets
 */
function startWatcher(rootWatchDir, onNewReading) {
  if (watcherInstance) {
    watcherInstance.close();
  }

  let targetDir = fs.statSync(rootWatchDir).isDirectory() ? rootWatchDir : path.dirname(rootWatchDir);
  targetDir = targetDir.replace(/\\/g, '/');

  console.log(`[Watcher] Surveillance active across base directory root: ${targetDir}`);

  watcherInstance = chokidar.watch(targetDir, {
    persistent: true,
    depth: 99,
    ignoreInitial: false,
    awaitWriteFinish: {
      stabilityThreshold: 400,
      pollInterval: 100,
    },
    ignored: (filePath, stats) => {
      if (!filePath) return true;
      const normalized = filePath.replace(/\\/g, '/');
      if (stats && stats.isDirectory()) return false;
      if (!stats && !path.extname(normalized)) return false; 
      return !normalized.endsWith('.txt');
    }
  });

  watcherInstance.on('add', (filePath) => evaluateFileChange(filePath, onNewReading));
  watcherInstance.on('change', (filePath) => evaluateFileChange(filePath, onNewReading));

  watcherInstance.on('error', (err) => {
    console.error('[Watcher] General error event caught:', err);
  });

  return watcherInstance;
}

/**
 * Halts active directory watchers cleanly.
 */
function stopWatcher() {
  if (watcherInstance) {
    watcherInstance.close();
    watcherInstance = null;
    console.log('[Watcher] Surveillance halted successfully');
  }
}

/**
 * Handles incoming file updates, validates JSON block matches, and pushes lines to SQLite.
 */
function evaluateFileChange(filePath, onNewReading) {
  const standardFilePath = filePath.replace(/\\/g, '/');
  const fileName = path.basename(standardFilePath);

  if (fileName === 'EXPORT.txt' || fileName === 'NET_EXPT.END') {
    return;
  }

  try {
    const rawContent = fs.readFileSync(standardFilePath, 'utf8');
    const entries = parseJsonEntries(rawContent);
    if (entries.length === 0) return;

    const folderTokens = standardFilePath.split('/');
    const profileName = folderTokens[folderTokens.length - 2] || 'ALL';
    const uniqueFileSignature = `${profileName}/${fileName}`;

    const db = getDb();
    const arrivedAt = new Date().toISOString();

    // POLICY GATEWAY: Check if filename ends with an explicit block identifier number
    const fileNameBlockMatch = fileName.match(/(?:_|^)(\d+)\.txt$/);
    const expectedBlockNumber = fileNameBlockMatch ? fileNameBlockMatch[1] : null;

    entries.forEach((dataBlock, zeroIndex) => {
      // 👑 1-BASED INDEX SHIFT: Promoting structural entries to map as 1, 2, 3... instead of 0-indexed values
      const index = zeroIndex + 1;
      const currentBlockId = dataBlock.Block ? String(dataBlock.Block) : null;

      // VALIDATION CRITERIA CRITICAL MATCH CHECK
      if (expectedBlockNumber && currentBlockId && currentBlockId !== expectedBlockNumber) {
        console.warn(`[Watcher][BLOCKED] Mismatched cache entry detected in ${uniqueFileSignature}. Filename expected Block ${expectedBlockNumber}, but file contained Block ${currentBlockId}.`);
        
        db.prepare(`
          INSERT INTO audit_log (occurred_at, reading_id, action, detail_json)
          VALUES (?, null, 'MISMATCHED_BLOCK_REJECTED', ?)
        `).run(
          arrivedAt, 
          JSON.stringify({
            file: uniqueFileSignature,
            filenameExpectedBlock: expectedBlockNumber,
            actualBlockInContent: currentBlockId,
            serialNumber: dataBlock.SerialNumber || 'UNKNOWN',
            index: index
          })
        );
        
        return; 
      }

      // 👑 ENHANCED DUPLICATE CHECK: Aligns flawlessly with the 1-based index mapping sequence
      const duplicateGuard = db.prepare(`
        SELECT id FROM readings WHERE file_path = ? AND block = ? AND entry_index = ?
      `).get(uniqueFileSignature, currentBlockId, index);

      if (duplicateGuard) {
        return; 
      }

      const formattedElementsList = normaliseElements(dataBlock.Elements);
      const rawElements = dataBlock.Elements || {};

      // Safe extraction helper closure for JSON element metrics tree
      const getElVal = (key) => {
        const item = rawElements[key] || rawElements[key + ' '];
        return (item && item.Value !== undefined) ? Number(item.Value) : 0.0;
      };

      const readingPayload = {
        // 1. Identifiers & File System Trackers
        arrived_at: arrivedAt,
        file_path: uniqueFileSignature,
        block: currentBlockId,
        entry_index: index, // Stores as 1-based integer
        profile: profileName,

        // 2. Context Metadata & Physical Specs (nbr dropped entirely)
        serial_number: dataBlock.SerialNumber ? String(dataBlock.SerialNumber).trim() : '',
        reading_date: dataBlock.Date ? String(dataBlock.Date).trim() : '',
        reading_time: dataBlock.Time ? String(dataBlock.Time).trim() : '',
        customer_name: dataBlock.CustomerName ? String(dataBlock.CustomerName).trim() : 'UNKNOWN',
        sample_type: dataBlock.SampleType ? String(dataBlock.SampleType).trim() : '',
        weight: dataBlock.Weight !== undefined ? Number(dataBlock.Weight) : 0.0,
        
        // 3. Element metrics mapping directly to explicit properties
        Au: getElVal('Au'), Ag: getElVal('Ag'), Cu: getElVal('Cu'),
        Zn: getElVal('Zn'), Ni: getElVal('Ni'), Cd: getElVal('Cd'),
        In: getElVal('In'), Ir: getElVal('Ir'), Ru: getElVal('Ru'),
        Rh: getElVal('Rh'), Pd: getElVal('Pd'), Fe: getElVal('Fe'),
        Pt: getElVal('Pt'), Os: getElVal('Os'), Re: getElVal('Re'),
        Co: getElVal('Co'), Ga: getElVal('Ga'), Sn: getElVal('Sn'),
        Pb: getElVal('Pb'), Bi: getElVal('Bi'), W:  getElVal('W'),
        Sb: getElVal('Sb'), mq: getElVal('mq'), x1: getElVal('x1'),

        elements_json: JSON.stringify(formattedElementsList),
        raw_json: JSON.stringify(dataBlock)
      };

      // 👑 BUG REPAIR & SEQUENCE SYNC: Order maps perfectly to database setup and handles keywords safely
      const insertStmt = db.prepare(`
        INSERT INTO readings (
          "arrived_at", "file_path", "block", "entry_index", "profile",
          "serial_number", "reading_date", "reading_time", "customer_name", "sample_type", "weight",
          "Au", "Ag", "Cu", "Zn", "Ni", "Cd", "In", "Ir", "Ru", "Rh", "Pd", "Fe", "Pt", "Os", "Re", "Co", "Ga", "Sn", "Pb", "Bi", "W", "Sb", "mq", "x1",
          "elements_json", "raw_json"
        ) VALUES (
          @arrived_at, @file_path, @block, @entry_index, @profile,
          @serial_number, @reading_date, @reading_time, @customer_name, @sample_type, @weight,
          @Au, @Ag, @Cu, @Zn, @Ni, @Cd, @In, @Ir, @Ru, @Rh, @Pd, @Fe, @Pt, @Os, @Re, @Co, @Ga, @Sn, @Pb, @Bi, @W, @Sb, @mq, @x1,
          @elements_json, @raw_json
        )
      `);

      const executionInfo = insertStmt.run(readingPayload);
      const generatedRowId = executionInfo.lastInsertRowid;

      db.prepare(`
        INSERT INTO audit_log (occurred_at, reading_id, action, detail_json)
        VALUES (?, ?, 'READING_RECEIVED', ?)
      `).run(arrivedAt, generatedRowId, JSON.stringify({ serial_number: readingPayload.serial_number, index }));

      if (onNewReading) {
        onNewReading({
          id: generatedRowId,
          ...readingPayload,
          karat: readingPayload.x1, // Map live transmission parameter dynamically to align with REST endpoint aliasing
          elements: formattedElementsList,
          raw: dataBlock
        });
      }
    });

  } catch (err) {
    console.error(`[Watcher] Error processing file updates on ${fileName}:`, err);
  }
}

module.exports = { startWatcher, stopWatcher };