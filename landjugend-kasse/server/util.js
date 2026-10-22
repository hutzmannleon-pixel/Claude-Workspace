import crypto from 'node:crypto';
import { config } from './config.js';

export class HttpError extends Error {
  constructor(status, message, code) { super(message); this.statusCode = status; this.code = code; }
}
export const bad = (msg, code) => new HttpError(400, msg, code);
export const notFound = (msg = 'Nicht gefunden') => new HttpError(404, msg);
export const forbidden = (msg = 'Keine Berechtigung') => new HttpError(403, msg);

export const hmac = v => crypto.createHmac('sha256', config.secret).update(String(v)).digest('hex');
export const randomToken = (bytes = 24) => crypto.randomBytes(bytes).toString('base64url');
export const randomPin = () => String(crypto.randomInt(0, 10000)).padStart(4, '0');
export const safeEqual = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
export const isoIn = ms => new Date(Date.now() + ms).toISOString();
export const nowIso = () => new Date().toISOString();

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const normEmail = e => String(e || '').trim().toLowerCase();
export const clean = (v, max = 200) => String(v ?? '').trim().slice(0, max);

/** Betrag in Cent. Nimmt Zahlen (Euro) oder Text wie „1.234,56“, „-54,89“, „12.5“. */
export function cents(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) : NaN;
  let s = String(v ?? '').trim().replace(/\s|€/g, '');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  // „1.100“ ohne Komma = Tausenderpunkt (deutsche Schreibweise), nicht 1,1
  else if (/^[-+]?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  if (!/^[-+]?\d+(\.\d{1,2})?$/.test(s)) return NaN;
  return Math.round(Number(s) * 100);
}
export const euro = c => (c / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

export function date(v, label = 'Datum') {
  const s = clean(v, 10);
  if (!DATE_RE.test(s) || Number.isNaN(Date.parse(s))) throw bad(`Bitte ein gültiges ${label} angeben.`);
  return s;
}

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
