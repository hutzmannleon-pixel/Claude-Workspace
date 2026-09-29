import { config } from '../config.js';
import { get, all, run, tx } from '../db.js';
import { live } from '../live.js';
import { checkCode, requireUser, startSession, endSession } from '../auth.js';
import { queueMail } from '../mail.js';
import {
  makeLink, readLink, useLink, activeSweepForDistrict, sweepName, initials, campaignForHousehold, windowsOf, freeCount,
  routeFor, routeStarted, householdName
} from '../domain.js';
import { bad, forbidden, notFound, clean, streetKey, nrKey, nowIso, slotsOf, toMin, fmtMin, dayLabel, parseDate, EMAIL_RE, normEmail } from '../util.js';

const LONG = { Mo: 'Montag', Di: 'Dienstag', Mi: 'Mittwoch', Do: 'Donnerstag', Fr: 'Freitag', Sa: 'Samstag', So: 'Sonntag' };
const longDay = label => { const [d, rest] = label.split(', '); return (LONG[d] || d) + ', ' + rest; };

/** Sucht Haushalt/Bezirk zu einer Adresse – nur Bezirke mit aktivem Kaminfeger zählen. */
function lookup({ street, nr, plz }) {
  const sk = streetKey(street), p = clean(plz, 5);
  const candidates = all('SELECT * FROM households WHERE street_key = ? AND plz = ?', sk, p);
  for (const h of candidates) {
    const s = activeSweepForDistrict(h.district_id);
    if (!s) continue;
    const exact = candidates.find(x => x.district_id === h.district_id && nrKey(x.nr) === nrKey(nr)) || null;
    const d = get('SELECT * FROM districts WHERE id = ?', h.district_id);
    return { district: d, sweep: s, household: exact };
  }
  return null;
}

const failed = new Map(); // Fehlversuche Kundennummer je Bewohner

function residentOf(user) {
  const r = get('SELECT * FROM residents WHERE user_id = ?', user.id);
  if (!r) throw notFound('Kein Bewohnerkonto.');
  return r;
}

export default async function customerRoutes(app) {
  app.post('/api/customer/lookup', async req => {
    const b = req.body || {};
    if (clean(b.street).length < 3 || !/^\d{5}$/.test(clean(b.plz))) return { district: null };
    const m = lookup(b);
    if (!m) return { district: null };
    const name = sweepName(m.sweep);
    return { district: { no: m.district.number, kreis: m.district.kreis, sweep: name, ini: initials(name) }, householdFound: !!m.household };
  });

  // Einladung (vom Kaminfeger) oder Mitbewohner-Einladung ansehen
  app.get('/api/customer/invite/:token', async req => {
    const l = readLink('invite', req.params.token) || readLink('member', req.params.token);
    if (!l) throw notFound('Der Einladungslink ist ungültig oder wurde schon benutzt.');
    const h = get('SELECT * FROM households WHERE id = ?', l.ref_id);
    const s = activeSweepForDistrict(h.district_id), d = get('SELECT * FROM districts WHERE id = ?', h.district_id);
    return { kind: l.kind, family: householdName(h), street: h.street, nr: h.nr, plz: h.plz, ort: h.ort, bez: d.number, sweep: sweepName(s), email: l.data?.email || '' };
  });

  app.post('/api/customer/register', async (req, reply) => {
    const b = req.body || {};
    const email = checkCode(b.email, 'customer', 'register', b.code);
    if (get('SELECT 1 x FROM users WHERE email = ? AND role = ?', email, 'customer')) throw bad('Zu dieser E-Mail gibt es schon ein Konto.');
    const link = b.invite ? (readLink('invite', b.invite) || readLink('member', b.invite)) : null;
    if (b.invite && !link) throw bad('Der Einladungslink ist ungültig oder wurde schon benutzt.');
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
      const h = m && m.household;
      run(`INSERT INTO residents (user_id, household_id, family_name, street, nr, plz, ort, status) VALUES (?,?,?,?,?,?,?,?)`,
        uid, h ? h.id : null, name, street, nr, plz, ort, h ? 'needs_verify' : 'unverified');
      return { uid, next: h ? 'verify' : 'done', status: h ? 'needs_verify' : 'unverified', inDistrict: !!m };
    });
    startSession(reply, result.uid, 'customer');
    live.bump();
    return { next: result.next, status: result.status, inDistrict: result.inDistrict ?? true };
  });

  app.post('/api/customer/verify-number', async req => {
    const u = requireUser(req, 'customer'), r = residentOf(u);
    if (r.status !== 'needs_verify' && r.status !== 'review') throw bad('Ihr Wohnsitz ist bereits in Prüfung oder bestätigt.');
    const h = get('SELECT * FROM households WHERE id = ?', r.household_id);
    const n = (failed.get(r.id) || 0);
    if (n >= 5) throw bad('Zu viele Fehlversuche. Bitte lassen Sie Ihren Wohnsitz vom Kaminfeger bestätigen.');
    const norm = v => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!h.customer_no || norm(h.customer_no) !== norm(req.body?.kdnr)) {
      failed.set(r.id, n + 1);
      if (n + 1 >= 3) {
        run(`UPDATE residents SET status = 'review', method = 'number' WHERE id = ?`, r.id);
        live.bump();
      }
      throw bad(n + 1 >= 3
        ? 'Die Kundennummer passt nicht. Wir prüfen Ihre Angaben – oder lassen Sie sich vom Kaminfeger bestätigen.'
        : 'Die Kundennummer passt nicht zu dieser Adresse. Bitte prüfen Sie Ihren Feuerstättenbescheid.', 'kdnr');
    }
    failed.delete(r.id);
    tx(() => {
      run(`UPDATE residents SET status = 'verified', method = 'number', verified_at = ? WHERE id = ?`, nowIso(), r.id);
      run('UPDATE households SET moved_at = NULL WHERE id = ?', h.id);
    });
    live.bump();
    return { ok: true };
  });

  app.post('/api/customer/request-sweep', async req => {
    const u = requireUser(req, 'customer'), r = residentOf(u);
    if (!['needs_verify', 'review'].includes(r.status) || !r.household_id) throw bad('Eine Bestätigung durch den Kaminfeger ist hier nicht möglich.');
    run(`UPDATE residents SET status = 'asked', method = 'sweep' WHERE id = ?`, r.id);
    const h = get('SELECT * FROM households WHERE id = ?', r.household_id), s = activeSweepForDistrict(h.district_id);
    if (s) queueMail({ to: s.email, subject: `Bewohner-Anfrage: ${h.street} ${h.nr}`,
      text: `${r.family_name} möchte Termine für ${h.street} ${h.nr} buchen und bittet Sie zu bestätigen, dass sie dort wohnen. Laut Kehrbuch: ${h.owner_name}.\n\nSie können die Anfrage in Ihrer App bestätigen.`,
      link: `${config.baseUrl}/kaminfeger`, linkLabel: 'App öffnen' });
    live.bump();
    return { ok: true, sweep: sweepName(s) };
  });

  // ---------- App-Zustand ----------
  app.get('/api/customer/state', async req => {
    const u = requireUser(req, 'customer'), r = residentOf(u);
    const h = r.household_id ? get('SELECT * FROM households WHERE id = ?', r.household_id) : null;
    const d = h ? get('SELECT * FROM districts WHERE id = ?', h.district_id) : null;
    const s = h ? activeSweepForDistrict(h.district_id) : null;
    const moved = r.status === 'moved';
    const c = h && !moved ? campaignForHousehold(h) : null;
    let campaign = null, booking = null, houseStatus = 'open', live_ = null, messages = [];
    if (c) {
      const my = get(`SELECT * FROM bookings WHERE campaign_id = ? AND household_id = ? AND status = 'booked'`, c.id, h.id);
      const cancelled = !my && get(`SELECT 1 x FROM bookings WHERE campaign_id = ? AND household_id = ? AND status = 'cancelled'`, c.id, h.id);
      houseStatus = my ? 'booked' : cancelled ? 'cancelled' : 'open';
      const wins = windowsOf(c.id);
      campaign = { id: c.id, street: c.street, slotLen: c.slot_len, deadline: c.deadline, deadlineLabel: dayLabel(c.deadline),
        windows: wins.map(w => {
          const taken = new Set(all(`SELECT time FROM bookings WHERE window_id = ? AND status = 'booked' AND household_id != ?`, w.id, h.id).map(x => x.time));
          return { ...w, free: freeCount(c, w, h.id), slots: slotsOf(w, c.slot_len).map(t => ({ t, taken: taken.has(t) })) };
        }) };
      if (my) {
        const w = wins.find(x => x.id === my.window_id);
        booking = { windowId: my.window_id, t: my.time, end: fmtMin(toMin(my.time) + c.slot_len), key: my.key_note, visit: my.visit, date: w.date, label: w.label, longDate: longDay(w.label) };
        if (routeStarted(h.district_id, w.date)) {
          const route = routeFor(h.district_id, w.date);
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
    const pending = all(`SELECT data FROM tokens WHERE kind = 'member' AND ref_id = ? AND used_at IS NULL AND expires_at > ?`, h ? h.id : -1, nowIso())
      .map(t => JSON.parse(t.data).email).map(e => ({ ini: e.slice(0, 2).toUpperCase(), name: e, sub: 'Einladung gesendet' }));
    return {
      me: { email: u.email },
      resident: { family: r.family_name, street: h ? h.street : r.street, nr: h ? h.nr : r.nr, plz: h ? h.plz : r.plz, ort: h ? h.ort : r.ort,
        status: r.status, method: r.method, isMember: !!r.is_member,
        prefs: { eve: !!r.rem_eve, hour: !!r.rem_hour, push: !!r.ch_push, mail: !!r.ch_mail }, prep: JSON.parse(r.prep || '[]') },
      district: d ? { no: d.number, kreis: d.kreis, sweep: s ? { name: sweepName(s), ini: initials(sweepName(s)), phone: s.phone || '' } : null } : null,
      campaign, booking, houseStatus, live: live_, messages, members: members.concat(pending)
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
    const key = clean(req.body.key, 120) || null;
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
        text: `Ihre Feuerstättenschau ist gebucht:\n\n${longDay(label)} · ${time}–${fmtMin(toMin(time) + c.slot_len)} Uhr\n${h.street} ${h.nr}${key ? `\nSchlüssel bei: ${key}` : ''}\n\nVerschieben oder absagen können Sie bis zum Vortag in der App.`,
        link: `${config.baseUrl}/kunde`, linkLabel: 'Termin ansehen' });
    live.bump();
    return { ok: true };
  });

  app.post('/api/customer/cancel', async req => {
    const u = requireUser(req, 'customer'), r = residentOf(u);
    const h = get('SELECT * FROM households WHERE id = ?', r.household_id);
    const c = h && campaignForHousehold(h);
    const b = c && get(`SELECT * FROM bookings WHERE campaign_id = ? AND household_id = ? AND status = 'booked'`, c.id, h.id);
    if (!b) throw bad('Kein Termin zum Absagen.');
    run(`UPDATE bookings SET status = 'cancelled', updated_at = ? WHERE id = ?`, nowIso(), b.id);
    live.bump();
    return { ok: true };
  });

  app.post('/api/customer/read', async req => {
    const u = requireUser(req, 'customer'), r = residentOf(u);
    if (r.household_id) run(`INSERT OR IGNORE INTO message_reads (message_id, user_id) SELECT message_id, ? FROM message_recipients WHERE household_id = ?`, u.id, r.household_id);
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
    const h = get('SELECT * FROM households WHERE id = ?', r.household_id);
    const l = makeLink('member', h.id, { email, by: r.id }, 14 * 86400000, '/kunde?einladung=');
    queueMail({ to: email, subject: `Einladung: Kaminfeger-Termin für ${h.street} ${h.nr}`,
      text: `${r.family_name} lädt Sie ein, den Termin für die Feuerstättenschau in der ${h.street} ${h.nr} zu sehen und Erinnerungen zu bekommen.\n\nDer Link gilt 14 Tage und nur einmal.`,
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
    const h = get('SELECT * FROM households WHERE id = ?', r.household_id), s = activeSweepForDistrict(h.district_id);
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
    const h = m && m.household;
    run(`UPDATE residents SET household_id = ?, family_name = ?, street = ?, nr = ?, plz = ?, ort = ?, status = ?, method = NULL, is_member = 0, verified_at = NULL, moved_at = NULL, prep = '[]' WHERE id = ?`,
      h ? h.id : null, name, street, nr, plz, ort, h ? 'needs_verify' : 'unverified', r.id);
    failed.delete(r.id);
    live.bump();
    return { next: h ? 'verify' : 'done', status: h ? 'needs_verify' : 'unverified', inDistrict: !!m };
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
    const s = activeSweepForDistrict(h.district_id);
    const dt = (date, t) => { const d = parseDate(date); const [hh, mm] = t.split(':').map(Number); d.setHours(hh, mm); return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); };
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Kaminfeger Verwaltung//DE', 'BEGIN:VEVENT', `UID:kf-${b.id}@kaminfeger-termine`,
      `DTSTAMP:${dt(b.date, b.time)}`, `DTSTART:${dt(b.date, b.time)}`, `DTEND:${dt(b.date, fmtMin(toMin(b.time) + c.slot_len))}`,
      `SUMMARY:Feuerstättenschau – Kaminfeger ${sweepName(s)}`, `LOCATION:${h.street} ${h.nr}\\, ${h.plz} ${h.ort}`,
      'BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY', 'DESCRIPTION:Kaminfeger kommt in einer Stunde', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    reply.header('Content-Type', 'text/calendar; charset=utf-8').header('Content-Disposition', 'attachment; filename="kaminfeger-termin.ics"');
    return ics;
  });

}
