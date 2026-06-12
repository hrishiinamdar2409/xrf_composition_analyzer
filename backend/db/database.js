/**
 * SQLite database setup and schema
 * Single file: goldscope-data.db
 */

'use strict';

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', '..', 'goldscope-data.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initialise(db);
  }
  return db;
}

function initialise(db) {
  db.exec(`
    -- ---------------------------------------------------------------
    -- Raw readings received directly from WinFTM .exp export
    -- These are NEVER deleted or modified after insertion.
    -- ---------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS readings (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      arrived_at  TEXT    NOT NULL,          -- ISO-8601 timestamp when we received it
      nbr         INTEGER,                   -- @NBR from WinFTM
      profile     TEXT,                      -- @PRF (alloy/product type)
      block       INTEGER,                   -- @BLK if available
      elements_json TEXT NOT NULL,           -- JSON array of {name, value} per element
      raw_json    TEXT NOT NULL              -- Full raw key→value object for audit
    );

    -- ---------------------------------------------------------------
    -- Samples (jobs) — one per physical customer item
    -- ---------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS samples (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      job_ref       TEXT    NOT NULL UNIQUE, -- e.g. JOB-2026-001
      customer_name TEXT,
      item_desc     TEXT,
      test_date     TEXT,
      created_at    TEXT    NOT NULL,
      updated_at    TEXT,                    -- ISO-8601 timestamp of last modification
      status        TEXT    NOT NULL DEFAULT 'pending_review',
                              -- pending_review | expert_review | approved | report_generated
      approved_by   TEXT,
      approved_at   TEXT,
      expert_notes  TEXT
    );

    -- ---------------------------------------------------------------
    -- Link table: which readings belong to which sample
    -- ---------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS sample_readings (
      sample_id   INTEGER NOT NULL REFERENCES samples(id),
      reading_id  INTEGER NOT NULL REFERENCES readings(id),
      excluded    INTEGER NOT NULL DEFAULT 0, -- 1 = excluded by expert
      PRIMARY KEY (sample_id, reading_id)
    );

    -- ---------------------------------------------------------------
    -- Auto-calculated suggestion stored at time of selection
    -- One row per sample, per element
    -- ---------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS auto_results (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      sample_id   INTEGER NOT NULL REFERENCES samples(id),
      element     TEXT    NOT NULL,
      auto_value  REAL,                      -- plain average of selected readings
      UNIQUE (sample_id, element)
    );

    -- ---------------------------------------------------------------
    -- Expert's final approved values
    -- One row per sample, per element
    -- ---------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS final_results (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      sample_id     INTEGER NOT NULL REFERENCES samples(id),
      element       TEXT    NOT NULL,
      auto_value    REAL,                    -- snapshot of auto_value at approval time
      expert_value  REAL,                    -- expert's final value (may equal auto_value)
      UNIQUE (sample_id, element)
    );

    -- ---------------------------------------------------------------
    -- Audit log — append-only
    -- ---------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS audit_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      occurred_at TEXT    NOT NULL,
      sample_id   INTEGER REFERENCES samples(id),
      reading_id  INTEGER REFERENCES readings(id),
      action      TEXT    NOT NULL,          -- e.g. READING_RECEIVED, SAMPLE_CREATED, EXPERT_OVERRIDE, APPROVED, REPORT_GENERATED
      actor       TEXT,                      -- user who performed the action
      detail_json TEXT                       -- additional context as JSON
    );

    -- ---------------------------------------------------------------
    -- Reports — metadata for generated PDFs
    -- ---------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS reports (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      sample_id     INTEGER NOT NULL REFERENCES samples(id),
      generated_at  TEXT    NOT NULL,
      file_path     TEXT    NOT NULL
    );
  `);

  // ── Migration: add updated_at to existing samples tables ──────────────────
  try {
    db.exec(`ALTER TABLE samples ADD COLUMN updated_at TEXT`);
  } catch (_) {
    // Column already exists — safe to ignore
  }

  try {
    db.exec(`ALTER TABLE samples ADD COLUMN test_date TEXT`);
  } catch (_) {
    // Column already exists — safe to ignore
  }
}

module.exports = { getDb };
