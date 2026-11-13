import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

fs.mkdirSync(config.dataDir, { recursive: true });
fs.mkdirSync(path.join(config.dataDir, 'uploads'), { recursive: true });

export const dbFile = process.env.DB_FILE || path.join(config.dataDir, 'kaminfeger.sqlite');
export const db = new DatabaseSync(dbFile);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

// Tabellen, die der Umbau „Betrieb statt Kehrbezirk“ neu aufbaut – Definition einmal, für Schema und Migration.
// Haushalte (die Kundenliste), Runden und Routentage gehören dem Betrieb (sweep_id).
const T = {
  sweeps: `(
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  first TEXT NOT NULL,
  last TEXT NOT NULL,
  company TEXT,
  phone TEXT,
  bstreet TEXT NOT NULL,
  bplz TEXT NOT NULL,
  bort TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  reject_reason TEXT,
  submitted_at TEXT,
  decided_at TEXT,
  own_data_at TEXT,
  demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`,
  households: `(
  id INTEGER PRIMARY KEY,
  sweep_id INTEGER NOT NULL REFERENCES sweeps(id),
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
  UNIQUE (sweep_id, street_key, plz, nr)
)`,
  campaigns: `(
  id INTEGER PRIMARY KEY,
  sweep_id INTEGER NOT NULL REFERENCES sweeps(id),
  street TEXT NOT NULL,
  street_key TEXT NOT NULL,
  plz TEXT NOT NULL,
  work TEXT NOT NULL DEFAULT 'Kehren und Überprüfen',
  slot_len INTEGER NOT NULL,
  deadline TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at TEXT,
  closed_at TEXT
)`,
  route_days: `(
  sweep_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  started_at TEXT NOT NULL,
  PRIMARY KEY (sweep_id, date)
)`
};

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
CREATE TABLE IF NOT EXISTS sweeps ${T.sweeps};
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
CREATE TABLE IF NOT EXISTS households ${T.households};
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
CREATE TABLE IF NOT EXISTS campaigns ${T.campaigns};
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
CREATE TABLE IF NOT EXISTS route_days ${T.route_days};
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
-- Messenger: Unterhaltung je Haushalt mit seinem Kaminfeger (nur Text, 12 Monate)
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY,
  household_id INTEGER NOT NULL REFERENCES households(id),
  from_sweep INTEGER NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  read_at TEXT,
  mailed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS chat_household ON chat_messages(household_id, id);
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
/**
 * Umbau „Betrieb statt Kehrbezirk“: Früher hing alles an einem Kehrbezirk (districts) mit genau einem Kaminfeger.
 * Jetzt gehören Kundenliste, Runden und Routentage dem Betrieb selbst. Bestehende Daten wandern zum Kaminfeger
 * des bisherigen Bezirks; Bezirke ohne Kaminfeger werden samt Anhang entfernt. „Geprüft, aber noch nicht per Link
 * freigeschaltet“ (approved) gibt es nicht mehr – solche Konten sind danach aktiv.
 */
export let rebuilt = false;
function migrateToBetrieb() {
  const cols = t => db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);
  if (!cols('households').includes('district_id')) return;
  const or = (t, c, alt = 'NULL') => (cols(t).includes(c) ? c : alt);
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(`
      CREATE TEMP TABLE _owner AS SELECT d.id AS district_id,
        (SELECT s.id FROM sweeps s WHERE s.district_id = d.id ORDER BY (s.status = 'active') DESC, (s.status = 'approved') DESC, s.id LIMIT 1) AS sweep_id
        FROM districts d;
      CREATE TEMP TABLE _gone_h AS SELECT h.id FROM households h LEFT JOIN _owner o ON o.district_id = h.district_id WHERE o.sweep_id IS NULL;
      CREATE TEMP TABLE _gone_c AS SELECT c.id FROM campaigns c LEFT JOIN _owner o ON o.district_id = c.district_id WHERE o.sweep_id IS NULL;
      DELETE FROM bookings WHERE household_id IN (SELECT id FROM _gone_h) OR campaign_id IN (SELECT id FROM _gone_c);
      DELETE FROM windows WHERE campaign_id IN (SELECT id FROM _gone_c);
      UPDATE messages SET campaign_id = NULL WHERE campaign_id IN (SELECT id FROM _gone_c);
      DELETE FROM message_recipients WHERE household_id IN (SELECT id FROM _gone_h);
      UPDATE residents SET household_id = NULL, status = 'unverified' WHERE household_id IN (SELECT id FROM _gone_h);
      DELETE FROM tokens WHERE kind = 'activate' OR (kind IN ('invite','member') AND ref_id IN (SELECT id FROM _gone_h));
    `);
    if (cols('chat_messages').length) db.exec('DELETE FROM chat_messages WHERE household_id IN (SELECT id FROM _gone_h)');
    db.exec(`
      CREATE TABLE sweeps_new ${T.sweeps};
      INSERT INTO sweeps_new (id, user_id, first, last, phone, bstreet, bplz, bort, status, reject_reason, submitted_at, decided_at, demo, created_at)
        SELECT s.id, s.user_id, s.first, s.last, s.phone, s.bstreet, s.bplz, s.bort, CASE s.status WHEN 'approved' THEN 'active' ELSE s.status END,
          s.reject_reason, s.submitted_at, s.decided_at, (u.email LIKE '%@demo.invalid'), s.created_at FROM sweeps s JOIN users u ON u.id = s.user_id;
      CREATE TABLE households_new ${T.households};
      INSERT INTO households_new (id, sweep_id, street, street_key, nr, plz, ort, owner_name, customer_no, email, phone, moved_at)
        SELECT h.id, o.sweep_id, h.street, h.street_key, h.nr, h.plz, h.ort, h.owner_name, h.customer_no, h.email, h.phone, h.moved_at
        FROM households h JOIN _owner o ON o.district_id = h.district_id WHERE o.sweep_id IS NOT NULL;
      CREATE TABLE campaigns_new ${T.campaigns};
      INSERT INTO campaigns_new (id, sweep_id, street, street_key, plz, slot_len, deadline, created_at, sent_at, closed_at)
        SELECT c.id, o.sweep_id, c.street, c.street_key, c.plz, c.slot_len, c.deadline, c.created_at, c.sent_at, ${or('campaigns', 'closed_at')}
        FROM campaigns c JOIN _owner o ON o.district_id = c.district_id WHERE o.sweep_id IS NOT NULL;
      CREATE TABLE route_days_new ${T.route_days};
      INSERT OR IGNORE INTO route_days_new (sweep_id, date, started_at)
        SELECT o.sweep_id, r.date, r.started_at FROM route_days r JOIN _owner o ON o.district_id = r.district_id WHERE o.sweep_id IS NOT NULL;
      DROP TABLE sweeps; ALTER TABLE sweeps_new RENAME TO sweeps;
      DROP TABLE households; ALTER TABLE households_new RENAME TO households;
      DROP TABLE campaigns; ALTER TABLE campaigns_new RENAME TO campaigns;
      DROP TABLE route_days; ALTER TABLE route_days_new RENAME TO route_days;
      DROP TABLE districts;
      DROP TABLE _owner; DROP TABLE _gone_h; DROP TABLE _gone_c;
    `);
    const broken = db.prepare('PRAGMA foreign_key_check').all();
    if (broken.length) throw new Error(`Umbau der Datenbank abgebrochen: ${broken.length} verwaiste Verweise (z. B. Tabelle ${broken[0].table}).`);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  finally { db.exec('PRAGMA foreign_keys = ON'); }
  rebuilt = true;
  console.log('Datenbank umgebaut: Kundenlisten und Runden gehören jetzt dem Betrieb (Kehrbezirke entfernt).');
}
migrateToBetrieb();

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
    'passkeys', 'feedback', 'documents', 'sweeps', 'tokens', 'codes', 'sessions', 'users', 'admin_log', 'outbox', 'chat_messages'];
  db.exec('PRAGMA foreign_keys = OFF');
  for (const t of tables) db.exec(`DELETE FROM ${t}`);
  db.exec('PRAGMA foreign_keys = ON');
  const dir = path.join(config.dataDir, 'uploads');
  for (const f of fs.readdirSync(dir)) fs.rmSync(path.join(dir, f), { force: true });
}
