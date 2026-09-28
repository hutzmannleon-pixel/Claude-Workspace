import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { get, all, run, tx } from '../db.js';
import { live } from '../live.js';
import { requestCode, checkCode, startSession, endSession, currentUser, COOKIE } from '../auth.js';
import { readLink, useLink, activeSweepForDistrict, adminLog } from '../domain.js';
import { queueMail } from '../mail.js';
import { bad, notFound, nowIso, normEmail } from '../util.js';

export default async function publicRoutes(app) {
  app.get('/api/health', async () => ({ ok: true }));
  app.get('/api/config', async () => ({ testMode: config.testMode }));

  // Android-App (Trusted Web Activity): Verknüpfung App ↔ Domain. Datei liegt in DATA_DIR/assetlinks.json
  app.get('/.well-known/assetlinks.json', async (req, reply) => {
    const file = path.join(config.dataDir, 'assetlinks.json');
    if (!fs.existsSync(file)) throw notFound();
    reply.header('Content-Type', 'application/json').header('Cache-Control', 'public, max-age=3600');
    return fs.readFileSync(file, 'utf8');
  });

  // Live-Kanal: nur Versionsnummern, keine Daten
  app.get('/api/events', (req, reply) => { reply.hijack(); live.attach(reply.raw); });

  // ---------- Login per E-Mail-Code ----------
  app.post('/api/auth/code', async req => {
    const { email, role, purpose } = req.body || {};
    await requestCode(email, role, purpose || 'login');
    return { ok: true };
  });

  app.post('/api/auth/login', async (req, reply) => {
    const { email, role, code } = req.body || {};
    if (!COOKIE[role]) throw bad('Unbekannte Rolle.');
    const e = checkCode(email, role, 'login', code);
    let user = get('SELECT * FROM users WHERE email = ? AND role = ?', e, role);
    if (!user && role === 'admin' && config.adminEmails.includes(e)) {
      run('INSERT INTO users (email, role) VALUES (?,?)', e, 'admin');
      user = get('SELECT * FROM users WHERE email = ? AND role = ?', e, role);
    }
    if (!user) throw bad('Zu dieser E-Mail gibt es kein Konto.');
    startSession(reply, user.id, role);
    return { ok: true };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    endSession(req, reply, (req.body || {}).role);
    return { ok: true };
  });

  app.get('/api/auth/me', async req => {
    const u = currentUser(req, req.query.role);
    return { user: u ? { email: u.email, role: u.role } : null };
  });

  // ---------- Bezirksverzeichnis (Auswahllisten) ----------
  app.get('/api/directory/options', async () => {
    const rows = all('SELECT DISTINCT land, kreis FROM districts ORDER BY land, kreis');
    const lands = [...new Set(rows.map(r => r.land))];
    return { lands, kreise: Object.fromEntries(lands.map(l => [l, rows.filter(r => r.land === l).map(r => r.kreis)])) };
  });

  // ---------- Eigentümer bestätigt Mieter per E-Mail-Link ----------
  const ownerCtx = token => {
    const l = readLink('owner', token);
    if (!l) throw notFound('Der Link ist ungültig oder abgelaufen.');
    const r = get(`SELECT r.*, h.owner_name, h.nr hnr, h.street hstreet FROM residents r JOIN households h ON h.id = r.household_id WHERE r.id = ?`, l.ref_id);
    if (!r || r.status !== 'owner') throw notFound('Diese Anfrage ist bereits erledigt.');
    return { l, r };
  };
  app.get('/api/owner/:token', async req => {
    const { r } = ownerCtx(req.params.token);
    return { resident: r.family_name, address: `${r.hstreet} ${r.hnr}`, owner: r.owner_name };
  });
  app.post('/api/owner/:token', async req => {
    const { l, r } = ownerCtx(req.params.token);
    const yes = (req.body || {}).answer === 'yes';
    tx(() => {
      useLink(req.params.token);
      run(`UPDATE residents SET status = ?, verified_at = ? WHERE id = ?`, yes ? 'verified' : 'rejected', yes ? nowIso() : null, r.id);
      if (yes) run('UPDATE households SET moved_at = NULL WHERE id = ?', r.household_id);
      adminLog('Eigentümer', `${r.family_name} · ${r.hstreet} ${r.hnr} ${yes ? 'freigegeben' : 'abgelehnt'}`, yes ? 'Bestätigt durch den Eigentümer per E-Mail' : 'Eigentümer hat nicht bestätigt');
    });
    const u = get('SELECT email FROM users WHERE id = ?', r.user_id);
    queueMail(yes
      ? { to: u.email, subject: 'Ihre Adresse ist bestätigt', text: `Der Eigentümer hat bestätigt, dass Sie in der ${r.hstreet} ${r.hnr} wohnen. Sie können jetzt Termine buchen.`, link: `${config.baseUrl}/kunde`, linkLabel: 'App öffnen' }
      : { to: u.email, subject: 'Adresse nicht bestätigt', text: `Der Eigentümer konnte nicht bestätigen, dass Sie in der ${r.hstreet} ${r.hnr} wohnen. Bitte wenden Sie sich an Ihren Kaminfeger.` });
    live.bump();
    return { ok: true };
  });

  // ---------- Kaminfeger: Freischaltlink aus der E-Mail ----------
  app.get('/aktivieren/:token', async (req, reply) => {
    const l = readLink('activate', req.params.token);
    const s = l && get('SELECT * FROM sweeps WHERE id = ?', l.ref_id);
    if (!l || !s || s.status !== 'approved') return reply.redirect('/kaminfeger?link=ungueltig');
    const other = activeSweepForDistrict(s.district_id);
    if (other && other.id !== s.id) return reply.redirect('/kaminfeger?link=ungueltig');
    tx(() => {
      useLink(req.params.token);
      run(`UPDATE sweeps SET status = 'active' WHERE id = ?`, s.id);
    });
    live.bump();
    return reply.redirect('/kaminfeger?aktiviert=1');
  });

  // ---------- Test-Postfach (nur im Testmodus) ----------
  if (config.testMode) {
    app.get('/api/test/outbox', async req => {
      const to = req.query.to ? normEmail(req.query.to) : null;
      const rows = to ? all('SELECT * FROM outbox WHERE to_addr = ? ORDER BY id DESC LIMIT 50', to) : all('SELECT * FROM outbox ORDER BY id DESC LIMIT 80');
      return { mails: rows };
    });
  }
}
