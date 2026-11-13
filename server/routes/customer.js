import { config } from '../config.js';
import { isDemoEmail } from '../demo.js';
import { get, all, run, tx } from '../db.js';
import { live } from '../live.js';
import { checkCode, requireUser, startSession, endSession } from '../auth.js';
import { queueMail } from '../mail.js';
import {
  makeLink, readLink, useLink, activeSweep, sweepName, companyName, initials, campaignForHousehold, windowsOf, freeCount,
  routeFor, routeStarted, householdName, CHAT_MAX, chatMessages, chatPost, chatRead
} from '../domain.js';
import { limited, bad, forbidden, notFound, clean, streetKey, nrKey, nowIso, slotsOf, toMin, fmtMin, dayLabel, parseDate, today, EMAIL_RE, normEmail } from '../util.js';

const LONG = { Mo: 'Montag', Di: 'Dienstag', Mi: 'Mittwoch', Do: 'Donnerstag', Fr: 'Freitag', Sa: 'Samstag', So: 'Sonntag' };
const longDay = label => { const [d, rest] = label.split(', '); return (LONG[d] || d) + ', ' + rest; };

/**
 * Sucht eine Adresse in den Kundenlisten der freigeschalteten Betriebe (nie in der Vorschau).
 * known: ein Betrieb führt die Straße · exact: Einträge mit genau dieser Hausnummer (mehrere, wenn mehrere Betriebe sie führen)
 */
function lookup({ street, nr, plz }) {
  const inStreet = all(`SELECT h.* FROM households h JOIN sweeps s ON s.id = h.sweep_id
    WHERE h.street_key = ? AND h.plz = ? AND s.status = 'active' AND s.demo = 0 ORDER BY h.id`, streetKey(street), clean(plz, 5));
  return { known: inStreet.length > 0, exact: inStreet.filter(h => nrKey(h.nr) === nrKey(nr)) };
}

/** Dieselbe Adresse in den Kundenlisten aller freigeschalteten Betriebe – der eigene Eintrag steht vorn. */
function sameAddress(h) {
  const rows = all(`SELECT h.* FROM households h JOIN sweeps s ON s.id = h.sweep_id
    WHERE h.street_key = ? AND h.plz = ? AND h.id != ? AND s.status = 'active' AND s.demo = (SELECT demo FROM sweeps WHERE id = ?) ORDER BY h.id`,
    h.street_key, h.plz, h.id, h.sweep_id).filter(x => nrKey(x.nr) === nrKey(h.nr));
  return [h, ...rows];
}

const icsText = t => String(t).replace(/[\\;,]/g, m => '\\' + m).replace(/\s+/g, ' ');

const failed = new Map(); // Fehlversuche Kundennummer je Bewohner

// Buchen, verschieben und absagen geht bis zum Vortag – am Termintag nur noch telefonisch mit dem Kaminfeger
const openDay = date => date > today();

function residentOf(user) {
  const r = get('SELECT * FROM residents WHERE user_id = ?', user.id);
  if (!r) throw notFound('Kein Bewohnerkonto.');
  return r;
}

export default async function customerRoutes(app) {
  // Vor der Anmeldung: nur ob ein Betrieb die Adresse führt – nie welcher (Kundenbeziehungen sind nicht öffentlich)
  app.post('/api/customer/lookup', async req => {
    const b = req.body || {};
    if (limited('lookup:' + req.ip, 60, 600000)) throw bad('Zu viele Anfragen. Bitte später erneut versuchen.');
    if (clean(b.street).length < 3 || !/^\d{5}$/.test(clean(b.plz))) return { known: false, householdFound: false };
    const m = lookup(b);
    return { known: m.known, householdFound: m.exact.length > 0 };
  });

  // Einladung (vom Kaminfeger) oder Mitbewohner-Einladung ansehen
  app.get('/api/customer/invite/:token', async req => {
    const l = readLink('invite', req.params.token) || readLink('member', req.params.token);
    if (!l) throw notFound('Der Einladungslink ist ungültig oder wurde schon benutzt.');
    const h = get('SELECT * FROM households WHERE id = ?', l.ref_id);
    if (!h) throw notFound('Diese Adresse gibt es nicht mehr. Bitte wenden Sie sich an Ihren Kaminfeger.');
    const s = activeSweep(h.sweep_id);
    return { kind: l.kind, family: householdName(h), street: h.street, nr: h.nr, plz: h.plz, ort: h.ort, sweep: companyName(s), email: l.data?.email || '' };
  });

  app.post('/api/customer/register', async (req, reply) => {
    const b = req.body || {};
    const email = checkCode(b.email, 'customer', 'register', b.code);
    if (get('SELECT 1 x FROM users WHERE email = ? AND role = ?', email, 'customer')) throw bad('Zu dieser E-Mail gibt es schon ein Konto.');
    const link = b.invite ? (readLink('invite', b.invite) || readLink('member', b.invite)) : null;
    if (b.invite && !link) throw bad('Der Einladungslink ist ungültig oder wurde schon benutzt.');
    if (link && !get('SELECT 1 x FROM households WHERE id = ?', link.ref_id)) throw bad('Diese Adresse gibt es nicht mehr. Bitte wenden Sie sich an Ihren Kaminfeger.');
    const result = tx(() => {
      const uid = Number(run('INSERT INTO users (email, role) VALUES (?,?)', email, 'customer').lastInsertRowid);
      if (link) {
        const h = get('SELECT * FROM households WHERE id = ?', link.ref_id);
        const member = link.kind === 'member';
        useLink(b.invite);
        run(`INSERT INTO residents (user_id, household_id, family_name, person_name, street, nr, plz, ort, status, method, is_member, verified_at)
          VALUES (?,?,?,?,?,?,?,?,'verified',?,?,?)`, uid, h.id, householdName(h), clean(b.person) || null, h.street, h.nr, h.plz, h.ort, member ? 'member' : 'invite', member ? 1 : 0, nowIso());
        if (!member) run('UPDATE households SET moved_at = NULL WHERE id = ?', h.id);
        return { uid, next: 'done', status: 'verified' };
      }
      const street = clean(b.street), nr = clean(b.nr, 12), plz = clean(b.plz, 5), ort = clean(b.ort), name = clean(b.name, 80);
      if (street.length < 3 || !nr || !/^\d{5}$/.test(plz) || ort.length < 2 || !name) throw bad('Bitte die Adresse vollständig angeben.');
      const m = lookup({ street, nr, plz });
      const h = m.exact[0] || null;
      run(`INSERT INTO residents (user_id, household_id, family_name, street, nr, plz, ort, status) VALUES (?,?,?,?,?,?,?,?)`,
        uid, h ? h.id : null, name, street, nr, plz, ort, h ? 'needs_verify' : 'unverified');
      return { uid, next: h ? 'verify' : 'done', status: h ? 'needs_verify' : 'unverified', known: m.known };
    });
    startSession(reply, result.uid, 'customer');
    live.bump();
    return { next: result.next, status: result.status, known: result.known ?? true };
  });

  app.post('/api/customer/verify-number', async req => {
    const u = requireUser(req, 'customer'), r = residentOf(u);
    if (r.status !== 'needs_verify' && r.status !== 'review') throw bad('Ihr Wohnsitz ist bereits in Prüfung oder bestätigt.');
    const cur = get('SELECT * FROM households WHERE id = ?', r.household_id);
    if (!cur) throw bad('Für Ihre Adresse ist kein Kaminfeger hinterlegt.');
    const n = (failed.get(r.id) || 0);
    if (n >= 5) throw bad('Zu viele Fehlversuche. Bitte lassen Sie Ihren Wohnsitz vom Kaminfeger bestätigen.');
    const norm = v => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    // Führen mehrere Betriebe die Adresse, zeigt die Kundennummer, zu welchem der Haushalt gehört
    const kdnr = norm(req.body?.kdnr);
    const h = kdnr ? sameAddress(cur).find(x => x.customer_no && norm(x.customer_no) === kdnr) : null;
    if (!h) {
      failed.set(r.id, n + 1);
      if (n + 1 >= 3) {
        run(`UPDATE residents SET status = 'review', method = 'number' WHERE id = ?`, r.id);
        live.bump();
      }
      throw bad(n + 1 >= 3
        ? 'Die Kundennummer passt nicht. Wir prüfen Ihre Angaben – oder lassen Sie sich vom Kaminfeger bestätigen.'
        : 'Die Kundennummer passt nicht zu dieser Adresse. Sie steht auf der Rechnung Ihres Kaminfegers.', 'kdnr');
    }
    failed.delete(r.id);
    tx(() => {
      run(`UPDATE residents SET household_id = ?, status = 'verified', method = 'number', verified_at = ? WHERE id = ?`, h.id, nowIso(), r.id);
      run('UPDATE households SET moved_at = NULL WHERE id = ?', h.id);
    });
    live.bump();
    return { ok: true };
  });

  app.post('/api/customer/request-sweep', async req => {
    const u = requireUser(req, 'customer'), r = residentOf(u);
    if (!['needs_verify', 'review'].includes(r.status) || !r.household_id) throw bad('Eine Bestätigung durch den Kaminfeger ist hier nicht möglich.');
    run(`UPDATE residents SET status = 'asked', method = 'sweep' WHERE id = ?`, r.id);
    const h = get('SELECT * FROM households WHERE id = ?', r.household_id), s = activeSweep(h.sweep_id);
    if (s) queueMail({ to: s.email, subject: `Bewohner-Anfrage: ${h.street} ${h.nr}`,
      text: `${r.family_name} möchte Termine für ${h.street} ${h.nr} buchen und bittet Sie zu bestätigen, dass sie dort wohnen. In Ihrer Kundenliste: ${h.owner_name}.\n\nSie können die Anfrage in Ihrer App bestätigen.`,
      link: `${config.baseUrl}/kaminfeger`, linkLabel: 'App öffnen' });
    live.bump();
    return { ok: true };
  });

  // ---------- App-Zustand ----------
  app.get('/api/customer/state', async req => {
    const u = requireUser(req, 'customer'), r = residentOf(u);
    const h = r.household_id ? get('SELECT * FROM households WHERE id = ?', r.household_id) : null;
    const s = h ? activeSweep(h.sweep_id) : null;
    const moved = r.status === 'moved', verified = r.status === 'verified';
    const c = h && !moved ? campaignForHousehold(h) : null;
    let campaign = null, booking = null, houseStatus = 'open', live_ = null, messages = [];
    if (c) {
      const my = get(`SELECT * FROM bookings WHERE campaign_id = ? AND household_id = ? AND status = 'booked'`, c.id, h.id);
      const cancelled = !my && get(`SELECT 1 x FROM bookings WHERE campaign_id = ? AND household_id = ? AND status = 'cancelled'`, c.id, h.id);
      houseStatus = my ? 'booked' : cancelled ? 'cancelled' : 'open';
      const wins = windowsOf(c.id);
      campaign = { id: c.id, street: c.street, work: c.work, slotLen: c.slot_len, deadline: c.deadline, deadlineLabel: dayLabel(c.deadline),
        windows: wins.map(w => {
          const taken = new Set(all(`SELECT time FROM bookings WHERE window_id = ? AND status = 'booked' AND household_id != ?`, w.id, h.id).map(x => x.time));
          return { ...w, open: openDay(w.date), free: openDay(w.date) ? freeCount(c, w, h.id) : 0, slots: slotsOf(w, c.slot_len).map(t => ({ t, taken: taken.has(t) })) };
        }) };
      if (my) {
        const w = wins.find(x => x.id === my.window_id);
        booking = { windowId: my.window_id, t: my.time, end: fmtMin(toMin(my.time) + c.slot_len), key: my.key_note, visit: my.visit, date: w.date, label: w.label, longDate: longDay(w.label), changeable: openDay(w.date) || my.visit === 'missed' };
        if (routeStarted(h.sweep_id, w.date)) {
          const route = routeFor(h.sweep_id, w.date);
          const cur = route.find(x => !x.visit);
          live_ = { stops: route.map(x => ({ nr: x.nr, me: x.householdId === h.id, visited: !!x.visit, cur: cur && cur.id === x.id })), curNr: cur ? cur.nr : null };
        }
      }
    }
    if (h) {
      // Nachrichten der aktuellen Kampagne plus alles seit der Registrierung (nicht die der Vormieter)
      messages = all(`SELECT m.id, m.text, m.created_at, (SELECT 1 FROM message_reads mr WHERE mr.message_id = m.id AND mr.user_id = ?) AS rd
        FROM messages m JOIN message_recipients rc ON rc.message_id = m.id
        WHERE rc.household_id = ? AND (m.campaign_id = ? OR m.created_at >= ?) ORDER BY m.id`, u.id, h.id, c ? c.id : -1, r.created_at)
        .map(m => ({ id: m.id, text: m.text, at: m.created_at, read: !!m.rd }));
    }
    const members = h ? all(`SELECT r.*, u.email FROM residents r JOIN users u ON u.id = r.user_id WHERE r.household_id = ? AND r.status = 'verified'`, h.id)
      .map(m => ({ ini: initials(m.person_name || m.family_name || m.email), name: (m.person_name || (m.is_member ? m.email : 'Familie ' + m.family_name)) + (m.id === r.id ? ' (Sie)' : ''),
        sub: m.is_member ? 'Erhält Erinnerungen' : 'Verifiziert · ' + ({ number: 'Kundennummer', invite: 'Einladung', sweep: 'Kaminfeger', owner: 'Eigentümer', admin: 'Betreiber' }[m.method] || '') })) : [];
    // Nach abgeschlossener Runde: wann zuletzt erledigt
    const lastDone = h && !c ? get(`SELECT w.date d, c.work FROM bookings b JOIN windows w ON w.id = b.window_id JOIN campaigns c ON c.id = b.campaign_id
      WHERE b.household_id = ? AND b.visit = 'done' AND c.closed_at IS NOT NULL ORDER BY w.date DESC LIMIT 1`, h.id) : null;
    // Führen mehrere Betriebe die Adresse, kann ein bestätigter Bewohner seinen Kaminfeger wählen
    const options = h && verified ? sameAddress(h).slice(1).map(x => ({ id: x.id, company: companyName(activeSweep(x.sweep_id)) })) : [];
    const pending = all(`SELECT data FROM tokens WHERE kind = 'member' AND ref_id = ? AND used_at IS NULL AND expires_at > ?`, h ? h.id : -1, nowIso())
      .map(t => JSON.parse(t.data).email).map(e => ({ ini: e.slice(0, 2).toUpperCase(), name: e, sub: 'Einladung gesendet' }));
    const chatUnread = h && !moved ? get(`SELECT COUNT(*) n FROM chat_messages WHERE household_id = ? AND from_sweep = 1 AND read_at IS NULL AND created_at >= ?`, h.id, r.created_at).n : 0;
    return {
      me: { email: u.email }, demo: isDemoEmail(u.email), chatUnread, options,
      resident: { family: r.family_name, street: h ? h.street : r.street, nr: h ? h.nr : r.nr, plz: h ? h.plz : r.plz, ort: h ? h.ort : r.ort,
        status: r.status, method: r.method, isMember: !!r.is_member,
        prefs: { eve: !!r.rem_eve, hour: !!r.rem_hour, push: !!r.ch_push, mail: !!r.ch_mail }, prep: JSON.parse(r.prep || '[]') },
      // Ob ein Betrieb die Adresse führt – wer es ist, erfährt man erst mit bestätigtem Wohnsitz
      listed: !!h, hasSweep: !!s,
      sweep: s && verified ? { name: sweepName(s), company: companyName(s), ini: initials(sweepName(s)), phone: s.phone || '' } : null,
      campaign, booking, houseStatus, live: live_, messages, members: members.concat(pending),
      lastDone: lastDone ? { date: lastDone.d, work: lastDone.work, label: longDay(dayLabel(lastDone.d)) } : null
    };
  });

  app.post('/api/customer/book', async req => {
    const u = requireUser(req, 'customer'), r = residentOf(u);
    if (r.status !== 'verified') throw forbidden('Sie können buchen, sobald Ihr Wohnsitz bestätigt ist.');
    const h = get('SELECT * FROM households WHERE id = ?', r.household_id);
    const c = campaignForHousehold(h);
    if (!c) throw bad('Für Ihre Straße gibt es noch keine Zeitfenster.');
    const { windowId, time } = req.body || {};
    const w = get('SELECT * FROM windows WHERE id = ? AND campaign_id = ?', Number(windowId), c.id);
    if (!w || !slotsOf(w, c.slot_len).includes(time)) throw bad('Diese Zeit gibt es nicht.');
    if (!openDay(w.date)) throw bad('Dieser Tag kann nicht mehr gebucht werden. Bitte einen späteren Tag wählen oder den Kaminfeger anrufen.', 'closed');
    const key = clean(req.body.key, 120) || null;
    const cur = get(`SELECT b.*, w.date FROM bookings b JOIN windows w ON w.id = b.window_id WHERE b.campaign_id = ? AND b.household_id = ? AND b.status = 'booked'`, c.id, h.id);
    if (cur && cur.visit === 'done') throw bad('Dieser Termin ist bereits erledigt.');
    if (cur && !cur.visit && !openDay(cur.date)) throw bad('Ihr Termin ist heute – Änderungen bitte direkt mit dem Kaminfeger absprechen.', 'closed');
    try {
      tx(() => {
        const old = get(`SELECT * FROM bookings WHERE campaign_id = ? AND household_id = ? AND status = 'booked'`, c.id, h.id);
        if (old) run(`UPDATE bookings SET status = ?, updated_at = ? WHERE id = ?`, old.visit === 'missed' ? 'missed' : 'replaced', nowIso(), old.id);
        run(`INSERT INTO bookings (campaign_id, household_id, window_id, time, key_note, source) VALUES (?,?,?,?,?,'app')`, c.id, h.id, w.id, time, key);
      });
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) throw bad('Diese Zeit wurde gerade vergeben. Bitte eine andere wählen.', 'taken');
      throw e;
    }
    const label = dayLabel(w.date);
    for (const m of all(`SELECT u.email FROM residents r JOIN users u ON u.id = r.user_id WHERE r.household_id = ? AND r.status = 'verified' AND r.ch_mail = 1`, h.id))
      queueMail({ to: m.email, subject: `Termin bestätigt: ${label}, ${time} Uhr`,
        text: `Ihr Termin mit dem Kaminfeger ist gebucht (${c.work}):\n\n${longDay(label)} · ${time}–${fmtMin(toMin(time) + c.slot_len)} Uhr\n${h.street} ${h.nr}${key ? `\nSchlüssel bei: ${key}` : ''}\n\nVerschieben oder absagen können Sie bis zum Vortag in der App.`,
        link: `${config.baseUrl}/kunde`, linkLabel: 'Termin ansehen' });
    live.bump();
    return { ok: true };
  });

  app.post('/api/customer/cancel', async req => {
    const u = requireUser(req, 'customer'), r = residentOf(u);
    const h = get('SELECT * FROM households WHERE id = ?', r.household_id);
    const c = h && campaignForHousehold(h);
    const b = c && get(`SELECT b.*, w.date FROM bookings b JOIN windows w ON w.id = b.window_id WHERE b.campaign_id = ? AND b.household_id = ? AND b.status = 'booked'`, c.id, h.id);
    if (!b || b.visit) throw bad('Kein Termin zum Absagen.');
    if (!openDay(b.date)) throw bad('Ihr Termin ist heute – absagen bitte direkt beim Kaminfeger.', 'closed');
    run(`UPDATE bookings SET status = 'cancelled', updated_at = ? WHERE id = ?`, nowIso(), b.id);
    live.bump();
    return { ok: true };
  });

  app.post('/api/customer/read', async req => {
    const u = requireUser(req, 'customer'), r = residentOf(u);
    if (r.household_id) run(`INSERT OR IGNORE INTO message_reads (message_id, user_id) SELECT message_id, ? FROM message_recipients WHERE household_id = ?`, u.id, r.household_id);
    if (r.household_id && r.status === 'verified') chatRead(r.household_id, false);
    live.bump();
    return { ok: true };
  });

  // ---------- Messenger mit dem Kaminfeger ----------
  app.get('/api/customer/chat', async req => {
    const u = requireUser(req, 'customer'), r = residentOf(u);
    if (r.status !== 'verified' || !r.household_id) return { canWrite: false, messages: [] };
    const h = get('SELECT * FROM households WHERE id = ?', r.household_id), s = activeSweep(h.sweep_id);
    return { canWrite: !!s, messages: chatMessages(h.id, r.created_at) };
  });

  app.post('/api/customer/chat', async req => {
    const u = requireUser(req, 'customer'), r = residentOf(u);
    if (r.status !== 'verified' || !r.household_id) throw forbidden('Schreiben geht, sobald Ihr Wohnsitz bestätigt ist.');
    const h = get('SELECT * FROM households WHERE id = ?', r.household_id);
    if (!activeSweep(h.sweep_id)) throw bad('Ihr Kaminfeger nutzt die App gerade nicht.');
    const text = String(req.body?.text || '').trim().slice(0, CHAT_MAX);
    if (!text) throw bad('Bitte eine Nachricht eingeben.');
    if (limited('chat:' + u.id, 40, 3600000)) throw bad('Zu viele Nachrichten in kurzer Zeit. Bitte etwas später weiterschreiben.');
    chatPost(h.id, false, u.id, text);
    live.bump();
    return { ok: true };
  });

  app.post('/api/customer/prefs', async req => {
    const u = requireUser(req, 'customer'), r = residentOf(u), b = req.body || {};
    const v = (k, cur) => (typeof b[k] === 'boolean' ? (b[k] ? 1 : 0) : cur);
    run('UPDATE residents SET rem_eve = ?, rem_hour = ?, ch_push = ?, ch_mail = ? WHERE id = ?', v('eve', r.rem_eve), v('hour', r.rem_hour), v('push', r.ch_push), v('mail', r.ch_mail), r.id);
    return { ok: true };
  });

  app.post('/api/customer/prep', async req => {
    const u = requireUser(req, 'customer'), r = residentOf(u);
    const k = String(req.body?.key || '');
    if (!['access', 'cold', 'pets'].includes(k)) throw bad('Unbekannter Punkt.');
    const cur = JSON.parse(r.prep || '[]');
    const next = cur.includes(k) ? cur.filter(x => x !== k) : cur.concat([k]);
    run('UPDATE residents SET prep = ? WHERE id = ?', JSON.stringify(next), r.id);
    return { ok: true };
  });

  app.post('/api/customer/members', async req => {
    const u = requireUser(req, 'customer'), r = residentOf(u);
    if (r.status !== 'verified') throw forbidden('Erst nach der Bestätigung Ihres Wohnsitzes möglich.');
    const email = normEmail(req.body?.email);
    if (!EMAIL_RE.test(email)) throw bad('Bitte eine gültige E-Mail-Adresse eingeben.');
    if (email === u.email) throw bad('Das ist Ihre eigene Adresse.');
    if (isDemoEmail(u.email)) throw bad('In der Vorschau werden keine Einladungen verschickt.');
    const h = get('SELECT * FROM households WHERE id = ?', r.household_id);
    const pending = all(`SELECT data, created_at FROM tokens WHERE kind = 'member' AND ref_id = ? AND used_at IS NULL AND expires_at > ?`, h.id, nowIso());
    if (pending.some(t => JSON.parse(t.data).email === email)) throw bad('An diese Adresse ist schon eine Einladung unterwegs.');
    if (pending.length >= 5) throw bad('Es sind schon 5 Einladungen offen. Bitte warten, bis sie angenommen wurden.');
    const l = makeLink('member', h.id, { email, by: r.id }, 14 * 86400000, '/kunde?einladung=');
    queueMail({ to: email, subject: `Einladung: Kaminfeger-Termin für ${h.street} ${h.nr}`,
      text: `${r.family_name} lädt Sie ein, den Kaminfeger-Termin in der ${h.street} ${h.nr} zu sehen und Erinnerungen zu bekommen.\n\nDer Link gilt 14 Tage und nur einmal.`,
      link: l.url, linkLabel: 'Einladung annehmen' });
    live.bump();
    return { ok: true };
  });

  app.post('/api/customer/move', async req => {
    const u = requireUser(req, 'customer'), r = residentOf(u);
    if (!r.household_id || r.status === 'moved') throw bad('Kein aktiver Wohnsitz.');
    tx(() => {
      run(`UPDATE bookings SET status = 'cancelled', updated_at = ? WHERE household_id = ? AND status = 'booked'`, nowIso(), r.household_id);
      run(`UPDATE residents SET status = 'moved', moved_at = ? WHERE household_id = ? AND status = 'verified'`, nowIso(), r.household_id);
      run('UPDATE households SET moved_at = ? WHERE id = ?', nowIso(), r.household_id);
    });
    const h = get('SELECT * FROM households WHERE id = ?', r.household_id), s = activeSweep(h.sweep_id);
    if (s) queueMail({ to: s.email, subject: `Umzug gemeldet: ${h.street} ${h.nr}`,
      text: `${r.family_name} hat den Auszug aus der ${h.street} ${h.nr} gemeldet. Offene Termine wurden storniert. Die neuen Bewohner können sich selbst verifizieren.` });
    live.bump();
    return { ok: true };
  });

  // Nach einem Umzug: neue Adresse angeben und erneut verifizieren
  app.post('/api/customer/readdress', async req => {
    const u = requireUser(req, 'customer'), r = residentOf(u), b = req.body || {};
    if (!['moved', 'unverified', 'rejected'].includes(r.status)) throw bad('Ihre Adresse ist noch aktiv. Melden Sie zuerst den Umzug.');
    const street = clean(b.street), nr = clean(b.nr, 12), plz = clean(b.plz, 5), ort = clean(b.ort), name = clean(b.name, 80) || r.family_name;
    if (street.length < 3 || !nr || !/^\d{5}$/.test(plz) || ort.length < 2) throw bad('Bitte die Adresse vollständig angeben.');
    const m = lookup({ street, nr, plz });
    const h = m.exact[0] || null;
    run(`UPDATE residents SET household_id = ?, family_name = ?, street = ?, nr = ?, plz = ?, ort = ?, status = ?, method = NULL, is_member = 0, verified_at = NULL, moved_at = NULL, prep = '[]' WHERE id = ?`,
      h ? h.id : null, name, street, nr, plz, ort, h ? 'needs_verify' : 'unverified', r.id);
    failed.delete(r.id);
    live.bump();
    return { next: h ? 'verify' : 'done', status: h ? 'needs_verify' : 'unverified', known: m.known };
  });

  // Die Adresse steht bei mehreren Betrieben: Der Haushalt wechselt zu dem Betrieb, den der Bewohner als seinen Kaminfeger wählt
  app.post('/api/customer/choose', async req => {
    const u = requireUser(req, 'customer'), r = residentOf(u);
    if (r.status !== 'verified' || !r.household_id) throw forbidden('Erst nach der Bestätigung Ihres Wohnsitzes möglich.');
    if (isDemoEmail(u.email)) throw bad('In der Vorschau nicht möglich.');
    const cur = get('SELECT * FROM households WHERE id = ?', r.household_id);
    const next = sameAddress(cur).slice(1).find(x => x.id === Number(req.body?.householdId));
    if (!next) throw bad('Dieser Betrieb führt Ihre Adresse nicht.');
    if (get(`SELECT 1 x FROM bookings WHERE household_id = ? AND status = 'booked' AND visit IS NULL`, cur.id))
      throw bad('Sie haben noch einen offenen Termin. Bitte erst absagen oder den Termin abwarten.');
    tx(() => {
      run(`UPDATE residents SET household_id = ? WHERE household_id = ? AND status = 'verified'`, next.id, cur.id);
      run('UPDATE households SET moved_at = NULL WHERE id = ?', next.id);
    });
    live.bump();
    return { ok: true };
  });

  // Konto löschen (DSGVO / Play Store). Termine des Haushalts werden storniert, wenn niemand sonst dort wohnt.
  app.post('/api/customer/delete', async (req, reply) => {
    const u = requireUser(req, 'customer'), r = residentOf(u);
    if (req.body?.confirm !== 'LÖSCHEN') throw bad('Bitte zur Bestätigung LÖSCHEN eingeben.');
    tx(() => {
      if (r.household_id) {
        const others = get(`SELECT COUNT(*) n FROM residents WHERE household_id = ? AND status = 'verified' AND id != ?`, r.household_id, r.id).n;
        if (!others) run(`UPDATE bookings SET status = 'cancelled', updated_at = ? WHERE household_id = ? AND status = 'booked'`, nowIso(), r.household_id);
      }
      run('DELETE FROM message_reads WHERE user_id = ?', u.id);
      run('DELETE FROM users WHERE id = ?', u.id);
    });
    endSession(req, reply, 'customer');
    live.bump();
    return { ok: true };
  });

  app.post('/api/customer/logout', async (req, reply) => { endSession(req, reply, 'customer'); return { ok: true }; });

  app.get('/api/customer/calendar.ics', async (req, reply) => {
    const u = requireUser(req, 'customer'), r = residentOf(u);
    const h = get('SELECT * FROM households WHERE id = ?', r.household_id);
    const c = h && campaignForHousehold(h);
    const b = c && get(`SELECT b.*, w.date FROM bookings b JOIN windows w ON w.id = b.window_id WHERE b.campaign_id = ? AND b.household_id = ? AND b.status = 'booked'`, c.id, h.id);
    if (!b) throw notFound('Kein Termin.');
    const s = activeSweep(h.sweep_id);
    const dt = (date, t) => { const d = parseDate(date); const [hh, mm] = t.split(':').map(Number); d.setHours(hh, mm); return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); };
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Kaminfeger Verwaltung//DE', 'BEGIN:VEVENT', `UID:kf-${b.id}@kaminfeger-termine`,
      `DTSTAMP:${dt(b.date, b.time)}`, `DTSTART:${dt(b.date, b.time)}`, `DTEND:${dt(b.date, fmtMin(toMin(b.time) + c.slot_len))}`,
      `SUMMARY:${icsText(c.work)} – Kaminfeger ${icsText(sweepName(s))}`, `LOCATION:${h.street} ${h.nr}\\, ${h.plz} ${h.ort}`,
      'BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY', 'DESCRIPTION:Kaminfeger kommt in einer Stunde', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    reply.header('Content-Type', 'text/calendar; charset=utf-8').header('Content-Disposition', 'attachment; filename="kaminfeger-termin.ics"');
    return ics;
  });

}
