/**
 * REST API routes — Samples (Jobs)
 * Simplified schema: sr_no, is_printed, no status/approved_by/expert_notes
 */

'use strict';

const express = require('express');
const router  = express.Router();
const path    = require('path');
const fs      = require('fs');
const os      = require('os');
const { execFile } = require('child_process');
const { getDb } = require('../db/database');

// ── Helpers ──────────────────────────────────────────────────────────────────

const ELEMENT_SYMBOL_RX = /^[A-Za-z][A-Za-z0-9]{0,2}$/;

function toPositiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function isValidIsoDate(value) {
  if (!value || typeof value !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00`);
  return !Number.isNaN(d.getTime());
}

function buildValidationError(res, errors, fallback = 'Validation failed') {
  return res.status(400).json({
    error: fallback,
    code: 'VALIDATION_ERROR',
    errors,
  });
}

function validateSamplePayload(payload, { requireReadingIds = true } = {}) {
  const errors = [];
  const cleaned = {
    customerName: typeof payload.customerName === 'string' ? payload.customerName.trim() : '',
    itemDesc: typeof payload.itemDesc === 'string' ? payload.itemDesc.trim() : '',
    readingIds: Array.isArray(payload.readingIds) ? payload.readingIds : null,
    testDate: payload.testDate,
    testTime: payload.testTime,
  };

  console.log('[validateSamplePayload] Received payload:', {
    customerName: cleaned.customerName,
    itemDesc: cleaned.itemDesc,
    readingIdsLength: cleaned.readingIds?.length || 0,
    testDate: cleaned.testDate,
    testTime: cleaned.testTime,
  });

  const parts = cleaned.itemDesc.split('|').map(p => p.trim()).filter(Boolean);
  let mobileFromItemDesc = '';
  for (const part of parts) {
    if (/^Sr:/i.test(part) || /^Wt:/i.test(part)) continue;
    const digits = part.replace(/\D/g, '');
    if (digits.length >= 7 && digits.length <= 15) {
      mobileFromItemDesc = digits;
      break;
    }
  }

  if (!cleaned.customerName || cleaned.customerName.length < 2 || cleaned.customerName.length > 120) {
    errors.push({ field: 'customerName', message: 'Customer name must be 2-120 characters.' });
  }

  if (!cleaned.itemDesc || cleaned.itemDesc.length < 3 || cleaned.itemDesc.length > 300) {
    errors.push({ 
      field: 'itemDesc', 
      message: 'Item description is required and must be under 300 characters.' 
    });
  }

  if (mobileFromItemDesc && !/^\d{10}$/.test(mobileFromItemDesc)) {
    errors.push({ field: 'mobile', message: 'Mobile number must be exactly 10 digits.' });
  }

  if (cleaned.testDate != null && cleaned.testDate !== '' && !isValidIsoDate(cleaned.testDate)) {
    errors.push({ field: 'testDate', message: 'Test date must be a valid YYYY-MM-DD date.' });
  }

  if (requireReadingIds || cleaned.readingIds !== null) {
    if (!Array.isArray(cleaned.readingIds) || cleaned.readingIds.length === 0) {
      errors.push({ field: 'readingIds', message: 'At least one reading must be selected.' });
    } else {
      const normalizedIds = cleaned.readingIds.map(toPositiveInt);
      if (normalizedIds.some(id => !id)) {
        errors.push({ field: 'readingIds', message: 'Reading IDs must be positive integers.' });
      } else {
        const unique = [...new Set(normalizedIds)];
        if (unique.length !== normalizedIds.length) {
          errors.push({ field: 'readingIds', message: 'Duplicate readings are not allowed.' });
        }
        cleaned.readingIds = unique;
      }
    }
  }

  return { errors, cleaned };
}

function ensureReadingIdsExist(db, readingIds) {
  if (!Array.isArray(readingIds) || readingIds.length === 0) return false;
  const placeholders = readingIds.map(() => '?').join(',');
  const row = db.prepare(`SELECT COUNT(*) AS c FROM readings WHERE id IN (${placeholders})`).get(...readingIds);
  return Number(row?.c || 0) === readingIds.length;
}

function validateExpertValuesPayload(expertValues) {
  const errors = [];
  if (!expertValues || typeof expertValues !== 'object' || Array.isArray(expertValues)) {
    errors.push({ field: 'expertValues', message: 'expertValues object required.' });
    return { errors };
  }

  const entries = Object.entries(expertValues);
  if (entries.length === 0) {
    errors.push({ field: 'expertValues', message: 'At least one expert value is required.' });
    return { errors };
  }

  for (const [element, raw] of entries) {
    if (!ELEMENT_SYMBOL_RX.test(String(element || ''))) {
      errors.push({ field: `expertValues.${element}`, message: 'Invalid element symbol.' });
      continue;
    }
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      errors.push({ field: `expertValues.${element}`, message: 'Value must be numeric.' });
      continue;
    }
    if (value < 0 || value > 100) {
      errors.push({ field: `expertValues.${element}`, message: 'Value must be between 0 and 100.' });
    }
  }
  return { errors };
}

function generateNextSrNo(db) {
  try {
    const results = db.prepare(`SELECT sr_no FROM samples ORDER BY id DESC`).all();
    if (!results || results.length === 0) return '1';
    let maxNum = 0;
    for (const row of results) {
      if (!row.sr_no) continue;
      const match = row.sr_no.match(/(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    }
    return String(maxNum + 1);
  } catch (err) {
    console.error('[generateNextSrNo] Error:', err);
    return String(Date.now()).slice(-6);
  }
}

function calcAutoResults(db, sampleId) {
  const rows = db.prepare(`
    SELECT r.elements_json
    FROM readings r
    JOIN sample_readings sr ON sr.reading_id = r.id
    WHERE sr.sample_id = ? AND sr.excluded = 0
  `).all(sampleId);

  db.prepare(`DELETE FROM auto_results WHERE sample_id = ?`).run(sampleId);
  if (rows.length === 0) return;

  const totals = {};
  const counts = {};
  for (const row of rows) {
    try {
      const elements = JSON.parse(row.elements_json);
      for (const el of elements) {
        if (el.value === null) continue;
        totals[el.name] = (totals[el.name] || 0) + el.value;
        counts[el.name] = (counts[el.name] || 0) + 1;
      }
    } catch (e) { /* ignore */ }
  }

  const insert = db.prepare(`
    INSERT INTO auto_results (sample_id, element, auto_value)
    VALUES (@sampleId, @element, @autoValue)
    ON CONFLICT (sample_id, element) DO UPDATE SET auto_value = excluded.auto_value
  `);

  for (const name of Object.keys(totals)) {
    insert.run({ sampleId, element: name, autoValue: totals[name] / counts[name] });
  }
}

function parseItemDesc(itemDesc) {
  const parsed = { sampleCat: null, sampleType: null, weight: null, srNo: null, mobile: null };
  if (!itemDesc || typeof itemDesc !== 'string') return parsed;

  const parts = itemDesc.split('|').map(p => p.trim()).filter(Boolean);
  if (parts[0]) {
    const catTypeMatch = parts[0].match(/^(Gold|Silver|Platinum)\s+(.+)$/i);
    if (catTypeMatch) {
      parsed.sampleCat = catTypeMatch[1][0].toUpperCase() + catTypeMatch[1].slice(1).toLowerCase();
      parsed.sampleType = catTypeMatch[2];
    }
  }

  const weightMatch = itemDesc.match(/Wt:([0-9.]+)g/i);
  if (weightMatch) parsed.weight = parseFloat(weightMatch[1]);

  const srMatch = itemDesc.match(/Sr:([0-9]+)/i);
  if (srMatch) parsed.srNo = srMatch[1];

  for (const part of parts) {
    if (/^Sr:/i.test(part) || /^Wt:/i.test(part)) continue;
    const digits = part.replace(/\D/g, '');
    if (digits.length >= 7 && digits.length <= 15) {
      parsed.mobile = digits;
      break;
    }
  }
  return parsed;
}

function buildOrderedElements(sample) {
  const priority = ['Au', 'Ag', 'Cu', 'Zn', 'Ni', 'Fe', 'Pt', 'Pd'];
  const names = [...new Set((sample.readings || []).flatMap(r => (r.elements || []).map(e => e.name)))];
  return names.sort((a, b) => {
    const ai = priority.indexOf(a);
    const bi = priority.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

function buildAdjustedValues(sample) {
  const values = new Map();
  for (const f of sample.finalResults || []) {
    const v = f.expert_value ?? f.auto_value;
    if (v != null) values.set(f.element, v);
  }
  return values;
}

const ELEMENT_LABELS = {
  Au: 'Gold', Ag: 'Silver', Cu: 'Copper', Zn: 'Zinc', Cd: 'Cadmium', Ni: 'Nickel',
  In: 'Indium', Fe: 'Iron', Sn: 'Tin', Ir: 'Iridium', Ru: 'Ruthenium', Os: 'Osmium',
  Re: 'Rhenium', Co: 'Cobalt', Pb: 'Lead', Cr: 'Chromium', Pt: 'Platinum', Pd: 'Palladium', Rh: 'Rhodium',
  Mn: 'Manganese', Mo: 'Molybdenum', Nb: 'Niobium', Zr: 'Zirconium', Ta: 'Tantalum', W: 'Tungsten',
};

function karatFromPurity(purityPct) {
  if (purityPct == null || Number.isNaN(Number(purityPct))) return null;
  return Number((Number(purityPct) * 24 / 100).toFixed(2));
}

function buildPrintJobText(sample, adjustedValues, orderedElements) {
  const lines = [];
  const now = new Date();
  const reportDate = sample.test_date ? new Date(sample.test_date) : sample.created_at ? new Date(sample.created_at) : now;
  const parsed = parseItemDesc(sample.item_desc || '');

  const category = parsed.sampleCat || (adjustedValues.has('Ag') ? 'Silver' : adjustedValues.has('Pt') ? 'Platinum' : 'Gold');
  const primarySym = category === 'Silver' ? 'Ag' : category === 'Platinum' ? 'Pt' : 'Au';
  const primary = adjustedValues.get(primarySym) ?? null;
  const karat = primarySym === 'Au' && adjustedValues.get('Au') != null ? karatFromPurity(adjustedValues.get('Au')) : null;

  lines.push('Assay Report');
  lines.push('');
  lines.push(`Name       : ${sample.customer_name || '-'}`.padEnd(45) + `Serial No : ${sample.sr_no || '-'}`);
  lines.push(`Item Name  : ${parsed.sampleType || sample.item_desc || '-'}`.padEnd(45) + `Date      : ${reportDate.toLocaleDateString('en-GB')}`);
  lines.push(`Weight     : ${parsed.weight || '-'}${parsed.weight ? ' gm' : ''}`.padEnd(45) + `Time      : ${now.toLocaleTimeString('en-GB')}`);
  lines.push('');
  lines.push('----------------------------------------------------------------------');
  lines.push(
    `${category} Purity : ${primary != null ? Number(primary).toFixed(2) : '-'}`.padEnd(35) +
    `Karat : ${karat != null ? karat.toFixed(2) : '-'}`
  );
  lines.push('----------------------------------------------------------------------');
  lines.push('');

  const ELEMENT_SECTIONS = [
    ['Au', 'Ag', 'Cu', 'Zn', 'Cd', 'Ni', 'In'],
    ['Fe', 'Sn', 'Ir', 'Ru', 'Os', 'Re'],
    ['Co', 'Pb', 'Cr', 'Pt', 'Pd', 'Rh'],
  ].map(section => section.filter(sym => sym !== primarySym));

  const lineFor = (sym) => {
    const label = `${ELEMENT_LABELS[sym] || sym}`;
    const value = adjustedValues.get(sym);
    return `${label.padEnd(18)} : ${value != null ? Number(value).toFixed(2) : '0.00'}`;
  };

  const COL_W = 31;
  const rowCount = Math.max(...ELEMENT_SECTIONS.map(s => s.length));

  for (let i = 0; i < rowCount; i++) {
    const row = ELEMENT_SECTIONS.map(section => {
      const sym = section[i];
      if (!sym) return ''.padEnd(COL_W);
      return lineFor(sym).padEnd(COL_W);
    }).join('');
    lines.push(row);
  }

  return lines.join('\r\n');
}

function buildPreviewHtml(sample) {
  const values = new Map();
  for (const a of sample.autoResults || []) values.set(a.element, a.auto_value);
  for (const f of sample.finalResults || []) values.set(f.element, f.expert_value ?? f.auto_value ?? values.get(f.element));

  const priority = ['Au', 'Ag', 'Cu', 'Zn', 'Ni', 'Fe', 'Pt', 'Pd'];
  const elements = [...values.keys()].sort((a, b) => {
    const ai = priority.indexOf(a);
    const bi = priority.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  const rows = elements.map((el, idx) => {
    const val = values.get(el);
    const cls = el === 'Au' ? 'au' : '';
    return `<tr class="${idx % 2 === 0 ? 'odd' : ''}"><td class="${cls}">${el}</td><td class="num ${cls}">${val != null ? Number(val).toFixed(3) : '—'}</td></tr>`;
  }).join('');

  const esc = (v) => String(v || '—')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Print Preview - ${esc(sample.sr_no)}</title>
  <style>
    body { margin: 0; background: #edf1f7; font-family: 'Segoe UI', Tahoma, sans-serif; }
    .sheet { width: 794px; min-height: 1123px; margin: 24px auto; background: #fff; box-shadow: 0 8px 26px rgba(17,24,39,0.16); padding: 72px 64px 56px; }
    .spacer { height: 120px; border: 1px dashed #d4dbe6; color: #7b8697; display:flex; align-items:center; justify-content:center; font-size: 12px; letter-spacing: .5px; }
    .title { margin-top: 18px; font-size: 20px; font-weight: 800; letter-spacing: .8px; color: #111827; text-transform: uppercase; }
    .sub { margin-top: 4px; font-size: 12px; color: #475569; }
    .grid { margin-top: 22px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; font-size: 13px; color: #0f172a; }
    .k { color: #64748b; font-weight: 600; margin-right: 8px; }
    .section { margin-top: 24px; font-size: 13px; font-weight: 700; color: #1e293b; text-transform: uppercase; letter-spacing: .5px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th { text-align: left; font-size: 12px; color: #334155; border-bottom: 2px solid #d7dee9; padding: 8px; }
    td { font-size: 14px; color: #111827; border-bottom: 1px solid #e5ebf4; padding: 8px; }
    tr.odd td { background: #f8fafc; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .au { color: #9a6a00; font-weight: 800; }
    .foot { margin-top: 26px; font-size: 12px; color: #475569; }
    .line { margin-top: 34px; border-top: 1px solid #cfd8e6; padding-top: 8px; font-size: 12px; color: #64748b; }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="spacer">Pre-printed branding/header area (left empty)</div>
    <div class="title">Assay Certificate – Composition Result</div>
    <div class="sub">Preview only (printer not connected)</div>

    <div class="grid">
      <div><span class="k">Sample No:</span>${esc(sample.sr_no)}</div>
      <div><span class="k">Customer:</span>${esc(sample.customer_name)}</div>
      <div><span class="k">Test Date:</span>${sample.test_date ? new Date(sample.test_date).toLocaleDateString('en-GB') : sample.created_at ? new Date(sample.created_at).toLocaleDateString('en-GB') : '—'}</div>
      <div><span class="k">Preview Date:</span>${new Date().toLocaleString('en-GB')}</div>
      <div style="grid-column:1 / span 2;"><span class="k">Item:</span>${esc(sample.item_desc)}</div>
    </div>

    <div class="section">Element Composition In Tested Sample</div>
    <table>
      <thead><tr><th>Element</th><th class="num">Composition (%)</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="2">No element data</td></tr>'}</tbody>
    </table>

    <div class="foot">Printed: ${sample.is_printed ? 'Yes' : 'No'}</div>
    <div class="line">End of certificate preview</div>
  </div>
</body>
</html>`;
}

// ── Routes ───────────────────────────────────────────────────────────────────

// GET /api/samples
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const samples = db.prepare(`
      SELECT s.*,
            COUNT(sr.reading_id) as reading_count,
            GROUP_CONCAT(sr.reading_id || ':' || sr.excluded || ':' || COALESCE(CAST(r2.entry_index AS TEXT), '') ORDER BY sr.reading_id ASC) as reading_meta
      FROM samples s
      LEFT JOIN sample_readings sr ON sr.sample_id = s.id
      LEFT JOIN readings r2 ON r2.id = sr.reading_id
      GROUP BY s.id
      ORDER BY s.id DESC
    `).all();

    const allResults = db.prepare(`
      SELECT fr.sample_id, fr.element, fr.expert_value, fr.auto_value
      FROM final_results fr
      ORDER BY fr.sample_id, fr.element
    `).all();

    const resultsBySample = {};
    for (const r of allResults) {
      if (!resultsBySample[r.sample_id]) resultsBySample[r.sample_id] = [];
      resultsBySample[r.sample_id].push({ element: r.element, value: r.expert_value ?? r.auto_value });
    }

    res.json(samples.map(s => {
      const readings = s.reading_meta
        ? s.reading_meta.split(',').map((tok, idx) => {
            const [id, excl, nbr] = tok.split(':');
            return { id: Number(id), excluded: excl === '1', num: idx + 1, nbr: nbr || null };
          })
        : [];

      const { reading_meta, ...rest } = s;
      return {
        ...rest,
        is_printed: s.is_printed, // 0/1
        parsedItemDesc: parseItemDesc(s.item_desc),
        elementResults: resultsBySample[s.id] || [],
        readings,
      };
    }));
  } catch (err) {
    console.error('[GET /api/samples] Error:', err);
    res.status(500).json({ error: 'Failed to fetch samples', details: err.message });
  }
});

// GET /api/samples/next-sr
router.get('/next-sr', (req, res) => {
  try {
    const db = getDb();
    const nextSrNo = generateNextSrNo(db);
    res.json({ nextSrNo });
  } catch (err) {
    console.error('[GET /api/samples/next-sr] Error:', err);
    res.status(500).json({ error: 'Failed to get next SR number' });
  }
});

// GET /api/samples/:id
router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const sample = db.prepare(`SELECT * FROM samples WHERE id = ?`).get(req.params.id);
    if (!sample) return res.status(404).json({ error: 'Not found' });

    const readings = db.prepare(`
      SELECT r.*, sr.excluded
      FROM readings r
      JOIN sample_readings sr ON sr.reading_id = r.id
      WHERE sr.sample_id = ?
      ORDER BY r.id ASC
    `).all(req.params.id).map(r => ({
      ...r,
      elements: JSON.parse(r.elements_json || '[]'),
    }));

    const autoResults = db.prepare(`SELECT element, auto_value FROM auto_results WHERE sample_id = ?`).all(req.params.id);
    const finalResults = db.prepare(`SELECT element, auto_value, expert_value FROM final_results WHERE sample_id = ?`).all(req.params.id);

    res.json({
      ...sample,
      parsedItemDesc: parseItemDesc(sample.item_desc),
      readings,
      autoResults,
      finalResults,
      is_printed: sample.is_printed,
    });
  } catch (err) {
    console.error('[GET /api/samples/:id] Error:', err);
    res.status(500).json({ error: 'Failed to fetch sample' });
  }
});

// POST /api/samples — create new sample
router.post('/', (req, res) => {
  console.log('[POST /api/samples] Full request body:', JSON.stringify(req.body, null, 2));
  
  const { errors, cleaned } = validateSamplePayload(req.body, { requireReadingIds: true });
  if (errors.length) {
    return buildValidationError(res, errors, 'Invalid sample payload');
  }

  const { customerName, itemDesc, readingIds, testDate, testTime } = cleaned;
  const db = getDb();
  if (!ensureReadingIdsExist(db, readingIds)) {
    return buildValidationError(res, [{ field: 'readingIds', message: 'One or more selected readings do not exist.' }], 'Invalid readings selected');
  }

  const now = new Date().toISOString();
  const srNo = generateNextSrNo(db);

  try {
    const createSample = db.transaction(() => {
      let finalItemDesc = itemDesc;
      if (itemDesc.includes('Sr:')) {
        finalItemDesc = itemDesc.replace(/Sr:[^\|]*/, `Sr:${srNo}`);
      } else {
        finalItemDesc = itemDesc + ` | Sr:${srNo}`;
      }

      let testDateTime = testDate || null;
      if (testDate && testTime) {
        testDateTime = `${testDate}T${testTime}`;
      }

      const info = db.prepare(`
        INSERT INTO samples (sr_no, customer_name, item_desc, test_date, created_at, updated_at, is_printed)
        VALUES (@srNo, @customerName, @itemDesc, @testDateTime, @now, @now, 0)
      `).run({ 
        srNo, 
        customerName: customerName || null, 
        itemDesc: finalItemDesc, 
        testDateTime: testDateTime || null, 
        now 
      });

      const sampleId = info.lastInsertRowid;

      const linkReading = db.prepare(`
        INSERT OR IGNORE INTO sample_readings (sample_id, reading_id, excluded)
        VALUES (?, ?, 0)
      `);
      for (const rid of readingIds) {
        linkReading.run(sampleId, rid);
      }

      calcAutoResults(db, sampleId);

      db.prepare(`
        INSERT INTO audit_log (occurred_at, sample_id, action, detail_json)
        VALUES (?, ?, 'SAMPLE_CREATED', ?)
      `).run(now, sampleId, JSON.stringify({ srNo, readingCount: readingIds.length }));

      return sampleId;
    });

    const sampleId = createSample();
    console.log('[POST /api/samples] Success, returning:', { id: sampleId, srNo });
    res.status(201).json({ id: sampleId, srNo });
  } catch (err) {
    console.error('[POST /api/samples] Error:', err.message);
    if (err.message.includes('UNIQUE constraint failed')) {
      res.status(409).json({ error: `Sr.No "${srNo}" already exists.` });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

// PATCH /api/samples/:id — update sample metadata and/or readings
router.patch('/:id', (req, res) => {
  const sampleId = toPositiveInt(req.params.id);
  if (!sampleId) {
    return buildValidationError(res, [{ field: 'id', message: 'Sample id must be a positive integer.' }], 'Invalid sample id');
  }

  const { errors, cleaned } = validateSamplePayload(req.body, { requireReadingIds: false });
  if (errors.length) return buildValidationError(res, errors, 'Invalid sample payload');

  const { customerName, itemDesc, readingIds, testDate, testTime } = cleaned;
  const db = getDb();
  if (Array.isArray(readingIds) && readingIds.length > 0 && !ensureReadingIdsExist(db, readingIds)) {
    return buildValidationError(res, [{ field: 'readingIds', message: 'One or more selected readings do not exist.' }], 'Invalid readings selected');
  }

  const sample = db.prepare(`SELECT * FROM samples WHERE id = ?`).get(sampleId);
  if (!sample) return res.status(404).json({ error: 'Sample not found' });
  if (sample.is_printed) {
    return res.status(409).json({ error: 'Sample is locked after print' });
  }

  const now = new Date().toISOString();
  let testDateTime = testDate || null;
  if (testDate && testTime) {
    testDateTime = `${testDate}T${testTime}`;
  }

  try {
    db.transaction(() => {
      db.prepare(`
        UPDATE samples SET customer_name = ?, item_desc = ?, test_date = ?, updated_at = ? WHERE id = ?
      `).run(customerName || null, itemDesc || null, testDateTime || null, now, sampleId);

      if (Array.isArray(readingIds)) {
        db.prepare(`DELETE FROM sample_readings WHERE sample_id = ?`).run(sampleId);
        const linkReading = db.prepare(`
          INSERT OR IGNORE INTO sample_readings (sample_id, reading_id, excluded)
          VALUES (?, ?, 0)
        `);
        for (const rid of readingIds) {
          linkReading.run(sampleId, rid);
        }
        calcAutoResults(db, sampleId);
      }

      db.prepare(`
        INSERT INTO audit_log (occurred_at, sample_id, action, detail_json)
        VALUES (?, ?, 'SAMPLE_UPDATED', ?)
      `).run(now, sampleId, JSON.stringify({ customerName, readingCount: readingIds?.length || 0 }));
    })();
    res.json({ id: sampleId, ok: true });
  } catch (err) {
    console.error('[PATCH /api/samples/:id] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/samples/:id/revise — reopen a printed sample
router.post('/:id/revise', (req, res) => {
  const sampleId = toPositiveInt(req.params.id);
  if (!sampleId) {
    return buildValidationError(res, [{ field: 'id', message: 'Sample id must be a positive integer.' }], 'Invalid sample id');
  }

  const db = getDb();
  const sample = db.prepare(`SELECT * FROM samples WHERE id = ?`).get(sampleId);
  if (!sample) return res.status(404).json({ error: 'Not found' });
  if (!sample.is_printed) {
    return res.status(409).json({ error: 'Only printed samples can be revised' });
  }

  const now = new Date().toISOString();
  db.prepare(`UPDATE samples SET is_printed = 0, updated_at = ? WHERE id = ?`).run(now, sampleId);
  db.prepare(`
    INSERT INTO audit_log (occurred_at, sample_id, action, detail_json)
    VALUES (?, ?, 'REPORT_REVISED', ?)
  `).run(now, sampleId, JSON.stringify({ previous_printed: true }));

  res.json({ ok: true, id: sampleId, is_printed: false });
});

// PATCH /api/samples/:id/readings/:readingId — exclude/include a reading
router.patch('/:id/readings/:readingId', (req, res) => {
  const { excluded } = req.body;
  if (typeof excluded !== 'boolean') return res.status(400).json({ error: 'excluded boolean required' });

  const sampleId = toPositiveInt(req.params.id);
  const readingId = toPositiveInt(req.params.readingId);
  if (!sampleId || !readingId) {
    return buildValidationError(res, [{ field: 'id', message: 'Sample id and reading id must be positive integers.' }], 'Invalid route parameters');
  }

  const db = getDb();
  const sample = db.prepare(`SELECT * FROM samples WHERE id = ?`).get(sampleId);
  if (!sample) return res.status(404).json({ error: 'Sample not found' });
  if (sample.is_printed) {
    return res.status(409).json({ error: 'Sample is locked after print' });
  }

  db.prepare(`
    UPDATE sample_readings SET excluded = ? WHERE sample_id = ? AND reading_id = ?
  `).run(excluded ? 1 : 0, sampleId, readingId);

  calcAutoResults(db, sampleId);
  res.json({ ok: true });
});

// PATCH /api/samples/:id/result — save expert values
router.patch('/:id/result', (req, res) => {
  const sampleId = toPositiveInt(req.params.id);
  if (!sampleId) {
    return buildValidationError(res, [{ field: 'id', message: 'Sample id must be a positive integer.' }], 'Invalid sample id');
  }

  const { expertValues, deltaMeta } = req.body;
  const validation = validateExpertValuesPayload(expertValues);
  if (validation.errors.length) {
    return buildValidationError(res, validation.errors, 'Invalid final result payload');
  }

  const db = getDb();
  const sample = db.prepare(`SELECT * FROM samples WHERE id = ?`).get(sampleId);
  if (!sample) return res.status(404).json({ error: 'Not found' });
  if (sample.is_printed) {
    return res.status(409).json({ error: 'Sample is locked' });
  }

  const now = new Date().toISOString();

  db.transaction(() => {
    for (const [element, expertValue] of Object.entries(expertValues)) {
      const autoRow = db.prepare(`
        SELECT auto_value FROM auto_results WHERE sample_id = ? AND element = ?
      `).get(sampleId, element);

      db.prepare(`
        INSERT INTO final_results (sample_id, element, auto_value, expert_value)
        VALUES (@sampleId, @element, @autoValue, @expertValue)
        ON CONFLICT (sample_id, element) DO UPDATE SET
          auto_value = excluded.auto_value,
          expert_value = excluded.expert_value
      `).run({
        sampleId,
        element,
        autoValue: autoRow?.auto_value ?? null,
        expertValue,
      });
    }

    db.prepare(`UPDATE samples SET updated_at = ? WHERE id = ?`).run(now, sampleId);

    db.prepare(`
      INSERT INTO audit_log (occurred_at, sample_id, action, detail_json)
      VALUES (?, ?, 'EXPERT_OVERRIDE', ?)
    `).run(now, sampleId, JSON.stringify({ expertValues, deltaMeta: deltaMeta || null }));
  })();

  res.json({ ok: true });
});

// POST /api/samples/:id/report — print job (or preview)
router.post('/:id/report', async (req, res) => {
  const sampleId = toPositiveInt(req.params.id);
  if (!sampleId) {
    return buildValidationError(res, [{ field: 'id', message: 'Sample id must be a positive integer.' }], 'Invalid sample id');
  }

  const mode = String(req.query.mode || '').toLowerCase();
  if (mode && mode !== 'preview') {
    return buildValidationError(res, [{ field: 'mode', message: 'mode must be omitted or set to preview.' }], 'Invalid mode');
  }

  const db = getDb();
  const sample = db.prepare(`SELECT * FROM samples WHERE id = ?`).get(sampleId);
  if (!sample) return res.status(404).json({ error: 'Not found' });

  try {
    const readings = db.prepare(`
      SELECT r.*, sr.excluded
      FROM readings r
      JOIN sample_readings sr ON sr.reading_id = r.id
      WHERE sr.sample_id = ?
      ORDER BY r.id ASC
    `).all(sampleId).map(r => ({ ...r, elements: JSON.parse(r.elements_json || '[]') }));

    const autoResults  = db.prepare(`SELECT element, auto_value FROM auto_results WHERE sample_id = ?`).all(sampleId);
    const finalResults = db.prepare(`SELECT element, auto_value, expert_value FROM final_results WHERE sample_id = ?`).all(sampleId);
    const fullSample   = { ...sample, readings, autoResults, finalResults };

    if (mode === 'preview') {
      return res.json({ ok: true, previewHtml: buildPreviewHtml(fullSample) });
    }

    // Load printer settings
    const settingsPath = path.join(__dirname, '..', '..', 'settings.json');
    let settings = {};
    try {
      if (fs.existsSync(settingsPath)) settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch (_) {}

    const fileName = `${sample.sr_no}-${Date.now()}.txt`;
    const filePath = path.join(os.tmpdir(), fileName);
    const orderedElements = buildOrderedElements(fullSample);
    const adjustedValues = buildAdjustedValues(fullSample);
    const missingAdjusted = orderedElements.filter(el => !adjustedValues.has(el));
    if (missingAdjusted.length > 0) {
      return res.status(409).json({
        error: 'Missing adjusted/final values for print',
        detail: `Set final values for: ${missingAdjusted.join(', ')}`,
      });
    }

    fs.writeFileSync(filePath, buildPrintJobText(fullSample, adjustedValues, orderedElements), 'utf8');

    const printerName = settings.printerName || '';
    const safePath = filePath.replace(/'/g, "''");
    const safePrinter = printerName.replace(/'/g, "''");
    const printCmd = printerName.trim()
      ? `Get-Content -Path '${safePath}' | Out-Printer -Name '${safePrinter}'`
      : `Get-Content -Path '${safePath}' | Out-Printer`;

    await new Promise((resolve, reject) => {
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', printCmd], { windowsHide: true, timeout: 30000 }, (err, stdout, stderr) => {
        if (err) {
          const details = stderr || stdout || err.message;
          reject(new Error(`Direct print failed: ${details}`));
          return;
        }
        resolve();
      });
    });

    try { fs.unlinkSync(filePath); } catch (_) {}

    const now = new Date().toISOString();
    db.prepare(`INSERT INTO reports (sample_id, generated_at, file_path) VALUES (?, ?, ?)`)
      .run(sampleId, now, `PRINT_JOB:${fileName}`);
    db.prepare(`UPDATE samples SET is_printed = 1, updated_at = ? WHERE id = ?`)
      .run(now, sampleId);
    db.prepare(`INSERT INTO audit_log (occurred_at, sample_id, action, detail_json) VALUES (?, ?, 'REPORT_GENERATED', ?)`)
      .run(now, sampleId, JSON.stringify({ fileName, printer: printerName || 'default' }));

    res.json({ ok: true, printed: true, printer: printerName || 'default', fileName });
  } catch (err) {
    console.error('[Report] Generation error:', err);
    res.status(500).json({ error: 'Report generation/printing failed', detail: err.message });
  }
});

// GET /api/samples/:id/export.csv
router.get('/:id/export.csv', (req, res) => {
  try {
    const db = getDb();
    const sample = db.prepare(`SELECT * FROM samples WHERE id = ?`).get(req.params.id);
    if (!sample) return res.status(404).json({ error: 'Not found' });

    const readings = db.prepare(`
      SELECT r.*, sr.excluded
      FROM readings r
      JOIN sample_readings sr ON sr.reading_id = r.id
      WHERE sr.sample_id = ?
      ORDER BY r.id ASC
    `).all(req.params.id).map(r => ({ ...r, elements: JSON.parse(r.elements_json || '[]') }));

    const finalResults = db.prepare(`
      SELECT element, auto_value, expert_value FROM final_results WHERE sample_id = ?
    `).all(req.params.id);

    const elementNames = [...new Set(readings.flatMap(r => r.elements.map(e => e.name)))];

    const lines = [];
    lines.push(`Sr No,${sample.sr_no}`);
    lines.push(`Customer,${sample.customer_name || ''}`);
    lines.push(`Item,${sample.item_desc || ''}`);
    lines.push(`Printed,${sample.is_printed ? 'Yes' : 'No'}`);
    lines.push('');

    lines.push(['#', 'Time', 'Status', ...elementNames].join(','));
    for (const r of readings) {
      const row = [
        r.nbr ?? r.id,
        new Date(r.arrived_at).toLocaleString('en-GB'),
        r.excluded ? 'Excluded' : 'Included',
        ...elementNames.map(n => {
          const el = r.elements.find(e => e.name === n);
          return el?.value != null ? el.value.toFixed(4) : '';
        }),
      ];
      lines.push(row.join(','));
    }
    lines.push('');

    lines.push(['Final Result', '', '', ...elementNames].join(','));
    const finalRow = [
      'APPROVED',
      '',
      '',
      ...elementNames.map(n => {
        const fr = finalResults.find(f => f.element === n);
        const val = fr?.expert_value ?? fr?.auto_value;
        return val != null ? val.toFixed(4) : '';
      }),
    ];
    lines.push(finalRow.join(','));

    const csv = lines.join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${sample.sr_no}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error('[GET /api/samples/:id/export.csv] Error:', err);
    res.status(500).json({ error: 'Failed to export CSV' });
  }
});

module.exports = router;