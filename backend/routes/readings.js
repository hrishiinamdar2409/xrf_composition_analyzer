/**
 * REST API routes — Readings
 * Fully optimized to return all 24 explicit element columns and alias x1 as karat for the UI.
 * Escapes reserved SQL keywords like "In" to prevent query parser crashes.
 */

'use strict';

const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');

// GET /api/readings — all readings, newest first
router.get('/', (req, res) => {
  try {
    const db = getDb();
    
    // Check if entry_index exists in the schema to prevent fatal query errors
    const tableInfo = db.prepare("PRAGMA table_info(readings)").all();
    const hasEntryIndex = tableInfo.some(col => col.name === 'entry_index');
    
    const entryIndexColumn = hasEntryIndex ? 'entry_index' : 'id AS entry_index';

    // Wrapped chemical symbols in double quotes to prevent conflicts with SQL keywords like "IN"
    const rows = db.prepare(`
      SELECT id, arrived_at, serial_number, reading_date, reading_time, 
             block, customer_name, sample_type, weight, profile, file_path, ${entryIndexColumn},
             "Au", "Ag", "Cu", "Zn", "Ni", "Cd", "In", "Ir", "Ru", "Rh", "Pd", "Fe", "Pt", "Os", "Re", "Co", "Ga", "Sn", "Pb", "Bi", "W", "Sb", "mq",
             x1 AS karat,
             elements_json
      FROM readings
      ORDER BY id DESC
      LIMIT 500
    `).all();

    res.json(rows.map(r => ({
      ...r,
      elements: JSON.parse(r.elements_json || '[]'),
    })));
  } catch (err) {
    console.error('============ READINGS DATABASE FETCH ERROR ============');
    console.error(err);
    console.error('=======================================================');
    res.status(500).json({ 
      error: 'Failed to retrieve readings data logs',
      details: err.message 
    });
  }
});

// GET /api/readings/suggest-group
router.get('/suggest-group', (req, res) => {
  try {
    const db = getDb();

    const tableInfo = db.prepare("PRAGMA table_info(readings)").all();
    const hasEntryIndex = tableInfo.some(col => col.name === 'entry_index');
    const entryIndexColumn = hasEntryIndex ? 'r.entry_index' : 'r.id AS entry_index';

    const rows = db.prepare(`
      SELECT r.id, r.arrived_at, r.serial_number, r.block, r.profile, r.file_path, ${entryIndexColumn}
      FROM readings r
      LEFT JOIN sample_readings sr ON sr.reading_id = r.id
      WHERE sr.reading_id IS NULL
      ORDER BY r.id ASC
    `).all();

    if (rows.length === 0) {
      return res.json({ suggestedIds: [], reason: 'No unlinked readings available' });
    }

    // STRATEGY 1: Group by explicit file tracking target
    const withFilePath = rows.filter(r => r.file_path !== null && r.file_path !== '');
    if (withFilePath.length > 0) {
      const latestFileSignature = withFilePath[withFilePath.length - 1].file_path;
      const fileGroup = withFilePath.filter(r => r.file_path === latestFileSignature);
      const cleanFileName = latestFileSignature.split(/[/\\]/).pop();
      
      return res.json({ 
        suggestedIds: fileGroup.map(r => r.id), 
        reason: `Grouped via unlinked batch file: "${cleanFileName}"` 
      });
    }

    // STRATEGY 2: Fallback to block identifiers
    const withBlock = rows.filter(r => r.block !== null && r.block !== '');
    if (withBlock.length > 0) {
      const latestBlockString = withBlock[withBlock.length - 1].block;
      const blockGroup = withBlock.filter(r => r.block === latestBlockString);
      return res.json({ 
        suggestedIds: blockGroup.map(r => r.id), 
        reason: `Grouped via matching block identifier: #${latestBlockString}` 
      });
    }

    // STRATEGY 3: Time-proximity fallback cluster
    const THREE_MINUTES_MS = 3 * 60 * 1000;
    const sortedByTime = rows.slice().sort((a, b) => new Date(a.arrived_at) - new Date(b.arrived_at));

    const clusters = [];
    let currentCluster = [sortedByTime[0]];

    for (let i = 1; i < sortedByTime.length; i++) {
      const timeDelta = new Date(sortedByTime[i].arrived_at) - new Date(sortedByTime[i - 1].arrived_at);
      if (timeDelta <= THREE_MINUTES_MS) {
        currentCluster.push(sortedByTime[i]);
      } else {
        clusters.push(currentCluster);
        currentCluster = [sortedByTime[i]];
      }
    }
    clusters.push(currentCluster);

    const latestClusterGroup = clusters[clusters.length - 1];
    res.json({
      suggestedIds: latestClusterGroup.map(r => r.id),
      reason: `${latestClusterGroup.length} measurement line reading${latestClusterGroup.length > 1 ? 's' : ''} captured within a 3-minute window`,
    });
  } catch (err) {
    console.error('[API readings suggest-group] Error:', err);
    res.status(500).json({ error: 'Grouping suggestions analytical route execution failure', details: err.message });
  }
});

// GET /api/readings/:id
router.get('/:id', (req, res) => {
  try {
    const db = getDb();

    const tableInfo = db.prepare("PRAGMA table_info(readings)").all();
    const hasEntryIndex = tableInfo.some(col => col.name === 'entry_index');
    const entryIndexColumn = hasEntryIndex ? 'entry_index' : 'id AS entry_index';

    const row = db.prepare(`
      SELECT id, arrived_at, serial_number, reading_date, reading_time, 
             block, customer_name, sample_type, weight, profile, file_path, ${entryIndexColumn},
             "Au", "Ag", "Cu", "Zn", "Ni", "Cd", "In", "Ir", "Ru", "Rh", "Pd", "Fe", "Pt", "Os", "Re", "Co", "Ga", "Sn", "Pb", "Bi", "W", "Sb", "mq",
             x1 AS karat,
             elements_json, raw_json
      FROM readings 
      WHERE id = ?
    `).get(req.params.id);
    
    if (!row) return res.status(404).json({ error: 'Reading record not found' });
    
    res.json({ 
      ...row, 
      elements: JSON.parse(row.elements_json || '[]'), 
      raw: JSON.parse(row.raw_json || '{}') 
    });
  } catch (err) {
    console.error(`[API readings GET /:id] Error fetching ID ${req.params.id}:`, err);
    res.status(500).json({ error: 'Single record retrieval database processing failure', details: err.message });
  }
});

module.exports = router;