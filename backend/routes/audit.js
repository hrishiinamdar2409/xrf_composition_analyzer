/**
 * REST API routes — Audit Log (read-only)
 */

'use strict';

const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');

// GET /api/audit?sampleId=123
router.get('/', (req, res) => {
  const db = getDb();
  const { sampleId } = req.query;
  let rows;
  if (sampleId) {
    rows = db.prepare(`
      SELECT * FROM audit_log WHERE sample_id = ? ORDER BY id ASC
    `).all(sampleId);
  } else {
    rows = db.prepare(`
      SELECT * FROM audit_log ORDER BY id DESC LIMIT 200
    `).all();
  }
  res.json(rows);
});

module.exports = router;
