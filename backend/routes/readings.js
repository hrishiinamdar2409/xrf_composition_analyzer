/**
 * REST API routes — Readings
 */

'use strict';

const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');

// GET /api/readings — all readings, newest first
router.get('/', (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT id, arrived_at, nbr, profile, block, elements_json
    FROM readings
    ORDER BY id DESC
    LIMIT 500
  `).all();

  res.json(rows.map(r => ({
    ...r,
    elements: JSON.parse(r.elements_json),
  })));
});

// GET /api/readings/suggest-group
// Returns IDs of unlinked readings that most likely belong to the same sample.
// Strategy 1: group by @BLK block number (most recent block).
// Strategy 2: time-proximity cluster — readings within 3 minutes of each other.
router.get('/suggest-group', (req, res) => {
  const db = getDb();

  // Only consider readings not yet linked to any sample
  const rows = db.prepare(`
    SELECT r.id, r.arrived_at, r.nbr, r.block, r.profile
    FROM readings r
    LEFT JOIN sample_readings sr ON sr.reading_id = r.id
    WHERE sr.reading_id IS NULL
    ORDER BY r.id ASC
  `).all();

  if (rows.length === 0) return res.json({ suggestedIds: [], reason: 'No unlinked readings' });

  // Strategy 1: block number
  const withBlock = rows.filter(r => r.block !== null);
  if (withBlock.length > 0) {
    const latestBlock = withBlock[withBlock.length - 1].block;
    const group = withBlock.filter(r => r.block === latestBlock);
    return res.json({ suggestedIds: group.map(r => r.id), reason: `Same block #${latestBlock}` });
  }

  // Strategy 2: time-proximity — find the most recent cluster (≤ 3 min gap)
  const THREE_MIN = 3 * 60 * 1000;
  const sorted = rows.slice().sort((a, b) => new Date(a.arrived_at) - new Date(b.arrived_at));

  const clusters = [];
  let current = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const gap = new Date(sorted[i].arrived_at) - new Date(sorted[i - 1].arrived_at);
    if (gap <= THREE_MIN) {
      current.push(sorted[i]);
    } else {
      clusters.push(current);
      current = [sorted[i]];
    }
  }
  clusters.push(current);

  const latest = clusters[clusters.length - 1];
  res.json({
    suggestedIds: latest.map(r => r.id),
    reason: `${latest.length} reading${latest.length > 1 ? 's' : ''} within 3-min window`,
  });
});

// GET /api/readings/:id
router.get('/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM readings WHERE id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json({ ...row, elements: JSON.parse(row.elements_json), raw: JSON.parse(row.raw_json) });
});

module.exports = router;
