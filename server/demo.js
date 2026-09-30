// Vorschau für den Betreiber: ein abgeschotteter Demo-Bezirk mit Beispieldaten.
// Erkennbar an districts.demo = 1 und an E-Mail-Adressen auf @demo.invalid (dorthin wird nie gemailt).
// Der Bezirk taucht nirgends für echte Nutzer auf (Verzeichnis, Adresssuche, Prüfliste).
import { get, all, run, tx } from './db.js';
import { streetKey, nowIso, today, isoDate, parseDate, slotsOf } from './util.js';

export const DEMO_DOMAIN = '@demo.invalid';
export const DEMO_SWEEP = 'kaminfeger' + DEMO_DOMAIN;
export const DEMO_RESIDENT = 'bewohner' + DEMO_DOMAIN;
export const isDemoEmail = e => String(e || '').endsWith(DEMO_DOMAIN);

const plusDays = n => { const d = parseDate(today()); d.setDate(d.getDate() + n); return isoDate(d); };
const workday = n => { let d = plusDays(n), i = n; while (parseDate(d).getDay() === 0) d = plusDays(++i); return d; };

const STREETS = [
  { street: 'Lindenweg', owners: ['Fam. Albrecht', 'Fam. Brenner', 'Fam. Demir', 'Fam. Engel', 'Fam. Fuchs', 'Fam. Graf', 'Fam. Hahn', 'Fam. Jung', 'Fam. Lang', 'Fam. Maier'] },
  { street: 'Ahornstraße', owners: ['Fam. Neumann', 'Fam. Otto', 'Fam. Peters', 'Fam. Roth', 'Fam. Sommer', 'Fam. Vogel'] },
  { street: 'Am Mühlbach', owners: ['Fam. Wagner', 'Fam. Winter', 'Fam. Ziegler', 'Fam. Busch'] }
];

export const demoDistrict = () => get('SELECT * FROM districts WHERE demo = 1 LIMIT 1');

/** Löscht den Demo-Bezirk samt allem, was daran hängt. */
export function wipeDemo() {
  const d = demoDistrict();
  const users = all(`SELECT id FROM users WHERE email LIKE ?`, '%' + DEMO_DOMAIN).map(u => u.id);
  tx(() => {
    if (d) {
      const camps = all('SELECT id FROM campaigns WHERE district_id = ?', d.id).map(c => c.id);
      const hs = all('SELECT id FROM households WHERE district_id = ?', d.id).map(h => h.id);
      const ids = a => a.length ? a.join(',') : '-1';
      run(`DELETE FROM message_recipients WHERE household_id IN (${ids(hs)})`);
      run(`DELETE FROM messages WHERE campaign_id IN (${ids(camps)}) OR sweep_id IN (SELECT id FROM sweeps WHERE district_id = ?)`, d.id);
      run(`DELETE FROM bookings WHERE household_id IN (${ids(hs)})`);
      run(`DELETE FROM campaigns WHERE district_id = ?`, d.id);
      run(`DELETE FROM route_days WHERE district_id = ?`, d.id);
      run(`DELETE FROM tokens WHERE kind IN ('invite','member') AND ref_id IN (${ids(hs)})`);
    }
    if (users.length) run(`DELETE FROM users WHERE id IN (${users.join(',')})`);
    if (d) {
      run('UPDATE residents SET household_id = NULL WHERE household_id IN (SELECT id FROM households WHERE district_id = ?)', d.id);
      run('DELETE FROM households WHERE district_id = ?', d.id);
      run('UPDATE sweeps SET district_id = NULL WHERE district_id = ?', d.id);
      run('DELETE FROM districts WHERE id = ?', d.id);
    }
  });
}

/**
 * Legt den Demo-Bezirk neu an: Kaminfeger „Max Muster“, drei Straßen, eine laufende Runde
 * (heute und in einer Woche), ein Bewohner mit Termin heute – so ist auch die Live-Anzeige zu sehen.
 */
export function seedDemo() {
  wipeDemo();
  return tx(() => {
    const did = Number(run(`INSERT INTO districts (land, kreis, number, holder_name, official_email, business_address, demo) VALUES ('Vorschau', 'Musterstadt', '1', 'Max Muster', ?, 'Kaminweg 1, 00000 Musterstadt', 1)`, DEMO_SWEEP).lastInsertRowid);
    const suid = Number(run(`INSERT INTO users (email, role) VALUES (?, 'sweep')`, DEMO_SWEEP).lastInsertRowid);
    const sid = Number(run(`INSERT INTO sweeps (user_id, first, last, phone, bstreet, bplz, bort, district_id, status, submitted_at, decided_at) VALUES (?, 'Max', 'Muster', '0000 123456', 'Kaminweg 1', '00000', 'Musterstadt', ?, 'active', ?, ?)`, suid, did, nowIso(), nowIso()).lastInsertRowid);
    const hh = {};
    for (const s of STREETS) {
      hh[s.street] = s.owners.map((o, i) => Number(run(`INSERT INTO households (district_id, street, street_key, nr, plz, ort, owner_name, customer_no, phone) VALUES (?,?,?,?,?,?,?,?,?)`,
        did, s.street, streetKey(s.street), String(i + 1), '00000', 'Musterstadt', o, `DEMO-${s.street.slice(0, 2).toUpperCase()}${i + 1}`, `0000 ${String(100000 + i * 7919).slice(0, 6)}`).lastInsertRowid));
    }
    // Laufende Runde im Lindenweg: heute 8–12 Uhr, in einer Woche 13–16 Uhr
    const d1 = today(), d2 = workday(7);
    const cid = Number(run(`INSERT INTO campaigns (district_id, street, street_key, plz, slot_len, deadline, sent_at) VALUES (?, 'Lindenweg', ?, '00000', 30, ?, ?)`, did, streetKey('Lindenweg'), plusDays(-1), nowIso()).lastInsertRowid);
    const w1 = Number(run(`INSERT INTO windows (campaign_id, date, start, end) VALUES (?,?,?,?)`, cid, d1, '08:00', '12:00').lastInsertRowid);
    const w2 = Number(run(`INSERT INTO windows (campaign_id, date, start, end) VALUES (?,?,?,?)`, cid, d2, '13:00', '16:00').lastInsertRowid);
    const s1 = slotsOf({ start: '08:00', end: '12:00' }, 30), s2 = slotsOf({ start: '13:00', end: '16:00' }, 30);
    const L = hh.Lindenweg;
    const book = (h, w, t, src = 'app') => run(`INSERT INTO bookings (campaign_id, household_id, window_id, time, source) VALUES (?,?,?,?,?)`, cid, h, w, t, src);
    book(L[0], w1, s1[0]); book(L[1], w1, s1[1], 'phone'); book(L[2], w1, s1[2]); book(L[3], w1, s1[4]); book(L[4], w1, s1[5]);
    book(L[5], w2, s2[0]); book(L[6], w2, s2[2], 'phone');
    run(`INSERT INTO bookings (campaign_id, household_id, window_id, time, source, status, updated_at) VALUES (?,?,?,?, 'app', 'cancelled', ?)`, cid, L[7], w2, s2[3], nowIso());
    // Bewohner-Konto: Familie Engel, Lindenweg 5, Termin heute
    const ruid = Number(run(`INSERT INTO users (email, role) VALUES (?, 'customer')`, DEMO_RESIDENT).lastInsertRowid);
    run(`INSERT INTO residents (user_id, household_id, family_name, person_name, street, nr, plz, ort, status, method, verified_at, ch_mail, rem_eve, rem_hour)
      VALUES (?, ?, 'Engel', 'Familie Engel', 'Lindenweg', '5', '00000', 'Musterstadt', 'verified', 'invite', ?, 1, 1, 1)`, ruid, L[4], nowIso());
    // Nachricht an die Straße
    const mid = Number(run(`INSERT INTO messages (sweep_id, campaign_id, text) VALUES (?,?,?)`, sid, cid,
      'Guten Tag! Ich komme zur Feuerstättenschau in den Lindenweg. Bitte wählen Sie in der App eine Zeit, in der jemand zu Hause ist.').lastInsertRowid);
    for (const h of L) run('INSERT INTO message_recipients (message_id, household_id) VALUES (?,?)', mid, h);
    return { districtId: did, sweepUserId: suid, residentUserId: ruid };
  });
}

/** Demo vorhanden und aktuell (heutiges Fenster)? Sonst neu anlegen. */
export function ensureDemo(reset = false) {
  const d = demoDistrict();
  const fresh = d && get(`SELECT 1 x FROM windows w JOIN campaigns c ON c.id = w.campaign_id WHERE c.district_id = ? AND w.date >= ?`, d.id, today());
  const users = get(`SELECT (SELECT id FROM users WHERE email = ? AND role = 'sweep') s, (SELECT id FROM users WHERE email = ? AND role = 'customer') c`, DEMO_SWEEP, DEMO_RESIDENT);
  if (reset || !fresh || !users.s || !users.c) { const r = seedDemo(); return { sweepUserId: r.sweepUserId, residentUserId: r.residentUserId }; }
  return { sweepUserId: users.s, residentUserId: users.c };
}
