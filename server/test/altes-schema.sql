-- Datenbank-Schema vor dem Umbau „Betrieb statt Kehrbezirk“ (Stand November 2026).
-- Nur für den Test der Daten-Übernahme (migration.test.js).

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('customer','sweep','admin')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (email, role)
);
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE TABLE codes (
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
CREATE INDEX codes_email ON codes(email, role);
CREATE TABLE tokens (
  hash TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  ref_id INTEGER,
  data TEXT,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE districts (
  id INTEGER PRIMARY KEY,
  land TEXT NOT NULL,
  kreis TEXT NOT NULL,
  number TEXT NOT NULL,
  holder_name TEXT NOT NULL,
  official_email TEXT NOT NULL,
  business_address TEXT,
  appointed_until TEXT, demo INTEGER NOT NULL DEFAULT 0,
  UNIQUE (kreis, number)
);
CREATE TABLE sweeps (
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
, req_land TEXT, req_kreis TEXT, req_bez TEXT);
CREATE TABLE documents (
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
CREATE TABLE households (
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
CREATE INDEX households_addr ON households(street_key, plz);
CREATE TABLE residents (
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
CREATE TABLE campaigns (
  id INTEGER PRIMARY KEY,
  district_id INTEGER NOT NULL REFERENCES districts(id),
  street TEXT NOT NULL,
  street_key TEXT NOT NULL,
  plz TEXT NOT NULL,
  slot_len INTEGER NOT NULL,
  deadline TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at TEXT,
  closed_at TEXT
);
CREATE TABLE windows (
  id INTEGER PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  start TEXT NOT NULL,
  end TEXT NOT NULL
);
CREATE TABLE bookings (
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
CREATE UNIQUE INDEX bookings_slot ON bookings(window_id, time) WHERE status = 'booked';
CREATE UNIQUE INDEX bookings_house ON bookings(campaign_id, household_id) WHERE status = 'booked';
CREATE TABLE route_days (
  district_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  started_at TEXT NOT NULL,
  PRIMARY KEY (district_id, date)
);
CREATE TABLE messages (
  id INTEGER PRIMARY KEY,
  sweep_id INTEGER NOT NULL REFERENCES sweeps(id),
  campaign_id INTEGER REFERENCES campaigns(id) ON DELETE SET NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE message_recipients (
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  household_id INTEGER NOT NULL REFERENCES households(id),
  PRIMARY KEY (message_id, household_id)
);
CREATE TABLE message_reads (
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (message_id, user_id)
);
CREATE TABLE passkeys (
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
CREATE TABLE feedback (
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
CREATE TABLE admin_log (
  id INTEGER PRIMARY KEY,
  admin_email TEXT NOT NULL,
  what TEXT NOT NULL,
  note TEXT,
  at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE chat_messages (
  id INTEGER PRIMARY KEY,
  household_id INTEGER NOT NULL REFERENCES households(id),
  from_sweep INTEGER NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  read_at TEXT,
  mailed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX chat_household ON chat_messages(household_id, id);
CREATE TABLE outbox (
  id INTEGER PRIMARY KEY,
  to_addr TEXT NOT NULL,
  subject TEXT NOT NULL,
  text TEXT NOT NULL,
  link TEXT,
  link_label TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
