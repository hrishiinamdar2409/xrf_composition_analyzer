/**
 * SQLite database setup and schema – Simplified & Consistent
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
    CREATE TABLE IF NOT EXISTS readings (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      arrived_at    TEXT    NOT NULL,
      file_path     TEXT    NOT NULL,
      block         TEXT,
      entry_index   INTEGER NOT NULL,
      profile       TEXT,

      serial_number TEXT,
      reading_date  TEXT,
      reading_time  TEXT,
      customer_name TEXT,
      sample_type   TEXT,
      weight        REAL,

      "Au" REAL DEFAULT 0.0, "Ag" REAL DEFAULT 0.0, "Cu" REAL DEFAULT 0.0,
      "Zn" REAL DEFAULT 0.0, "Ni" REAL DEFAULT 0.0, "Cd" REAL DEFAULT 0.0,
      "In" REAL DEFAULT 0.0, "Ir" REAL DEFAULT 0.0, "Ru" REAL DEFAULT 0.0,
      "Rh" REAL DEFAULT 0.0, "Pd" REAL DEFAULT 0.0, "Fe" REAL DEFAULT 0.0,
      "Pt" REAL DEFAULT 0.0, "Os" REAL DEFAULT 0.0, "Re" REAL DEFAULT 0.0,
      "Co" REAL DEFAULT 0.0, "Ga" REAL DEFAULT 0.0, "Sn" REAL DEFAULT 0.0,
      "Pb" REAL DEFAULT 0.0, "Bi" REAL DEFAULT 0.0, "W"  REAL DEFAULT 0.0,
      "Sb" REAL DEFAULT 0.0, "mq" REAL DEFAULT 0.0, "x1" REAL DEFAULT 0.0,

      elements_json TEXT    NOT NULL,
      raw_json      TEXT    NOT NULL,
      UNIQUE(file_path, block, entry_index)
    );

    CREATE TABLE IF NOT EXISTS samples (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      sr_no         TEXT    NOT NULL UNIQUE,
      customer_name TEXT,
      item_desc     TEXT,
      test_date     TEXT,
      created_at    TEXT    NOT NULL,
      updated_at    TEXT,
      is_printed    INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sample_readings (
      sample_id   INTEGER NOT NULL REFERENCES samples(id),
      reading_id  INTEGER NOT NULL REFERENCES readings(id),
      excluded    INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (sample_id, reading_id)
    );

    CREATE TABLE IF NOT EXISTS auto_results (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      sample_id   INTEGER NOT NULL REFERENCES samples(id),
      element     TEXT    NOT NULL,
      auto_value  REAL,
      UNIQUE (sample_id, element)
    );

    CREATE TABLE IF NOT EXISTS final_results (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      sample_id     INTEGER NOT NULL REFERENCES samples(id),
      element       TEXT    NOT NULL,
      auto_value    REAL,
      expert_value  REAL,
      UNIQUE (sample_id, element)
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      occurred_at TEXT    NOT NULL,
      sample_id   INTEGER REFERENCES samples(id),
      reading_id  INTEGER REFERENCES readings(id),
      action      TEXT    NOT NULL,
      actor       TEXT,
      detail_json TEXT
    );

    CREATE TABLE IF NOT EXISTS reports (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      sample_id     INTEGER NOT NULL REFERENCES samples(id),
      generated_at  TEXT    NOT NULL,
      file_path     TEXT    NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_readings_arrived ON readings (arrived_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_occurred ON audit_log (occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_samples_sr_no ON samples(sr_no);
  `);

  // Flattened architecture: ensure all element columns exist in readings
  const targetColumns = [
    'file_path', 'block', 'entry_index', 'profile', 'serial_number', 'reading_date', 'reading_time', 'customer_name', 'sample_type', 'weight',
    'Au', 'Ag', 'Cu', 'Zn', 'Ni', 'Cd', 'In', 'Ir', 'Ru', 'Rh', 'Pd', 'Fe',
    'Pt', 'Os', 'Re', 'Co', 'Ga', 'Sn', 'Pb', 'Bi', 'W', 'Sb', 'mq', 'x1'
  ];

  targetColumns.forEach(col => {
    try {
      const type = (col === 'weight' || ['serial_number', 'reading_date', 'reading_time', 'customer_name', 'sample_type', 'profile', 'file_path', 'entry_index', 'block'].indexOf(col) === -1) ? 'REAL DEFAULT 0.0' : 'TEXT';
      db.exec(`ALTER TABLE readings ADD COLUMN "${col}" ${type}`);
    } catch (_) {}
  });
}

module.exports = { getDb };