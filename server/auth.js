import { config, emailAllowed } from './config.js';
import { get, run } from './db.js';
import { sendMail } from './mail.js';
import { HttpError, bad, hmac, randomCode, randomToken, isoIn, nowIso, normEmail, EMAIL_RE, safeEqual } from './util.js';

export const COOKIE = { customer: 'kf_c', sweep: 'kf_s', admin: 'kf_a' };
const ROLE_LABEL = { customer: 'Kaminfeger-Termine', sweep: 'Kaminfeger-Termine für Kaminfeger', admin: 'Betreiber-Zugang' };

const codeHash = (email, role, purpose, code) => hmac(`${email}|${role}|${purpose}|${code}`);

export async function requestCode(emailRaw, role, purpose) {
  const email = normEmail(emailRaw);
  if (!EMAIL_RE.test(email)) throw bad('Bitte eine gültige E-Mail-Adresse eingeben.');
  if (!COOKIE[role]) throw bad('Unbekannte Rolle.');
  if (!['login', 'register'].includes(purpose)) throw bad('Unbekannter Zweck.');
  if (role === 'admin' && purpose !== 'login') throw bad('Admins werden nicht registriert.');
  if (!emailAllowed(email)) throw new HttpError(403, 'Diese App ist derzeit nur für eingeladene Testpersonen freigegeben.', 'not_allowed');

  const recent = get(`SELECT COUNT(*) n FROM codes WHERE email = ? AND created_at > datetime('now','-1 hour')`, email).n;
  if (recent >= config.codesPerHour) throw new HttpError(429, 'Zu viele Codes angefordert. Bitte in einer Stunde erneut versuchen.');

  const user = get('SELECT id FROM users WHERE email = ? AND role = ?', email, role);
  if (role === 'admin' && !config.adminEmails.includes(email)) {
    // Keine Auskunft, ob die Adresse Admin ist – einfach nichts senden.
    run('INSERT INTO codes (email, role, purpose, code_hash, expires_at, used) VALUES (?,?,?,?,?,1)', email, role, purpose, 'x', nowIso());
    return;
  }
  if (purpose === 'login' && !user && role !== 'admin') {
    run('INSERT INTO codes (email, role, purpose, code_hash, expires_at, used) VALUES (?,?,?,?,?,1)', email, role, purpose, 'x', nowIso());
    await sendMail({ to: email, subject: 'Anmeldung nicht möglich',
      text: `Jemand wollte sich mit dieser E-Mail-Adresse bei ${ROLE_LABEL[role]} anmelden. Zu dieser Adresse gibt es aber noch kein Konto.\n\nBitte registrieren Sie sich zuerst in der App. Falls Sie das nicht waren, können Sie diese E-Mail ignorieren.` });
    return;
  }
  if (purpose === 'register' && user) {
    run('INSERT INTO codes (email, role, purpose, code_hash, expires_at, used) VALUES (?,?,?,?,?,1)', email, role, purpose, 'x', nowIso());
    await sendMail({ to: email, subject: 'Sie haben bereits ein Konto',
      text: `Zu dieser E-Mail-Adresse gibt es bereits ein Konto. Bitte wählen Sie in der App „Ich habe schon ein Konto“ und melden Sie sich mit einem Code an.` });
    return;
  }
  const code = randomCode();
  run('UPDATE codes SET used = 1 WHERE email = ? AND role = ? AND purpose = ? AND used = 0', email, role, purpose);
  run('INSERT INTO codes (email, role, purpose, code_hash, expires_at) VALUES (?,?,?,?,?)',
    email, role, purpose, codeHash(email, role, purpose, code), isoIn(config.codeTtlMin * 60000));
  await sendMail({ to: email, subject: `Ihr Code: ${code}`,
    text: `Ihr ${purpose === 'login' ? 'Anmelde' : 'Bestätigungs'}code für ${ROLE_LABEL[role]} lautet:\n\n${code}\n\nDer Code gilt ${config.codeTtlMin} Minuten und nur einmal. Falls Sie ihn nicht angefordert haben, ignorieren Sie diese E-Mail.` });
}

export function checkCode(emailRaw, role, purpose, codeRaw) {
  const email = normEmail(emailRaw), code = String(codeRaw || '').replace(/\D/g, '');
  const row = get(`SELECT * FROM codes WHERE email = ? AND role = ? AND purpose = ? AND used = 0 ORDER BY id DESC LIMIT 1`, email, role, purpose);
  const fail = () => bad('Der Code ist falsch oder abgelaufen.', 'code');
  if (!row || code.length !== 6) throw fail();
  if (row.expires_at < nowIso() || row.attempts >= config.codeMaxAttempts) { run('UPDATE codes SET used = 1 WHERE id = ?', row.id); throw fail(); }
  if (!safeEqual(row.code_hash, codeHash(email, role, purpose, code))) {
    run('UPDATE codes SET attempts = attempts + 1 WHERE id = ?', row.id);
    throw fail();
  }
  run('UPDATE codes SET used = 1 WHERE id = ?', row.id);
  return email;
}

export function startSession(reply, userId, role) {
  const token = randomToken();
  const days = role === 'admin' ? 1 : config.sessionDays;
  run('INSERT INTO sessions (id, user_id, expires_at, last_seen) VALUES (?,?,?,?)', hmac(token), userId, isoIn(days * 86400000), nowIso());
  // secure nur bei echter HTTPS-Verbindung (hinter Caddy über X-Forwarded-Proto) – sonst verwirft der Browser das Cookie
  reply.setCookie(COOKIE[role], token, { path: '/', httpOnly: true, sameSite: 'lax', secure: reply.request.protocol === 'https', maxAge: days * 86400 });
}

export function endSession(req, reply, role) {
  const t = req.cookies[COOKIE[role]];
  if (t) run('DELETE FROM sessions WHERE id = ?', hmac(t));
  reply.clearCookie(COOKIE[role], { path: '/' });
}

/** Liefert den angemeldeten Nutzer der Rolle oder null. */
export function currentUser(req, role) {
  const t = req.cookies[COOKIE[role]];
  if (!t) return null;
  const id = hmac(t);
  const s = get(`SELECT s.id sid, s.expires_at, s.last_seen, u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND u.role = ?`, id, role);
  if (!s) return null;
  const now = nowIso();
  if (s.expires_at < now) { run('DELETE FROM sessions WHERE id = ?', id); return null; }
  if (role === 'admin' && Date.parse(s.last_seen) < Date.now() - config.adminIdleMin * 60000) {
    run('DELETE FROM sessions WHERE id = ?', id);
    return null;
  }
  run('UPDATE sessions SET last_seen = ? WHERE id = ?', now, id);
  return { id: s.id, email: s.email, role: s.role };
}

export function requireUser(req, role) {
  const u = currentUser(req, role);
  if (!u) throw new HttpError(401, role === 'admin' ? 'Gesperrt – bitte neu entsperren.' : 'Bitte anmelden.', 'auth');
  return u;
}
