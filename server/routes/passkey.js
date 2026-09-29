// Passkeys (WebAuthn): Anmeldung per Fingerabdruck / Face ID / Geräte-PIN statt Code.
// Für Betreiber Pflicht (nach dem ersten Entsperren einzurichten, danach kein E-Mail-Code mehr), sonst freiwillig im Profil.
import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } from '@simplewebauthn/server';
import { config } from '../config.js';
import { get, all, run } from '../db.js';
import { COOKIE, currentUser, requireUser, startSession } from '../auth.js';
import { bad, forbidden, notFound, clean, randomToken, nowIso } from '../util.js';

const challenges = new Map(); // id → { challenge, role, userId, exp }
const TTL = 5 * 60000;
const keep = data => { const id = randomToken(16); challenges.set(id, { ...data, exp: Date.now() + TTL }); return id; };
const take = id => { const c = challenges.get(String(id || '')); challenges.delete(String(id || '')); if (!c || c.exp < Date.now()) throw bad('Die Anfrage ist abgelaufen. Bitte erneut versuchen.'); return c; };
setInterval(() => { const now = Date.now(); for (const [k, v] of challenges) if (v.exp < now) challenges.delete(k); }, 60000).unref();

/** Relying Party aus der öffentlichen Adresse; im Testmodus auch die tatsächliche Herkunft (localhost mit anderem Port) */
function rp(req) {
  const base = new URL(config.baseUrl);
  const origin = req.headers.origin;
  if (origin && origin !== base.origin && config.testMode) { const o = new URL(origin); return { id: o.hostname, origin: o.origin }; }
  return { id: base.hostname, origin: base.origin };
}
const roleOf = r => { if (!COOKIE[r]) throw bad('Unbekannte Rolle.'); return r; };
export const passkeyCount = userId => get('SELECT COUNT(*) n FROM passkeys WHERE user_id = ?', userId).n;

export default async function passkeyRoutes(app) {
  // Einrichten (angemeldet)
  app.post('/api/passkey/register/options', async req => {
    const role = roleOf(req.body?.role), u = requireUser(req, role), r = rp(req);
    const existing = all('SELECT cred_id, transports FROM passkeys WHERE user_id = ?', u.id);
    const options = await generateRegistrationOptions({
      rpName: 'Kaminfeger Verwaltung', rpID: r.id, userName: u.email, userDisplayName: u.email,
      userID: new TextEncoder().encode(`${role}:${u.id}`), attestationType: 'none',
      excludeCredentials: existing.map(c => ({ id: c.cred_id, transports: c.transports ? JSON.parse(c.transports) : undefined })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' }
    });
    return { options, challengeId: keep({ challenge: options.challenge, role, userId: u.id }) };
  });

  app.post('/api/passkey/register/verify', async req => {
    const b = req.body || {}, role = roleOf(b.role), u = requireUser(req, role), c = take(b.challengeId), r = rp(req);
    if (c.role !== role || c.userId !== u.id) throw forbidden();
    let v;
    try { v = await verifyRegistrationResponse({ response: b.response, expectedChallenge: c.challenge, expectedOrigin: r.origin, expectedRPID: r.id, requireUserVerification: false }); }
    catch (e) { throw bad('Der Passkey konnte nicht geprüft werden: ' + e.message); }
    if (!v.verified) throw bad('Der Passkey konnte nicht bestätigt werden.');
    const cr = v.registrationInfo.credential;
    if (get('SELECT 1 x FROM passkeys WHERE cred_id = ?', cr.id)) throw bad('Dieser Passkey ist schon eingerichtet.');
    run('INSERT INTO passkeys (user_id, cred_id, public_key, counter, transports, name) VALUES (?,?,?,?,?,?)',
      u.id, cr.id, Buffer.from(cr.publicKey), cr.counter || 0, JSON.stringify(cr.transports || []), clean(b.name, 60) || 'Passkey');
    return { ok: true };
  });

  // Anmelden (ohne E-Mail: der Passkey weiß, zu welchem Konto er gehört)
  app.post('/api/passkey/login/options', async req => {
    const role = roleOf(req.body?.role), r = rp(req);
    const options = await generateAuthenticationOptions({ rpID: r.id, userVerification: 'preferred', allowCredentials: [] });
    return { options, challengeId: keep({ challenge: options.challenge, role }) };
  });

  app.post('/api/passkey/login/verify', async (req, reply) => {
    const b = req.body || {}, role = roleOf(b.role), c = take(b.challengeId), r = rp(req);
    if (c.role !== role) throw forbidden();
    const pk = get('SELECT p.*, u.role, u.email FROM passkeys p JOIN users u ON u.id = p.user_id WHERE p.cred_id = ?', String(b.response?.id || ''));
    const nope = () => bad('Dieser Passkey gehört zu keinem Konto in diesem Bereich. Bitte mit Code anmelden.', 'passkey_unknown');
    if (!pk || pk.role !== role) throw nope();
    if (role === 'admin' && !config.adminEmails.includes(pk.email)) throw forbidden();
    let v;
    try {
      v = await verifyAuthenticationResponse({ response: b.response, expectedChallenge: c.challenge, expectedOrigin: r.origin, expectedRPID: r.id, requireUserVerification: false,
        credential: { id: pk.cred_id, publicKey: new Uint8Array(pk.public_key), counter: pk.counter, transports: pk.transports ? JSON.parse(pk.transports) : undefined } });
    } catch (e) { throw bad('Der Passkey konnte nicht geprüft werden: ' + e.message); }
    if (!v.verified) throw bad('Anmeldung mit Passkey fehlgeschlagen.');
    run('UPDATE passkeys SET counter = ?, last_used = ? WHERE id = ?', v.authenticationInfo.newCounter, nowIso(), pk.id);
    startSession(reply, pk.user_id, role);
    return { ok: true };
  });

  // Verwalten
  app.get('/api/passkey/list', async req => {
    const role = roleOf(req.query.role), u = requireUser(req, role);
    return { passkeys: all('SELECT id, name, created_at, last_used FROM passkeys WHERE user_id = ? ORDER BY id', u.id)
      .map(p => ({ id: p.id, name: p.name, created: p.created_at.replace(' ', 'T') + 'Z', lastUsed: p.last_used })), required: role === 'admin' };
  });

  app.post('/api/passkey/delete', async req => {
    const role = roleOf(req.body?.role), u = requireUser(req, role);
    const p = get('SELECT id FROM passkeys WHERE id = ? AND user_id = ?', Number(req.body?.id), u.id);
    if (!p) throw notFound();
    if (role === 'admin' && passkeyCount(u.id) <= 1) throw bad('Der Betreiber-Zugang braucht mindestens einen Passkey. Legen Sie zuerst einen neuen an.');
    run('DELETE FROM passkeys WHERE id = ?', p.id);
    return { ok: true };
  });
}
