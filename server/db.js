import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

fs.mkdirSync(config.dataDir, { recursive: true });
fs.mkdirSync(path.join(config.dataDir, 'uploads'), { recursive: true });

export const dbFile = process.env.DB_FILE || path.join(config.dataDir, 'kaminfeger.sqlite');
export const db = new DatabaseSync(dbFile);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('customer','sweep','admin')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (email, role)
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS codes (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  purpose TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  used INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS codes_email ON codes(email, role);
CREATE TABLE IF NOT EXISTS tokens (
  hash TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  ref_id INTEGER,
  data TEXT,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS districts (
  id INTEGER PRIMARY KEY,
  land TEXT NOT NULL,
  kreis TEXT NOT NULL,
  number TEXT NOT NULL,
  holder_name TEXT NOT NULL,
  official_email TEXT NOT NULL,
  business_address TEXT,
  appointed_until TEXT,
  UNIQUE (kreis, number)
);
CREATE TABLE IF NOT EXISTS sweeps (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  first TEXT NOT NULL,
  last TEXT NOT NULL,
  phone TEXT,
  bstreet TEXT NOT NULL,
  bplz TEXT NOT NULL,
  bort TEXT NOT NULL,
  district_id INTEGER REFERENCES districts(id),
  status TEXT NOT NULL DEFAULT 'draft',
  reject_reason TEXT,
  submitted_at TEXT,
  decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY,
  sweep_id INTEGER NOT NULL REFERENCES sweeps(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('urkunde','ausweis')),
  filename TEXT NOT NULL,
  stored TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (sweep_id, kind)
);
CREATE TABLE IF NOT EXISTS households (
  id INTEGER PRIMARY KEY,
  district_id INTEGER NOT NULL REFERENCES districts(id),
  street TEXT NOT NULL,
  street_key TEXT NOT NULL,
  nr TEXT NOT NULL,
  plz TEXT NOT NULL,
  ort TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  customer_no TEXT,
  email TEXT,
  phone TEXT,
  moved_at TEXT,
  UNIQUE (district_id, street_key, plz, nr)
);
CREATE INDEX IF NOT EXISTS households_addr ON households(street_key, plz);
CREATE TABLE IF NOT EXISTS residents (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  household_id INTEGER REFERENCES households(id),
  family_name TEXT NOT NULL,
  person_name TEXT,
  street TEXT NOT NULL,
  nr TEXT NOT NULL,
  plz TEXT NOT NULL,
  ort TEXT NOT NULL,
  status TEXT NOT NULL,
  method TEXT,
  is_member INTEGER NOT NULL DEFAULT 0,
  rem_eve INTEGER NOT NULL DEFAULT 1,
  rem_hour INTEGER NOT NULL DEFAULT 1,
  ch_push INTEGER NOT NULL DEFAULT 1,
  ch_mail INTEGER NOT NULL DEFAULT 1,
  prep TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  verified_at TEXT,
  moved_at TEXT
);
CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY,
  district_id INTEGER NOT NULL REFERENCES districts(id),
  street TEXT NOT NULL,
  street_key TEXT NOT NULL,
  plz TEXT NOT NULL,
  slot_len INTEGER NOT NULL,
  deadline TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at TEXT
);
CREATE TABLE IF NOT EXISTS windows (
  id INTEGER PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  start TEXT NOT NULL,
  end TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  household_id INTEGER NOT NULL REFERENCES households(id),
  window_id INTEGER NOT NULL REFERENCES windows(id) ON DELETE CASCADE,
  time TEXT NOT NULL,
  key_note TEXT,
  source TEXT NOT NULL DEFAULT 'app',
  status TEXT NOT NULL DEFAULT 'booked',
  visit TEXT,
  reminded_eve INTEGER NOT NULL DEFAULT 0,
  reminded_hour INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS bookings_slot ON bookings(window_id, time) WHERE status = 'booked';
CREATE UNIQUE INDEX IF NOT EXISTS bookings_house ON bookings(campaign_id, household_id) WHERE status = 'booked';
CREATE TABLE IF NOT EXISTS route_days (
  district_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  started_at TEXT NOT NULL,
  PRIMARY KEY (district_id, date)
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  sweep_id INTEGER NOT NULL REFERENCES sweeps(id),
  campaign_id INTEGER REFERENCES campaigns(id) ON DELETE SET NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS message_recipients (
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  household_id INTEGER NOT NULL REFERENCES households(id),
  PRIMARY KEY (message_id, household_id)
);
CREATE TABLE IF NOT EXISTS message_reads (
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (message_id, user_id)
);
CREATE TABLE IF NOT EXISTS passkeys (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cred_id TEXT NOT NULL UNIQUE,
  public_key BLOB NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT,
  name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used TEXT
);
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  contact TEXT,
  ip_hash TEXT,
  page TEXT,
  note TEXT NOT NULL,
  mark TEXT,
  image BLOB,
  device TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS admin_log (
  id INTEGER PRIMARY KEY,
  admin_email TEXT NOT NULL,
  what TEXT NOT NULL,
  note TEXT,
  at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS outbox (
  id INTEGER PRIMARY KEY,
  to_addr TEXT NOT NULL,
  subject TEXT NOT NULL,
  text TEXT NOT NULL,
  link TEXT,
  link_label TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;
// Feedback war anfangs nur für angemeldete Nutzer (user_id NOT NULL) – Tabelle umbauen, Einträge behalten
{
  const cols = db.prepare('PRAGMA table_info(feedback)').all();
  if (cols.length && !cols.some(c => c.name === 'contact')) {
    db.exec(`ALTER TABLE feedback RENAME TO feedback_old`);
    db.exec(SCHEMA);
    db.exec(`INSERT INTO feedback (id, user_id, role, page, note, mark, image, device, status, created_at)
      SELECT id, user_id, role, page, note, mark, image, device, status, created_at FROM feedback_old; DROP TABLE feedback_old;`);
  }
}
db.exec(SCHEMA);

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

export function wipe() {
  const tables = ['message_reads', 'message_recipients', 'messages', 'route_days', 'bookings', 'windows', 'campaigns', 'residents', 'households',
    'passkeys', 'feedback', 'documents', 'sweeps', 'districts', 'tokens', 'codes', 'sessions', 'users', 'admin_log', 'outbox'];
  db.exec('PRAGMA foreign_keys = OFF');
  for (const t of tables) db.exec(`DELETE FROM ${t}`);
  db.exec('PRAGMA foreign_keys = ON');
  const dir = path.join(config.dataDir, 'uploads');
  for (const f of fs.readdirSync(dir)) fs.rmSync(path.join(dir, f), { force: true });
}
