import { get, all, run } from './db.js';
import { config } from './config.js';
import { hmac, randomToken, isoIn, nowIso, dayLabel, slotsOf, toMin, fmtMin, today, bad } from './util.js';

// ---------- Einmal-Links (Freischaltung, Einladung, Eigentümer-Bestätigung) ----------
export function makeLink(kind, refId, data, ttlMs, path) {
  const t = randomToken(24);
  run('INSERT INTO tokens (hash, kind, ref_id, data, expires_at) VALUES (?,?,?,?,?)', hmac(t), kind, refId, data ? JSON.stringify(data) : null, isoIn(ttlMs));
  return { token: t, url: `${config.baseUrl}${path}${t}` };
}
export function readLink(kind, raw) {
  const r = get('SELECT * FROM tokens WHERE hash = ? AND kind = ?', hmac(raw || ''), kind);
  if (!r || r.used_at || r.expires_at < nowIso()) return null;
  return { ...r, data: r.data ? JSON.parse(r.data) : null };
}
export const useLink = raw => run('UPDATE tokens SET used_at = ? WHERE hash = ?', nowIso(), hmac(raw));
export const revokeLinks = (kind, refId) => run('UPDATE tokens SET used_at = ? WHERE kind = ? AND ref_id = ? AND used_at IS NULL', nowIso(), kind, refId);

// ---------- Kaminfeger ----------
export function sweepByUser(userId) {
  return get(`SELECT s.*, u.email, d.land, d.kreis, d.number AS bez, d.holder_name, d.official_email, d.business_address, d.appointed_until
    FROM sweeps s JOIN users u ON u.id = s.user_id LEFT JOIN districts d ON d.id = s.district_id WHERE s.user_id = ?`, userId);
}
export const activeSweepForDistrict = districtId =>
  get(`SELECT s.*, u.email FROM sweeps s JOIN users u ON u.id = s.user_id WHERE s.district_id = ? AND s.status = 'active'`, districtId);
export const sweepName = s => s ? `${s.first} ${s.last}` : '';
export const initials = name => String(name || '').split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();

// ---------- Haushalte & Namen ----------
export function householdName(h) {
  const r = get(`SELECT family_name FROM residents WHERE household_id = ? AND status = 'verified' AND is_member = 0 ORDER BY id DESC LIMIT 1`, h.id);
  return r ? r.family_name : h.owner_name.replace(/^(fam\.?|familie)\s+/i, '');
}
export const streetHouseholds = c => all(`SELECT * FROM households WHERE district_id = ? AND street_key = ? AND plz = ?`, c.district_id, c.street_key, c.plz)
  .sort((a, b) => parseInt(a.nr) - parseInt(b.nr) || a.nr.localeCompare(b.nr));

// ---------- Kampagnen (Zeitfenster pro Straße) ----------
export function windowsOf(campaignId) {
  return all('SELECT * FROM windows WHERE campaign_id = ? ORDER BY date, start', campaignId)
    .map(w => ({ id: w.id, date: w.date, label: dayLabel(w.date), start: w.start, end: w.end }));
}
export const activeBookings = campaignId => all(`SELECT * FROM bookings WHERE campaign_id = ? AND status = 'booked'`, campaignId);

export function houseRows(c) {
  const hs = streetHouseholds(c);
  const books = activeBookings(c.id);
  const cancelled = new Set(all(`SELECT household_id FROM bookings WHERE campaign_id = ? AND status = 'cancelled'`, c.id).map(r => r.household_id));
  return hs.map(h => {
    const b = books.find(x => x.household_id === h.id);
    const status = b ? 'booked' : cancelled.has(h.id) ? 'cancelled' : 'open';
    return { id: h.id, nr: h.nr, name: householdName(h), phone: h.phone || '', moved: !!h.moved_at, status,
      booking: b ? { id: b.id, windowId: b.window_id, t: b.time, key: b.key_note, src: b.source, visit: b.visit } : null };
  });
}

/** Laufende (nicht abgeschlossene) Runden eines Bezirks */
export function campaignsOfDistrict(districtId) {
  return all('SELECT * FROM campaigns WHERE district_id = ? AND closed_at IS NULL ORDER BY id DESC', districtId);
}
export const closedCampaigns = districtId => all('SELECT * FROM campaigns WHERE district_id = ? AND closed_at IS NOT NULL ORDER BY closed_at DESC, id DESC', districtId);
/** Alle Häuser erledigt (oder ausgezogen)? Dann darf die Straße abgeschlossen werden. */
export const campaignDone = rows => rows.length > 0 && rows.every(r => r.moved || (r.booking && r.booking.visit === 'done'));

/** Für einen Haushalt: die laufende Kampagne seiner Straße (abgeschlossene zählen nicht mehr). */
export function campaignForHousehold(h) {
  return get(`SELECT * FROM campaigns WHERE district_id = ? AND street_key = ? AND plz = ? AND sent_at IS NOT NULL AND closed_at IS NULL ORDER BY id DESC LIMIT 1`, h.district_id, h.street_key, h.plz);
}

export function freeCount(campaign, w, exceptHouseholdId) {
  const taken = all(`SELECT time, household_id FROM bookings WHERE window_id = ? AND status = 'booked'`, w.id).filter(b => b.household_id !== exceptHouseholdId);
  return slotsOf(w, campaign.slot_len).filter(t => !taken.some(b => b.time === t)).length;
}

export function validateWindows(windows, slotLen) {
  if (!Array.isArray(windows) || windows.length < 1 || windows.length > 3) throw bad('Bitte 1 bis 3 Zeitfenster angeben.');
  if (![20, 30, 45].includes(Number(slotLen))) throw bad('Ungültige Dauer pro Haushalt.');
  const dates = new Set();
  for (const w of windows) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(w.date || '')) throw bad('Ungültiges Datum.');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(w.start || '') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(w.end || '')) throw bad('Ungültige Uhrzeit.');
    if (toMin(w.end) - toMin(w.start) < Number(slotLen)) throw bad(`Das Fenster am ${dayLabel(w.date)} ist kürzer als ein Slot.`);
    if (dates.has(w.date)) throw bad('Jeder Tag darf nur einmal vorkommen.');
    dates.add(w.date);
  }
}

// ---------- Tagesroute ----------
export function routeFor(districtId, date) {
  const rows = all(`SELECT b.*, h.nr, h.id AS hid, h.owner_name, w.date, c.slot_len
    FROM bookings b JOIN windows w ON w.id = b.window_id JOIN campaigns c ON c.id = b.campaign_id JOIN households h ON h.id = b.household_id
    WHERE c.district_id = ? AND w.date = ? AND b.status = 'booked'`, districtId, date);
  rows.sort((a, b) => toMin(a.time) - toMin(b.time) || parseInt(a.nr) - parseInt(b.nr));
  return rows.map(r => ({ id: r.id, householdId: r.hid, campaignId: r.campaign_id, nr: r.nr, street: get('SELECT street FROM campaigns WHERE id = ?', r.campaign_id).street,
    name: householdName({ id: r.hid, owner_name: r.owner_name }), t: r.time, end: fmtMin(toMin(r.time) + r.slot_len), key: r.key_note, visit: r.visit, src: r.source }));
}
export const routeStarted = (districtId, date) => !!get('SELECT 1 x FROM route_days WHERE district_id = ? AND date = ?', districtId, date);

export function routeDates(districtId) {
  return all(`SELECT DISTINCT w.date FROM bookings b JOIN windows w ON w.id = b.window_id JOIN campaigns c ON c.id = b.campaign_id
    WHERE c.district_id = ? AND b.status = 'booked' ORDER BY w.date`, districtId).map(r => r.date);
}
/** Heute, falls Termine – sonst der nächste Tag mit Terminen (oder der letzte). */
export function defaultRouteDate(districtId) {
  const ds = routeDates(districtId), t = today();
  return ds.find(d => d >= t) || ds[ds.length - 1] || t;
}

// ---------- Nachrichten ----------
export function postMessage(sweepId, campaignId, text, householdIds) {
  const r = run('INSERT INTO messages (sweep_id, campaign_id, text) VALUES (?,?,?)', sweepId, campaignId, text);
  const id = Number(r.lastInsertRowid);
  for (const h of new Set(householdIds)) run('INSERT OR IGNORE INTO message_recipients (message_id, household_id) VALUES (?,?)', id, h);
  return id;
}
/** E-Mail-Empfänger eines Haushalts: verifizierte Bewohner + Mitbewohner mit E-Mail-Kanal. */
export function householdEmails(householdId, { onlyMail = true } = {}) {
  return all(`SELECT u.email, r.ch_mail FROM residents r JOIN users u ON u.id = r.user_id WHERE r.household_id = ? AND r.status = 'verified'`, householdId)
    .filter(r => !onlyMail || r.ch_mail).map(r => r.email);
}

export function adminLog(email, what, note) {
  run('INSERT INTO admin_log (admin_email, what, note) VALUES (?,?,?)', email, what, note || '');
}
