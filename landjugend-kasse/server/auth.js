import crypto from 'node:crypto';
import { config } from './config.js';
import { get, run } from './db.js';
import { HttpError, bad, forbidden, hmac, randomToken, isoIn, nowIso, safeEqual } from './util.js';

const COOKIE = 'ljk';

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('base64url');
  return `scrypt$${salt}$${crypto.scryptSync(pw, salt, 32).toString('base64url')}`;
}
export function checkPassword(pw, stored) {
  const [, salt, hash] = String(stored).split('$');
  if (!salt || !hash) return false;
  return safeEqual(crypto.scryptSync(String(pw), salt, 32).toString('base64url'), hash);
}
export function validPassword(pw) {
  if (String(pw || '').length < 8) throw bad('Das Passwort muss mindestens 8 Zeichen haben.');
  return String(pw);
}

export function startSession(reply, userId) {
  const token = randomToken(32);
  run('INSERT INTO sessions (id, user_id, expires_at) VALUES (?,?,?)', hmac(token), userId, isoIn(config.sessionDays * 86400000));
  // secure nur bei echter HTTPS-Verbindung (hinter Caddy über X-Forwarded-Proto) – sonst verwirft der Browser das Cookie
  reply.setCookie(COOKIE, token, { path: '/', httpOnly: true, sameSite: 'lax', secure: reply.request.protocol === 'https', maxAge: config.sessionDays * 86400 });
}

export function endSession(req, reply) {
  const t = req.cookies[COOKIE];
  if (t) run('DELETE FROM sessions WHERE id = ?', hmac(t));
  reply.clearCookie(COOKIE, { path: '/' });
}

/** Angemeldeter Nutzer oder null. */
export function currentUser(req) {
  const t = req.cookies[COOKIE];
  if (!t) return null;
  const s = get('SELECT s.expires_at, u.id, u.email, u.name, u.is_admin FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?', hmac(t));
  if (!s) return null;
  if (s.expires_at < nowIso()) { run('DELETE FROM sessions WHERE id = ?', hmac(t)); return null; }
  return { id: s.id, email: s.email, name: s.name, isAdmin: !!s.is_admin };
}

export function requireUser(req) {
  const u = currentUser(req);
  if (!u) throw new HttpError(401, 'Bitte anmelden.', 'auth');
  return u;
}
export function requireAdmin(req) {
  const u = requireUser(req);
  if (!u.isAdmin) throw forbidden('Nur Admins dürfen das.');
  return u;
}
