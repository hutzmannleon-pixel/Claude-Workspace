// Ersteinrichtung, Anmeldung, Nutzer und Vereinseinstellungen
import { all, get, run, tx, setting, setSetting } from '../db.js';
import { startSession, endSession, currentUser, requireUser, requireAdmin, hashPassword, checkPassword, validPassword } from '../auth.js';
import { bad, notFound, clean, normEmail, EMAIL_RE, limited } from '../util.js';

const isSetUp = () => !!get('SELECT 1 FROM users LIMIT 1');

function newUser({ email, name, password, isAdmin }) {
  email = normEmail(email);
  name = clean(name, 80);
  if (!EMAIL_RE.test(email)) throw bad('Bitte eine gültige E-Mail-Adresse eingeben.');
  if (!name) throw bad('Bitte einen Namen eingeben.');
  if (get('SELECT 1 FROM users WHERE email = ?', email)) throw bad('Diese E-Mail-Adresse ist schon vergeben.');
  return Number(run('INSERT INTO users (email, name, pw_hash, is_admin) VALUES (?,?,?,?)', email, name, hashPassword(validPassword(password)), !!isAdmin).lastInsertRowid);
}

export default async function accountRoutes(app) {
  app.get('/api/state', async req => ({ setUp: isSetUp(), club: setting('club') || '', user: currentUser(req) }));

  // Erster Start: Verein benennen und ersten Admin anlegen. Danach gesperrt.
  app.post('/api/setup', async (req, reply) => {
    const b = req.body || {};
    const club = clean(b.club, 100);
    if (!club) throw bad('Bitte den Namen des Vereins eingeben.');
    const id = tx(() => {
      if (isSetUp()) throw bad('Die Kasse ist bereits eingerichtet.');
      setSetting('club', club);
      const uid = newUser({ ...b, isAdmin: true });
      run(`INSERT INTO accounts (name, kind) VALUES ('Barkasse', 'cash')`);
      run(`INSERT OR IGNORE INTO cost_centers (name, color) VALUES ('Allgemein', '#64748b')`);
      for (const c of ['Material', 'Verpflegung', 'Getränke', 'Miete', 'Technik', 'Fahrtkosten', 'Spenden', 'Zuschüsse', 'Mitgliedsbeiträge', 'Teilnehmerbeiträge', 'Bankgebühren', 'Verkauf'])
        run('INSERT OR IGNORE INTO categories (name) VALUES (?)', c);
      return uid;
    });
    startSession(reply, id);
    return { ok: true };
  });

  app.post('/api/login', async (req, reply) => {
    if (limited('login:' + req.ip, 20, 15 * 60000)) throw bad('Zu viele Versuche. Bitte in 15 Minuten erneut versuchen.');
    const u = get('SELECT id, pw_hash FROM users WHERE email = ?', normEmail(req.body?.email));
    if (!u || !checkPassword(req.body?.password || '', u.pw_hash)) throw bad('E-Mail oder Passwort ist falsch.');
    startSession(reply, u.id);
    return { ok: true };
  });

  app.post('/api/logout', async (req, reply) => { endSession(req, reply); return { ok: true }; });

  app.post('/api/password', async req => {
    const me = requireUser(req);
    const u = get('SELECT pw_hash FROM users WHERE id = ?', me.id);
    if (!checkPassword(req.body?.old || '', u.pw_hash)) throw bad('Das bisherige Passwort ist falsch.');
    run('UPDATE users SET pw_hash = ? WHERE id = ?', hashPassword(validPassword(req.body?.password)), me.id);
    return { ok: true };
  });

  app.put('/api/settings', async req => {
    requireAdmin(req);
    const club = clean(req.body?.club, 100);
    if (!club) throw bad('Bitte den Namen des Vereins eingeben.');
    setSetting('club', club);
    return { ok: true };
  });

  app.get('/api/users', async req => {
    requireUser(req);
    return all('SELECT id, email, name, is_admin isAdmin FROM users ORDER BY name').map(u => ({ ...u, isAdmin: !!u.isAdmin }));
  });

  app.post('/api/users', async req => {
    requireAdmin(req);
    return { id: newUser(req.body || {}) };
  });

  app.put('/api/users/:id', async req => {
    const me = requireAdmin(req);
    const id = Number(req.params.id);
    if (!get('SELECT 1 FROM users WHERE id = ?', id)) throw notFound();
    const b = req.body || {};
    if (b.password) run('UPDATE users SET pw_hash = ? WHERE id = ?', hashPassword(validPassword(b.password)), id);
    if (b.isAdmin !== undefined) {
      if (id === me.id && !b.isAdmin) throw bad('Du kannst dir die Admin-Rechte nicht selbst nehmen.');
      run('UPDATE users SET is_admin = ? WHERE id = ?', !!b.isAdmin, id);
    }
    return { ok: true };
  });

  app.delete('/api/users/:id', async req => {
    const me = requireAdmin(req);
    const id = Number(req.params.id);
    if (id === me.id) throw bad('Du kannst dich nicht selbst entfernen.');
    run('DELETE FROM users WHERE id = ?', id);
    return { ok: true };
  });
}
