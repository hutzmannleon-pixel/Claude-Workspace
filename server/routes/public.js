import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { get, all, run, tx } from '../db.js';
import { live } from '../live.js';
import { requestCode, checkCode, startSession, endSession, currentUser, COOKIE } from '../auth.js';
import { readLink, useLink, activeSweepForDistrict, adminLog } from '../domain.js';
import { queueMail } from '../mail.js';
import { HttpError, bad, notFound, nowIso, normEmail, limited } from '../util.js';

export default async function publicRoutes(app) {
  app.get('/api/health', async () => ({ ok: true }));
  // Für die Datenschutzerklärung: welcher Dienst die E-Mails verschickt und ob extern gesichert wird
  const mailProvider = !config.smtp ? null : /brevo|sendinblue/i.test(config.smtp.host) ? 'brevo' : /amazonaws\.com$/.test(config.smtp.host) ? 'ses' : 'other';
  app.get('/api/config', async () => ({ testMode: config.testMode, restricted: config.allowedEmails.length > 0, operator: config.operator,
    mailProvider, offsiteBackup: !!process.env.BACKUP_S3_BUCKET }));

  // Android-App (Trusted Web Activity): Verknüpfung App ↔ Domain. Datei liegt in DATA_DIR/assetlinks.json
  app.get('/.well-known/assetlinks.json', async (req, reply) => {
    const file = path.join(config.dataDir, 'assetlinks.json');
    if (!fs.existsSync(file)) throw notFound();
    reply.header('Content-Type', 'application/json').header('Cache-Control', 'public, max-age=3600');
    return fs.readFileSync(file, 'utf8');
  });

  // Live-Kanal: nur Versionsnummern, keine Daten
  app.get('/api/events', (req, reply) => {
    if (!live.canAttach(req.ip)) return reply.code(429).send({ error: 'Zu viele offene Verbindungen.' });
    reply.hijack(); live.attach(reply.raw, req.ip);
  });

  // ---------- Login per E-Mail-Code ----------
  app.post('/api/auth/code', async req => {
    const { email, role, purpose } = req.body || {};
    // Pro Anschluss begrenzt – sonst ließen sich beliebige Postfächer mit Mails fluten
    if (limited('code:' + req.ip, config.ipCodesPerHour, 3600000)) throw new HttpError(429, 'Zu viele Anfragen von diesem Anschluss. Bitte später erneut versuchen.');
    try { await requestCode(email, role, purpose || 'login'); }
    catch (e) {
      if (e.statusCode) throw e;
      // Versand gescheitert (z. B. Adresse abgelehnt) – verständliche Meldung statt „Interner Fehler“
      throw new HttpError(502, 'Die E-Mail konnte nicht zugestellt werden. Bitte die Adresse prüfen oder später erneut versuchen.', 'mail');
    }
    return { ok: true };
  });

  app.post('/api/auth/login', async (req, reply) => {
    const { email, role, code } = req.body || {};
    if (!COOKIE[role]) throw bad('Unbekannte Rolle.');
    if (limited('login:' + req.ip, config.ipLoginsPerHour, 3600000)) throw new HttpError(429, 'Zu viele Versuche. Bitte später erneut versuchen.');
    const e = checkCode(email, role, 'login', code);
    let user = get('SELECT * FROM users WHERE email = ? AND role = ?', e, role);
    if (!user && role === 'admin' && config.adminEmails.includes(e)) {
      run('INSERT INTO users (email, role) VALUES (?,?)', e, 'admin');
      user = get('SELECT * FROM users WHERE email = ? AND role = ?', e, role);
    }
    if (!user) throw bad('Zu dieser E-Mail gibt es kein Konto.');
    if (role === 'admin' && get('SELECT COUNT(*) n FROM passkeys WHERE user_id = ?', user.id).n > 0) throw bad('Bitte mit Passkey entsperren.', 'passkey_required');
    startSession(reply, user.id, role);
    return { ok: true };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    endSession(req, reply, (req.body || {}).role);
    return { ok: true };
  });

  app.get('/api/auth/me', async req => {
    const u = currentUser(req, req.query.role);
    return { user: u ? { email: u.email, role: u.role, passkeys: get('SELECT COUNT(*) n FROM passkeys WHERE user_id = ?', u.id).n, passkeyRequired: u.role === 'admin' && config.adminPasskeyRequired } : null };
  });

  // ---------- Bezirksverzeichnis (Auswahllisten) ----------
  app.get('/api/directory/options', async () => {
    const rows = all('SELECT DISTINCT land, kreis FROM districts WHERE demo = 0 ORDER BY land, kreis');
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
