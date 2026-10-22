// Belege per Handy hochladen: persönlicher Link (je Nutzer) und Team-Link, beide mit PIN
import QRCode from 'qrcode';
import { config } from '../config.js';
import { get, run, setting } from '../db.js';
import { requireUser } from '../auth.js';
import { bad, notFound, clean, cents, randomToken, randomPin, safeEqual, limited } from '../util.js';
import { saveUpload } from '../kasse.js';

function linkFor(kind, userId) {
  let l = kind === 'personal'
    ? get(`SELECT * FROM upload_links WHERE kind = 'personal' AND user_id = ?`, userId)
    : get(`SELECT * FROM upload_links WHERE kind = 'team'`);
  if (!l) {
    // Der Team-Link ist anfangs aus – erst einschalten, wenn er weitergegeben werden soll
    run('INSERT INTO upload_links (kind, user_id, token, pin, active) VALUES (?,?,?,?,?)', kind, kind === 'personal' ? userId : null, randomToken(), randomPin(), kind === 'personal');
    l = linkFor(kind, userId);
  }
  return l;
}
async function present(l) {
  const url = `${config.baseUrl}/hochladen/${l.token}`;
  return { url, pin: l.pin, active: !!l.active, qr: await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }) };
}
const KIND = k => { if (!['personal', 'team'].includes(k)) throw notFound(); return k; };

export default async function uploadRoutes(app) {
  app.get('/api/kasse/upload-links', async req => {
    const me = requireUser(req);
    return { personal: await present(linkFor('personal', me.id)), team: await present(linkFor('team')) };
  });
  app.post('/api/kasse/upload-links/:kind/pin', async req => {
    const me = requireUser(req);
    run('UPDATE upload_links SET pin = ? WHERE id = ?', randomPin(), linkFor(KIND(req.params.kind), me.id).id);
    return { ok: true };
  });
  // Neuer Link: der alte QR-Code funktioniert danach nicht mehr
  app.post('/api/kasse/upload-links/:kind/renew', async req => {
    const me = requireUser(req);
    run('UPDATE upload_links SET token = ?, pin = ? WHERE id = ?', randomToken(), randomPin(), linkFor(KIND(req.params.kind), me.id).id);
    return { ok: true };
  });
  app.put('/api/kasse/upload-links/team', async req => {
    requireUser(req);
    run('UPDATE upload_links SET active = ? WHERE id = ?', !!req.body?.active, linkFor('team').id);
    return { ok: true };
  });

  // ---------- Öffentlich (ohne Anmeldung, nur mit Link + PIN) ----------
  const open = token => {
    const l = get('SELECT l.*, u.name owner FROM upload_links l LEFT JOIN users u ON u.id = l.user_id WHERE l.token = ? AND l.active = 1', clean(token, 64));
    if (!l) throw notFound('Dieser Link ist nicht (mehr) gültig. Bitte frag in der Kasse nach einem neuen.');
    return l;
  };
  app.get('/api/hochladen/:token', async req => {
    const l = open(req.params.token);
    return { club: setting('club') || '', kind: l.kind, owner: l.owner };
  });

  app.post('/api/hochladen/:token', async req => {
    const l = open(req.params.token);
    if (limited(`pin:${l.id}:${req.ip}`, 30, 15 * 60000)) throw bad('Zu viele Versuche. Bitte in 15 Minuten erneut versuchen.');
    if (!req.isMultipart()) throw bad('Bitte eine Datei auswählen.');
    const part = await req.file();
    if (!part) throw bad('Bitte eine Datei auswählen.');
    const field = n => clean(part.fields[n]?.value, 200);
    if (!safeEqual(field('pin'), l.pin)) { part.file.resume(); throw bad('Die PIN ist falsch.', 'pin'); }
    let name = null, description = '', amount = null, advance = null;
    if (l.kind === 'team') {
      name = clean(field('name'), 80);
      if (!name) { part.file.resume(); throw bad('Bitte deinen Namen angeben.'); }
      description = field('description');
      const a = cents(field('amount'));
      amount = Number.isFinite(a) && a > 0 ? a : null;
      advance = field('advance') === '1' ? name : null;
    }
    const f = await saveUpload(part);
    run('INSERT INTO receipts (description, amount_cents, advance_name, file, file_name, mime, size, uploaded_by, uploaded_name) VALUES (?,?,?,?,?,?,?,?,?)',
      description, amount, advance, f.file, f.file_name, f.mime, f.size, l.kind === 'personal' ? l.user_id : null, name);
    return { ok: true };
  });
}
