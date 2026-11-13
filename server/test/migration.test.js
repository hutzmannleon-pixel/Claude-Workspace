// Umbau „Betrieb statt Kehrbezirk“: Eine Datenbank im alten Aufbau wird beim Start umgebaut, ohne dass Daten verloren gehen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kf-umbau-'));
const file = path.join(dir, 'kaminfeger.sqlite');
Object.assign(process.env, { DATA_DIR: dir, DB_FILE: file, TEST_MODE: '1', ADMIN_EMAILS: 'admin@test.de', BASE_URL: 'http://localhost:3000', APP_SECRET: 'test' });

// ---------- Alte Datenbank anlegen ----------
{
  const old = new DatabaseSync(file);
  old.exec('PRAGMA foreign_keys = ON;');
  old.exec(fs.readFileSync(new URL('./altes-schema.sql', import.meta.url), 'utf8'));
  const ins = (sql, ...p) => Number(old.prepare(sql).run(...p).lastInsertRowid);
  const user = (email, role) => ins('INSERT INTO users (email, role) VALUES (?,?)', email, role);
  const district = (kreis, nr, name, demo = 0) => ins(`INSERT INTO districts (land, kreis, number, holder_name, official_email, demo) VALUES ('Bayern', ?, ?, ?, 'amt@test.de', ?)`, kreis, nr, name, demo);
  const sweep = (uid, first, last, did, status) => ins(`INSERT INTO sweeps (user_id, first, last, phone, bstreet, bplz, bort, district_id, status) VALUES (?,?,?, '0911 1', 'Weg 1', '90402', 'Nürnberg', ?, ?)`, uid, first, last, did, status);
  const house = (did, street, nr, owner, kdnr = null, email = null) => ins(`INSERT INTO households (district_id, street, street_key, nr, plz, ort, owner_name, customer_no, email) VALUES (?,?,?,?, '90402', 'Nürnberg', ?,?,?)`,
    did, street, street.toLowerCase(), nr, owner, kdnr, email);
  const campaign = (did, street, closed = null) => ins(`INSERT INTO campaigns (district_id, street, street_key, plz, slot_len, deadline, sent_at, closed_at) VALUES (?,?,?, '90402', 30, '2026-11-20', '2026-11-01T08:00:00.000Z', ?)`, did, street, street.toLowerCase(), closed);
  const win = (cid, date) => ins(`INSERT INTO windows (campaign_id, date, start, end) VALUES (?,?, '08:00', '12:00')`, cid, date);
  const booking = (cid, hid, wid, time) => ins('INSERT INTO bookings (campaign_id, household_id, window_id, time) VALUES (?,?,?,?)', cid, hid, wid, time);
  const resident = (uid, hid, name, status) => ins(`INSERT INTO residents (user_id, household_id, family_name, street, nr, plz, ort, status) VALUES (?,?,?, 'Weg', '1', '90402', 'Nürnberg', ?)`, uid, hid, name, status);
  const token = (hash, kind, ref) => ins(`INSERT INTO tokens (hash, kind, ref_id, expires_at) VALUES (?,?,?, '2099-01-01T00:00:00.000Z')`, hash, kind, ref);

  // Bezirk 1: aktiver Kaminfeger mit Runde, Termin, Chat, Nachricht
  const d1 = district('Nürnberg', '1', 'Anna Aktiv');
  const sA = sweep(user('a@test.de', 'sweep'), 'Anna', 'Aktiv', d1, 'active');
  const h1 = house(d1, 'Erlenweg', '1', 'Fam. Eins', 'K-1', 'eins@test.de'), h2 = house(d1, 'Erlenweg', '2', 'Fam. Zwei');
  const c1 = campaign(d1, 'Erlenweg'), w1 = win(c1, '2026-11-25');
  booking(c1, h1, w1, '08:00');
  const cOld = campaign(d1, 'Erlenweg', '2026-06-01T10:00:00.000Z');
  resident(user('eins@test.de', 'customer'), h1, 'Eins', 'verified');
  ins(`INSERT INTO route_days (district_id, date, started_at) VALUES (?, '2026-11-25', '2026-11-25T07:00:00.000Z')`, d1);
  const m1 = ins(`INSERT INTO messages (sweep_id, campaign_id, text) VALUES (?,?, 'Zeitfenster')`, sA, c1);
  ins('INSERT INTO message_recipients (message_id, household_id) VALUES (?,?)', m1, h1);
  ins(`INSERT INTO chat_messages (household_id, from_sweep, text) VALUES (?, 0, 'Hallo')`, h1);
  token('t-invite-1', 'invite', h2);
  ins(`INSERT INTO documents (sweep_id, kind, filename, stored, mime, size) VALUES (?, 'urkunde', 'u.pdf', 'x.pdf', 'application/pdf', 3)`, sA);

  // Bezirk 2: geprüft, aber Freischaltlink noch nicht geöffnet
  const d2 = district('Fürth', '7', 'Bernd Bereit');
  const sB = sweep(user('b@test.de', 'sweep'), 'Bernd', 'Bereit', d2, 'approved');
  house(d2, 'Birkenallee', '5', 'Fam. Fünf');
  token('t-activate', 'activate', sB);

  // Bezirk 3: nur im Verzeichnis, ohne Kaminfeger – Haushalte, Runde, Termin, Bewohner, Chat hängen in der Luft
  const d3 = district('Erlangen', '3', 'Niemand');
  const h9 = house(d3, 'Geisterweg', '9', 'Fam. Neun');
  const c9 = campaign(d3, 'Geisterweg'), w9 = win(c9, '2026-11-26');
  booking(c9, h9, w9, '09:00');
  resident(user('neun@test.de', 'customer'), h9, 'Neun', 'verified');
  const m9 = ins(`INSERT INTO messages (sweep_id, campaign_id, text) VALUES (?,?, 'Verwaist')`, sA, c9);
  ins('INSERT INTO message_recipients (message_id, household_id) VALUES (?,?)', m9, h9);
  ins(`INSERT INTO chat_messages (household_id, from_sweep, text) VALUES (?, 0, 'Verwaist')`, h9);
  token('t-invite-9', 'invite', h9);

  // Vorschau-Bezirk und ein Entwurf ohne Bezirk
  const d4 = district('Musterstadt', '1', 'Max Muster', 1);
  sweep(user('kaminfeger@demo.invalid', 'sweep'), 'Max', 'Muster', d4, 'active');
  const hd = house(d4, 'Lindenweg', '5', 'Fam. Engel');
  resident(user('bewohner@demo.invalid', 'customer'), hd, 'Engel', 'verified');
  old.prepare(`INSERT INTO sweeps (user_id, first, last, bstreet, bplz, bort, status, req_land, req_kreis, req_bez) VALUES (?, 'Carl', 'Entwurf', 'Weg 2', '90402', 'Nürnberg', 'draft', 'Bayern', 'Nürnberg', '4')`).run(user('c@test.de', 'sweep'));
  old.close();
}

const { get, all, rebuilt } = await import('../db.js');
const sweepId = email => get('SELECT s.id FROM sweeps s JOIN users u ON u.id = s.user_id WHERE u.email = ?', email).id;

test('Alte Datenbank wird umgebaut: Kundenlisten und Runden gehen an den Kaminfeger des bisherigen Bezirks', () => {
  assert.equal(rebuilt, true);
  assert.equal(get(`SELECT COUNT(*) n FROM sqlite_master WHERE name = 'districts'`).n, 0);
  const cols = t => all(`PRAGMA table_info(${t})`).map(c => c.name);
  for (const t of ['households', 'campaigns', 'route_days']) assert.ok(cols(t).includes('sweep_id') && !cols(t).includes('district_id'), t);
  assert.ok(!cols('sweeps').some(c => ['district_id', 'req_land', 'req_kreis', 'req_bez'].includes(c)));
  const a = sweepId('a@test.de'), b = sweepId('b@test.de');
  assert.deepEqual(all('SELECT street, nr, sweep_id, customer_no, email FROM households ORDER BY id').map(h => [h.street, h.nr, h.sweep_id]),
    [['Erlenweg', '1', a], ['Erlenweg', '2', a], ['Birkenallee', '5', b], ['Lindenweg', '5', sweepId('kaminfeger@demo.invalid')]]);
  assert.deepEqual(all('SELECT sweep_id, street, work, closed_at FROM campaigns ORDER BY id').map(c => [c.sweep_id, c.street, c.work, !!c.closed_at]),
    [[a, 'Erlenweg', 'Kehren und Überprüfen', false], [a, 'Erlenweg', 'Kehren und Überprüfen', true]]);
  assert.deepEqual(all('SELECT sweep_id, date FROM route_days').map(r => [r.sweep_id, r.date]), [[a, '2026-11-25']]);
  assert.equal(get('SELECT COUNT(*) n FROM bookings').n, 1, 'Termin im Erlenweg bleibt');
  assert.equal(get('SELECT COUNT(*) n FROM chat_messages').n, 1);
  assert.equal(get('SELECT COUNT(*) n FROM documents').n, 1, 'Dokumente hängen weiter am Betrieb');
});

test('„Geprüft, wartet auf Link“ gibt es nicht mehr · Vorschau ist markiert · Entwurf bleibt Entwurf', () => {
  const st = Object.fromEntries(all('SELECT u.email, s.status, s.demo FROM sweeps s JOIN users u ON u.id = s.user_id').map(s => [s.email, [s.status, s.demo]]));
  assert.deepEqual(st, { 'a@test.de': ['active', 0], 'b@test.de': ['active', 0], 'kaminfeger@demo.invalid': ['active', 1], 'c@test.de': ['draft', 0] });
  assert.equal(get(`SELECT COUNT(*) n FROM tokens WHERE kind = 'activate'`).n, 0);
});

test('Bezirk ohne Kaminfeger: Haushalte, Runde, Termin und Chat entfernt, das Bewohner-Konto bleibt ohne Zuordnung', () => {
  assert.equal(get(`SELECT COUNT(*) n FROM households WHERE street = 'Geisterweg'`).n, 0);
  assert.equal(get(`SELECT COUNT(*) n FROM campaigns WHERE street = 'Geisterweg'`).n, 0);
  assert.equal(get(`SELECT COUNT(*) n FROM windows WHERE date = '2026-11-26'`).n, 0);
  assert.equal(get(`SELECT COUNT(*) n FROM chat_messages WHERE text = 'Verwaist'`).n, 0);
  assert.deepEqual(all(`SELECT hash FROM tokens ORDER BY hash`).map(t => t.hash), ['t-invite-1']);
  const r = get(`SELECT r.household_id, r.status FROM residents r JOIN users u ON u.id = r.user_id WHERE u.email = 'neun@test.de'`);
  assert.deepEqual([r.household_id, r.status], [null, 'unverified']);
  assert.equal(get(`SELECT r.status FROM residents r JOIN users u ON u.id = r.user_id WHERE u.email = 'eins@test.de'`).status, 'verified');
  assert.equal(get(`SELECT campaign_id FROM messages WHERE text = 'Verwaist'`).campaign_id, null);
});

test('Danach ist die Datenbank in sich stimmig und die App läuft damit', async () => {
  assert.deepEqual(all('PRAGMA foreign_key_check'), []);
  assert.equal(get('PRAGMA foreign_keys').foreign_keys, 1);
  const { wipeDemo, ensureDemo } = await import('../demo.js');
  wipeDemo(); // passiert beim ersten Start nach dem Umbau
  assert.equal(get(`SELECT COUNT(*) n FROM users WHERE email LIKE '%@demo.invalid'`).n, 0);
  assert.equal(get(`SELECT COUNT(*) n FROM households WHERE street = 'Lindenweg'`).n, 0);
  ensureDemo();
  assert.equal(get('SELECT COUNT(*) n FROM sweeps WHERE demo = 1').n, 1);
  const { build } = await import('../index.js');
  const app = await build({ logger: false });
  assert.equal((await app.inject({ method: 'GET', url: '/api/health' })).statusCode, 200);
  const found = await app.inject({ method: 'POST', url: '/api/customer/lookup', payload: { street: 'Erlenweg', nr: '1', plz: '90402' } });
  assert.deepEqual(found.json(), { known: true, householdFound: true });
  assert.deepEqual(all('PRAGMA foreign_key_check'), []);
});
