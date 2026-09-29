// Feedback aus den drei Apps: Screenshot der aktuellen Ansicht, markierter Bereich und Text.
// Landet im Betreiber-Bereich. Bilder liegen als BLOB in der Datenbank und verschwinden mit dem Konto (ON DELETE CASCADE).
import { config } from '../config.js';
import { get, all, run } from '../db.js';
import { live } from '../live.js';
import { currentUser, requireUser } from '../auth.js';
import { adminLog } from '../domain.js';
import { bad, forbidden, notFound, clean, hmac, normEmail, EMAIL_RE } from '../util.js';

const ROLES = ['customer', 'sweep', 'admin'];
const MAX_IMAGE = 3 * 1024 * 1024;
const PER_DAY = 30;
const ANON_PER_HOUR = 10;

function admin(req) {
  const u = requireUser(req, 'admin');
  if (!config.adminEmails.includes(u.email)) throw forbidden();
  if (config.adminPasskeyRequired && !get('SELECT 1 x FROM passkeys WHERE user_id = ?', u.id)) throw forbidden('Bitte zuerst einen Passkey einrichten.');
  return u;
}

function parseMark(m) {
  if (!m || typeof m !== 'object') return null;
  const n = ['x', 'y', 'w', 'h'].map(k => Number(m[k]));
  if (n.some(v => !Number.isFinite(v) || v < 0 || v > 1)) return null;
  return { x: n[0], y: n[1], w: n[2], h: n[3] };
}

function parseImage(dataUrl) {
  if (!dataUrl) return null;
  const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl));
  if (!m) throw bad('Das Bild konnte nicht gelesen werden.');
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length > MAX_IMAGE) throw bad('Das Bild ist zu groß.');
  if (buf[0] !== 0xff || buf[1] !== 0xd8) throw bad('Das Bild konnte nicht gelesen werden.');
  return buf;
}

export default async function feedbackRoutes(app) {
  app.post('/api/feedback', { bodyLimit: 5 * 1024 * 1024 }, async req => {
    const b = req.body || {};
    // Angemeldet → dem Konto zugeordnet; sonst (Startseite, Registrierung, Anmeldung) anonym mit optionaler E-Mail
    const u = ROLES.includes(b.role) ? currentUser(req, b.role) : null;
    const note = clean(b.note, 2000);
    if (note.length < 3) throw bad('Bitte beschreiben Sie kurz, was Ihnen aufgefallen ist.');
    const ipHash = hmac('fb:' + req.ip);
    const n = u ? get(`SELECT COUNT(*) n FROM feedback WHERE user_id = ? AND created_at > datetime('now','-1 day')`, u.id).n
      : get(`SELECT COUNT(*) n FROM feedback WHERE user_id IS NULL AND ip_hash = ? AND created_at > datetime('now','-1 hour')`, ipHash).n;
    if (n >= (u ? PER_DAY : ANON_PER_HOUR)) throw bad('Es sind gerade schon viele Rückmeldungen eingegangen – vielen Dank! Bitte später weiter.');
    let contact = null;
    if (!u && b.contact) { contact = normEmail(b.contact); if (!EMAIL_RE.test(contact) || contact.length > 200) throw bad('Bitte eine gültige E-Mail-Adresse angeben oder das Feld leer lassen.'); }
    const image = parseImage(b.image), mark = parseMark(b.mark);
    run('INSERT INTO feedback (user_id, role, contact, ip_hash, page, note, mark, image, device) VALUES (?,?,?,?,?,?,?,?,?)',
      u ? u.id : null, u ? b.role : 'public', contact, u ? null : ipHash, clean(b.page, 120), note, mark ? JSON.stringify(mark) : null, image, clean(b.device, 200));
    live.bump();
    return { ok: true };
  });

  app.get('/api/admin/feedback', async req => {
    admin(req);
    const rows = all(`SELECT f.id, f.role, f.page, f.note, f.mark, f.device, f.status, f.created_at, COALESCE(u.email, f.contact) email, f.image IS NOT NULL hasImage
      FROM feedback f LEFT JOIN users u ON u.id = f.user_id ORDER BY f.status = 'done', f.id DESC LIMIT 300`);
    return { items: rows.map(r => ({ ...r, email: r.email || 'ohne Anmeldung', mark: r.mark ? JSON.parse(r.mark) : null, hasImage: !!r.hasImage, at: r.created_at.replace(' ', 'T') + 'Z' })) };
  });

  app.get('/api/admin/feedback/:id/image', async (req, reply) => {
    admin(req);
    const f = get('SELECT image FROM feedback WHERE id = ?', Number(req.params.id));
    if (!f?.image) throw notFound();
    reply.header('Cache-Control', 'no-store').type('image/jpeg');
    return Buffer.from(f.image);
  });

  app.post('/api/admin/feedback/:id', async req => {
    const a = admin(req), id = Number(req.params.id);
    const f = get('SELECT id FROM feedback WHERE id = ?', id);
    if (!f) throw notFound();
    if (req.body?.action === 'delete') { run('DELETE FROM feedback WHERE id = ?', id); adminLog(a.email, `Feedback #${id} gelöscht`); }
    else run('UPDATE feedback SET status = ? WHERE id = ?', req.body?.action === 'reopen' ? 'open' : 'done', id);
    live.bump();
    return { ok: true };
  });
}
