// Feedback aus den drei Apps: Screenshot der aktuellen Ansicht, markierter Bereich und Text.
// Landet im Betreiber-Bereich. Bilder liegen als BLOB in der Datenbank und verschwinden mit dem Konto (ON DELETE CASCADE).
import { config } from '../config.js';
import { get, all, run } from '../db.js';
import { live } from '../live.js';
import { requireUser } from '../auth.js';
import { adminLog } from '../domain.js';
import { bad, forbidden, notFound, clean } from '../util.js';

const ROLES = ['customer', 'sweep', 'admin'];
const MAX_IMAGE = 3 * 1024 * 1024;
const PER_DAY = 30;

function admin(req) {
  const u = requireUser(req, 'admin');
  if (!config.adminEmails.includes(u.email)) throw forbidden();
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
    if (!ROLES.includes(b.role)) throw bad('Unbekannter Bereich.');
    const u = requireUser(req, b.role);
    const note = clean(b.note, 2000);
    if (note.length < 3) throw bad('Bitte beschreiben Sie kurz, was Ihnen aufgefallen ist.');
    const n = get(`SELECT COUNT(*) n FROM feedback WHERE user_id = ? AND created_at > datetime('now','-1 day')`, u.id).n;
    if (n >= PER_DAY) throw bad('Heute sind schon viele Rückmeldungen eingegangen – vielen Dank! Bitte morgen weiter.');
    const image = parseImage(b.image), mark = parseMark(b.mark);
    run('INSERT INTO feedback (user_id, role, page, note, mark, image, device) VALUES (?,?,?,?,?,?,?)',
      u.id, b.role, clean(b.page, 120), note, mark ? JSON.stringify(mark) : null, image, clean(b.device, 200));
    live.bump();
    return { ok: true };
  });

  app.get('/api/admin/feedback', async req => {
    admin(req);
    const rows = all(`SELECT f.id, f.role, f.page, f.note, f.mark, f.device, f.status, f.created_at, u.email, f.image IS NOT NULL hasImage
      FROM feedback f JOIN users u ON u.id = f.user_id ORDER BY f.status = 'done', f.id DESC LIMIT 300`);
    return { items: rows.map(r => ({ ...r, mark: r.mark ? JSON.parse(r.mark) : null, hasImage: !!r.hasImage, at: r.created_at.replace(' ', 'T') + 'Z' })) };
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
