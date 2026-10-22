import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

fs.mkdirSync(path.join(config.dataDir, 'belege'), { recursive: true });
export const uploadDir = path.join(config.dataDir, 'belege');

export const dbFile = process.env.DB_FILE || path.join(config.dataDir, 'kasse.sqlite');
export const db = new DatabaseSync(dbFile);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

// Alle Beträge in Cent (INTEGER). Zahlungen tragen ein Vorzeichen (+ Eingang, − Ausgang),
// Belege, Aufteilungen und Zuordnungen sind immer positiv.
db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  pw_hash TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('bank','cash')),
  iban TEXT,
  opening_cents INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS cost_centers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  color TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE
);
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  date TEXT NOT NULL,
  name TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT '',
  amount_cents INTEGER NOT NULL CHECK (amount_cents <> 0),
  transfer_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS payments_account ON payments(account_id, date);
CREATE TABLE IF NOT EXISTS receipts (
  id INTEGER PRIMARY KEY,
  year INTEGER,
  seq INTEGER,
  kind TEXT NOT NULL DEFAULT 'ausgabe' CHECK (kind IN ('ausgabe','einnahme')),
  description TEXT NOT NULL DEFAULT '',
  amount_cents INTEGER,
  date TEXT,
  advance_name TEXT,
  reviewed INTEGER NOT NULL DEFAULT 0,
  file TEXT,
  file_name TEXT,
  mime TEXT,
  size INTEGER,
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  uploaded_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (year, seq)
);
CREATE TABLE IF NOT EXISTS receipt_splits (
  id INTEGER PRIMARY KEY,
  receipt_id INTEGER NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  cost_center_id INTEGER NOT NULL REFERENCES cost_centers(id),
  category_id INTEGER REFERENCES categories(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0)
);
-- Zuordnung einer Zahlung: entweder zu einem Beleg oder direkt gebucht (Spende, Zuschuss, Sonstiges)
CREATE TABLE IF NOT EXISTS allocations (
  id INTEGER PRIMARY KEY,
  payment_id INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  receipt_id INTEGER REFERENCES receipts(id),
  kind TEXT NOT NULL CHECK (kind IN ('beleg','spende','zuschuss','sonstiges')),
  cost_center_id INTEGER REFERENCES cost_centers(id),
  category_id INTEGER REFERENCES categories(id),
  note TEXT,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0)
);
CREATE INDEX IF NOT EXISTS allocations_receipt ON allocations(receipt_id);
-- Links zum Hochladen per Handy: persönlich (je Nutzer) oder fürs ganze Team, jeweils mit PIN
CREATE TABLE IF NOT EXISTS upload_links (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('personal','team')),
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  pin TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);
`);

const norm = params => params.map(v => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));
export const get = (sql, ...p) => db.prepare(sql).get(...norm(p));
export const all = (sql, ...p) => db.prepare(sql).all(...norm(p));
export const run = (sql, ...p) => db.prepare(sql).run(...norm(p));

let depth = 0;
export function tx(fn) {
  if (depth > 0) return fn();
  depth++;
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
  finally { depth--; }
}

export const setting = key => get('SELECT value FROM settings WHERE key = ?', key)?.value ?? null;
export const setSetting = (key, value) => run('INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, String(value));
