import { useEffect, useRef, useState, useCallback } from 'react';

// ---------- Inline-Styles aus den Designs 1:1 übernehmen ----------
// sx('padding:10px 22px 0;display:flex') → { padding: '10px 22px 0', display: 'flex' }
const cache = new Map();
export function sx(str) {
  let o = cache.get(str);
  if (o) return o;
  o = {};
  for (const decl of str.split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const k = decl.slice(0, i).trim(), v = decl.slice(i + 1).trim();
    if (!k) continue;
    o[k.startsWith('--') ? k : k.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
  }
  if (cache.size > 4000) cache.clear();
  cache.set(str, o);
  return o;
}

// ---------- API ----------
export class ApiError extends Error {}
export async function api(path, { method, body, form } = {}) {
  method = method || (body !== undefined || form ? 'POST' : 'GET');
  const opts = { method, headers: {}, credentials: 'same-origin' };
  if (form) opts.body = form;
  else if (method !== 'GET') { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body || {}); }
  let r;
  try { r = await fetch(path, opts); }
  catch { throw Object.assign(new ApiError('Keine Verbindung. Bitte später erneut versuchen.'), { status: 0 }); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new ApiError(j.error || 'Etwas ist schiefgelaufen.'), { status: r.status, code: j.code });
  return j;
}
export const upload = (path, file) => { const f = new FormData(); f.append('file', file); return api(path, { form: f }); };

// ---------- Live-Aktualisierung (Server-Sent Events) ----------
let version = 0; const subs = new Set(); let es = null;
function ensureStream() {
  if (es || typeof EventSource === 'undefined') return;
  es = new EventSource('/api/events');
  es.addEventListener('change', e => { const v = Number(e.data); if (v !== version) { version = v; subs.forEach(f => f(v)); } });
}
export function useLive() {
  const [v, setV] = useState(version);
  useEffect(() => { ensureStream(); subs.add(setV); return () => subs.delete(setV); }, []);
  return v;
}

/** Lädt Daten und lädt neu, sobald sich serverseitig etwas ändert. */
export function useData(path, { enabled = true } = {}) {
  const v = useLive();
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const seq = useRef(0);
  const load = useCallback(async () => {
    if (!enabled || !path) return;
    const id = ++seq.current;
    try { const data = await api(path); if (id === seq.current) setState({ data, error: null, loading: false }); }
    catch (error) { if (id === seq.current) setState(s => ({ data: s.data, error, loading: false })); }
  }, [path, enabled]);
  useEffect(() => { load(); }, [load, v]);
  return { ...state, reload: load };
}

/** Für Aktionen: busy-Status + Fehlermeldung. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = useCallback(async fn => {
    setBusy(true); setError(null);
    try { return await fn(); }
    catch (e) { setError(e.message); return undefined; }
    finally { setBusy(false); }
  }, []);
  return { busy, error, setError, run };
}

// ---------- Datum & Zeit ----------
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MON = ['Jan', 'Feb', 'März', 'Apr', 'Mai', 'Juni', 'Juli', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
export const LONG_DAY = { Mo: 'Montag', Di: 'Dienstag', Mi: 'Mittwoch', Do: 'Donnerstag', Fr: 'Freitag', Sa: 'Samstag', So: 'Sonntag' };
export const parseDate = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
export const isoDate = dt => dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
export const dayLabel = iso => { const d = parseDate(iso); return WD[d.getDay()] + ', ' + d.getDate() + '. ' + MON[d.getMonth()]; };
export const addDays = (iso, n) => { const d = parseDate(iso); d.setDate(d.getDate() + n); return isoDate(d); };
export const todayIso = () => isoDate(new Date());
export const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
export const fmt = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
export const endOf = (t, len) => fmt(toMin(t) + len);
export const slotsOf = (w, len) => { const out = []; if (!w.start || !w.end) return out; for (let m = toMin(w.start); m + len <= toMin(w.end); m += len) out.push(fmt(m)); return out; };
export const short = label => { const [d, rest] = label.split(', '); return { day: d, date: rest || '' }; };
export const longDay = label => (LONG_DAY[label.split(',')[0]] || label.split(',')[0]);
export function days(from, to) {
  const out = [];
  for (let d = parseDate(from); d <= parseDate(to); d.setDate(d.getDate() + 1)) if (d.getDay() !== 0) out.push({ iso: isoDate(d), wd: WD[d.getDay()], d: d.getDate(), m: MON[d.getMonth()] });
  return out;
}
/** Zeitstempel vom Server (ISO oder SQLite-UTC) → „Heute · 09:12“ */
export function fmtAt(ts) {
  if (!ts) return '';
  const d = new Date(/Z|[+-]\d\d:?\d\d$/.test(ts) ? ts : ts.replace(' ', 'T') + 'Z');
  const hm = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const t = todayIso(), dd = isoDate(d);
  if (dd === t) return 'Heute · ' + hm;
  if (dd === addDays(t, -1)) return 'Gestern · ' + hm;
  return dayLabel(dd) + ' · ' + hm;
}
export function since(ts) {
  if (!ts) return '';
  const d = new Date(/Z$/.test(ts) ? ts : ts.replace(' ', 'T') + 'Z');
  const h = Math.round((Date.now() - d.getTime()) / 3600000);
  if (h < 1) return 'gerade eben';
  if (h < 24) return `vor ${h} Std.`;
  const n = Math.round(h / 24);
  return n === 1 ? 'vor 1 Tag' : `vor ${n} Tagen`;
}
export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
export const greeting = () => { const h = new Date().getHours(); return h < 11 ? 'Guten Morgen' : h < 18 ? 'Guten Tag' : 'Guten Abend'; };
export const fileSize = n => n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';

/** Im Test-Rahmen (iframe) keine Safe-Area-Abstände – der Rahmen hat eigene Statusleiste. */
export const EMBED = typeof location !== 'undefined' && new URLSearchParams(location.search).has('embed');
