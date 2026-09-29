import crypto from 'node:crypto';
import { config } from './config.js';

export class HttpError extends Error {
  constructor(status, message, code) { super(message); this.statusCode = status; this.code = code; }
}
export const bad = (msg, code) => new HttpError(400, msg, code);
export const notFound = (msg = 'Nicht gefunden') => new HttpError(404, msg);
export const forbidden = (msg = 'Keine Berechtigung') => new HttpError(403, msg);

export const hmac = v => crypto.createHmac('sha256', config.secret).update(String(v)).digest('hex');
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const randomCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');
export const safeEqual = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

export const isoIn = ms => new Date(Date.now() + ms).toISOString();
export const nowIso = () => new Date().toISOString();

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const normEmail = e => String(e || '').trim().toLowerCase();
export const clean = (v, max = 200) => String(v ?? '').trim().slice(0, max);

export const streetKey = s => String(s || '').toLowerCase().trim()
  .replace(/ß/g, 'ss').replace(/strasse\b/g, 'str').replace(/str\./g, 'str')
  .replace(/[äöü]/g, c => ({ ä: 'ae', ö: 'oe', ü: 'ue' })[c])
  .replace(/[^a-z0-9]/g, '');
export const nrKey = s => String(s || '').toLowerCase().replace(/\s+/g, '');
export const nameKey = s => String(s || '').toLowerCase().replace(/ß/g, 'ss').replace(/[^a-zäöü]/g, '');

// --- Datum & Zeit (lokal, Europe/Berlin) ---
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MON = ['Jan', 'Feb', 'März', 'Apr', 'Mai', 'Juni', 'Juli', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
export const parseDate = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
export const isoDate = dt => dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
export const today = () => isoDate(new Date());
export const dayLabel = iso => { const d = parseDate(iso); return WD[d.getDay()] + ', ' + d.getDate() + '. ' + MON[d.getMonth()]; };
export const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
export const fmtMin = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
export const slotsOf = (w, len) => { const out = []; for (let m = toMin(w.start); m + len <= toMin(w.end); m += len) out.push(fmtMin(m)); return out; };
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// --- CSV (Trennzeichen ; oder , · Anführungszeichen · UTF-8 mit/ohne BOM) ---
export function parseCsv(text) {
  text = String(text).replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const delim = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(v => v.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some(v => v.trim() !== '')) rows.push(row);
  if (!rows.length) return [];
  const head = rows[0].map(h => h.trim().toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]/g, ''));
  return rows.slice(1).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
}
export const pick = (row, ...names) => { for (const n of names) if (row[n]) return row[n]; return ''; };

// --- Einfache Bremse gegen Missbrauch (pro Schlüssel, z. B. IP), im Speicher ---
const hits = new Map();
/** true, wenn der Schlüssel im Zeitfenster schon max-mal dran war; zählt sonst mit. */
export function limited(key, max, windowMs) {
  const now = Date.now(), h = hits.get(key);
  if (!h || h.reset < now) { hits.set(key, { n: 1, reset: now + windowMs }); return false; }
  if (h.n >= max) return true;
  h.n++;
  return false;
}
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (v.reset < now) hits.delete(k); }, 60000).unref();
