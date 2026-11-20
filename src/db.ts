// The database layer. Everything lives in ONE local SQLite file.
//
// Why SQLite instead of a vector store? Bank transactions are structured rows,
// and most questions about them are arithmetic ("how much on food in March?").
// SQL answers those exactly. Embeddings are only used for fuzzy jobs like
// guessing a category (see categorize/).

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type Db = DatabaseSync;

/** Default location: ~/.finance-mcp/finance.db (override with FINANCE_DB). */
export function defaultDbPath(): string {
  return process.env.FINANCE_DB ?? path.join(os.homedir(), '.finance-mcp', 'finance.db');
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS transactions (
  id              INTEGER PRIMARY KEY,
  date            TEXT    NOT NULL,          -- ISO 'YYYY-MM-DD' so string sorting = date sorting
  amount_cents    INTEGER NOT NULL,          -- integer cents; negative = money out
  currency        TEXT    NOT NULL DEFAULT 'CAD',
  description     TEXT    NOT NULL,          -- raw text from the bank
  merchant        TEXT    NOT NULL,          -- cleaned-up name, used for grouping/categorizing
  category        TEXT,                      -- NULL = not categorized yet
  category_source TEXT,                      -- 'rule' | 'embedding' | 'manual'
  account         TEXT,
  source_file     TEXT,
  fingerprint     TEXT    NOT NULL UNIQUE,   -- lets us re-import the same file without duplicates
  imported_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tx_date     ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_tx_category ON transactions(category);
CREATE INDEX IF NOT EXISTS idx_tx_merchant ON transactions(merchant);

-- One saved column mapping per CSV layout (keyed by its header row).
CREATE TABLE IF NOT EXISTS import_profiles (
  header_signature TEXT PRIMARY KEY,
  name             TEXT,
  mapping_json     TEXT NOT NULL
);

-- "Anything whose merchant contains <pattern> is <category>". Created when you correct a category.
CREATE TABLE IF NOT EXISTS category_rules (
  pattern  TEXT PRIMARY KEY,               -- stored uppercase
  category TEXT NOT NULL
);

-- Cache so we never embed the same text twice.
CREATE TABLE IF NOT EXISTS embeddings (
  text   TEXT NOT NULL,
  model  TEXT NOT NULL,
  vector BLOB NOT NULL,                    -- Float32Array bytes
  PRIMARY KEY (text, model)
);
`;

export function openDb(file: string = defaultDbPath()): Db {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  return db;
}

/** A second connection that physically cannot write — used by the run_sql tool. */
export function openReadOnly(file: string = defaultDbPath()): Db {
  return new DatabaseSync(file, { readOnly: true });
}

/** Run fn inside BEGIN/COMMIT, rolling back on error. */
export function inTransaction<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
