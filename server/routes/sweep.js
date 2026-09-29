import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { config } from '../config.js';
import { get, all, run, tx } from '../db.js';
import { live } from '../live.js';
import { checkCode, requireUser, startSession, endSession } from '../auth.js';
import { queueMail } from '../mail.js';
import {
  makeLink, sweepByUser, activeSweepForDistrict, sweepName, initials, windowsOf, houseRows, campaignsOfDistrict, validateWindows,
  routeFor, routeStarted, routeDates, defaultRouteDate, postMessage, householdEmails, householdName, adminLog, streetHouseholds
} from '../domain.js';
import {
  bad, forbidden, notFound, clean, randomToken, streetKey, nrKey, nameKey, nowIso, today, dayLabel, slotsOf, parseCsv, pick, EMAIL_RE, normEmail, DATE_RE
} from '../util.js';

const MIME = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/heic': '.heic' };
const uploadDir = path.join(config.dataDir, 'uploads');

function mySweep(req) {
  const u = requireUser(req, 'sweep');
  const s = sweepByUser(u.id);
  if (!s) throw notFound('Kein Kaminfeger-Konto.');
  return s;
}
function activeSweep(req) {
  const s = mySweep(req);
  if (s.status !== 'active') throw forbidden('Ihr Bezirk ist noch nicht freigeschaltet.');
  return s;
}
const ownCampaign = (s, id) => {
  const c = get('SELECT * FROM campaigns WHERE id = ? AND district_id = ?', Number(id), s.district_id);
  if (!c) throw notFound('Straße nicht gefunden.');
  return c;
};
const plural = n => n + (n === 1 ? ' Haushalt' : ' Haushalte');

/** Namensabgleich mit dem Bezirksverzeichnis: exakt, teilweise (z. B. Doppelname) oder gar nicht. */
function nameMatch(first, last, holder) {
  const a = nameKey(first + last), b = nameKey(holder);
  if (a === b) return 'exact';
  const parts = String(holder).toLowerCase().split(/[\s-]+/).map(nameKey);
  if (parts.includes(nameKey(last)) && parts.includes(nameKey(first))) return 'partial';
  return 'none';
}

export function deleteDocuments(sweepId) {
  for (const d of all('SELECT * FROM documents WHERE sweep_id = ?', sweepId)) fs.rmSync(path.join(uploadDir, d.stored), { force: true });
  run('DELETE FROM documents WHERE sweep_id = ?', sweepId);
}

export default async function sweepRoutes(app) {
  // ---------- Registrierung ----------
  app.post('/api/sweep/register', async (req, reply) => {
    const b = req.body || {};
    const first = clean(b.first, 60), last = clean(b.last, 60), bstreet = clean(b.bstreet), bplz = clean(b.bplz, 5), bort = clean(b.bort), phone = clean(b.phone, 30);
    if (!first || !last || !bstreet || !/^\d{5}$/.test(bplz) || !bort) throw bad('Bitte alle Felder ausfüllen.');
    const email = checkCode(b.email, 'sweep', 'register', b.code);
    const uid = tx(() => {
      if (get('SELECT 1 x FROM users WHERE email = ? AND role = ?', email, 'sweep')) throw bad('Zu dieser E-Mail gibt es schon ein Konto.');
      const id = Number(run('INSERT INTO users (email, role) VALUES (?,?)', email, 'sweep').lastInsertRowid);
      run('INSERT INTO sweeps (user_id, first, last, phone, bstreet, bplz, bort) VALUES (?,?,?,?,?,?,?)', id, first, last, phone || null, bstreet, bplz, bort);
      return id;
    });
    startSession(reply, uid, 'sweep');
    return { ok: true };
  });

  app.get('/api/sweep/me', async req => {
    const s = mySweep(req);
    const docs = Object.fromEntries(['urkunde', 'ausweis'].map(k => {
      const d = get('SELECT filename, size FROM documents WHERE sweep_id = ? AND kind = ?', s.id, k);
      return [k, d ? { name: d.filename, size: d.size } : null];
    }));
    const counts = s.district_id ? get(`SELECT COUNT(*) n, COUNT(DISTINCT street_key || plz) st FROM households WHERE district_id = ?`, s.district_id) : { n: 0, st: 0 };
    return {
      email: s.email, first: s.first, last: s.last, phone: s.phone, bstreet: s.bstreet, bplz: s.bplz, bort: s.bort,
      status: s.status, rejectReason: s.reject_reason,
      district: s.district_id ? { land: s.land, kreis: s.kreis, bez: s.bez, holder: s.holder_name, until: s.appointed_until, officialEmail: s.official_email, households: counts.n, streets: counts.st } : null,
      docs
    };
  });

  app.post('/api/sweep/district', async req => {
    const s = mySweep(req);
    if (!['draft', 'rejected'].includes(s.status)) throw bad('Der Bezirk kann jetzt nicht mehr geändert werden.');
    const b = req.body || {};
    const bez = clean(b.bez, 10).replace(/^0+(?=\d)/, '');
    const d = get('SELECT * FROM districts WHERE land = ? AND kreis = ? AND ltrim(number, \'0\') = ?', clean(b.land), clean(b.kreis), bez);
    if (!d) return { result: 'unknown' };
    const other = activeSweepForDistrict(d.id);
    if (other && other.id !== s.id) return { result: 'taken' };
    const m = nameMatch(s.first, s.last, d.holder_name);
    if (m === 'none') { run('UPDATE sweeps SET district_id = NULL WHERE id = ?', s.id); return { result: 'other' }; }
    run('UPDATE sweeps SET district_id = ? WHERE id = ?', d.id, s.id);
    return { result: 'ok', exact: m === 'exact', info: { kreis: d.kreis, bez: d.number, holder: d.holder_name, until: d.appointed_until } };
  });

  app.post('/api/sweep/documents/:kind', async req => {
    const s = mySweep(req), kind = req.params.kind;
    if (!['urkunde', 'ausweis'].includes(kind)) throw bad('Unbekanntes Dokument.');
    if (!['draft', 'rejected'].includes(s.status)) throw bad('Unterlagen können jetzt nicht geändert werden.');
    const file = await req.file({ limits: { fileSize: config.uploadMaxBytes, files: 1 } });
    if (!file) throw bad('Keine Datei.');
    const ext = MIME[file.mimetype];
    if (!ext) { file.file.resume(); throw bad('Bitte als PDF oder Foto (JPG, PNG, HEIC) hochladen.'); }
    const stored = randomToken(18) + ext, dest = path.join(uploadDir, stored);
    await pipeline(file.file, fs.createWriteStream(dest, { mode: 0o600 }));
    if (file.file.truncated) { fs.rmSync(dest, { force: true }); throw bad('Die Datei ist größer als 10 MB.'); }
    const size = fs.statSync(dest).size;
    const old = get('SELECT stored FROM documents WHERE sweep_id = ? AND kind = ?', s.id, kind);
    if (old) fs.rmSync(path.join(uploadDir, old.stored), { force: true });
    run(`INSERT INTO documents (sweep_id, kind, filename, stored, mime, size) VALUES (?,?,?,?,?,?)
      ON CONFLICT (sweep_id, kind) DO UPDATE SET filename = excluded.filename, stored = excluded.stored, mime = excluded.mime, size = excluded.size, uploaded_at = datetime('now')`,
      s.id, kind, clean(file.filename, 120) || kind + ext, stored, file.mimetype, size);
    return { ok: true, name: clean(file.filename, 120), size };
  });

  app.delete('/api/sweep/documents/:kind', async req => {
    const s = mySweep(req);
    if (!['draft', 'rejected'].includes(s.status)) throw bad('Unterlagen können jetzt nicht geändert werden.');
    const d = get('SELECT * FROM documents WHERE sweep_id = ? AND kind = ?', s.id, req.params.kind);
    if (d) { fs.rmSync(path.join(uploadDir, d.stored), { force: true }); run('DELETE FROM documents WHERE id = ?', d.id); }
    return { ok: true };
  });

  app.post('/api/sweep/submit', async req => {
    const s = mySweep(req);
    if (!['draft', 'rejected'].includes(s.status)) throw bad('Bereits eingereicht.');
    if (!req.body?.assure) throw bad('Bitte die Erklärung bestätigen.');
    if (!s.district_id) throw bad('Bitte zuerst den Bezirk angeben.');
    const n = get('SELECT COUNT(*) n FROM documents WHERE sweep_id = ?', s.id).n;
    if (n < 2) throw bad('Bitte Bestellungsurkunde und Ausweis hochladen.');
    run(`UPDATE sweeps SET status = 'pending', reject_reason = NULL, submitted_at = ? WHERE id = ?`, nowIso(), s.id);
    for (const a of config.adminEmails) queueMail({ to: a, subject: `Neue Prüfung: ${sweepName(s)} · Bezirk ${s.bez}`,
      text: `${sweepName(s)} hat Unterlagen für den Kehrbezirk ${s.kreis} ${s.bez} eingereicht.`, link: `${config.baseUrl}/betreiber`, linkLabel: 'Prüfung öffnen' });
    live.bump();
    return { ok: true };
  });

  app.post('/api/sweep/logout', async (req, reply) => { endSession(req, reply, 'sweep'); return { ok: true }; });

  // Konto löschen (DSGVO / Play Store). Kehrbuch und Zeitfenster bleiben beim Bezirk, bis ein Nachfolger sie übernimmt.
  app.post('/api/sweep/delete', async (req, reply) => {
    const s = mySweep(req);
    if (req.body?.confirm !== 'LÖSCHEN') throw bad('Bitte zur Bestätigung LÖSCHEN eingeben.');
    tx(() => {
      deleteDocuments(s.id);
      run('DELETE FROM messages WHERE sweep_id = ?', s.id);
      run('DELETE FROM sweeps WHERE id = ?', s.id);
      run('DELETE FROM users WHERE id = ?', s.user_id);
      adminLog('System', `Kaminfeger-Konto gelöscht${s.bez ? ' · Bezirk ' + s.bez : ''}`, 'Auf Wunsch des Nutzers, inkl. Dokumente');
    });
    endSession(req, reply, 'sweep');
    live.bump();
    return { ok: true };
  });

  // ---------- Kehrbuch importieren ----------
  app.post('/api/sweep/kehrbuch', async req => {
    const s = activeSweep(req);
    const file = await req.file({ limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
    if (!file) throw bad('Keine Datei.');
    const rows = parseCsv((await file.toBuffer()).toString('utf8'));
    if (!rows.length) throw bad('Die Datei ist leer oder hat keine Kopfzeile.');
    let added = 0, updated = 0; const errors = [];
    tx(() => {
      rows.forEach((r, i) => {
        const street = pick(r, 'strasse', 'str', 'street'), nr = pick(r, 'hausnummer', 'nr', 'hausnr'), plz = pick(r, 'plz', 'postleitzahl'), ort = pick(r, 'ort', 'stadt', 'gemeinde');
        const owner = pick(r, 'eigentuemer', 'name', 'eigentuemername', 'kunde'), kdnr = pick(r, 'kundennummer', 'kdnr', 'kundennr');
        const email = normEmail(pick(r, 'email', 'mail', 'emailadresse')), phone = pick(r, 'telefon', 'tel', 'phone');
        if (!street || !nr || !/^\d{5}$/.test(plz) || !owner) { errors.push(`Zeile ${i + 2}: Straße, Hausnummer, PLZ oder Name fehlt`); return; }
        const key = streetKey(street);
        const ex = get('SELECT id FROM households WHERE district_id = ? AND street_key = ? AND plz = ? AND nr = ?', s.district_id, key, plz, nr);
        if (ex) {
          run('UPDATE households SET street = ?, ort = ?, owner_name = ?, customer_no = ?, email = ?, phone = ? WHERE id = ?', street, ort, owner, kdnr || null, EMAIL_RE.test(email) ? email : null, phone || null, ex.id);
          updated++;
        } else {
          run('INSERT INTO households (district_id, street, street_key, nr, plz, ort, owner_name, customer_no, email, phone) VALUES (?,?,?,?,?,?,?,?,?,?)',
            s.district_id, street, key, nr, plz, ort, owner, kdnr || null, EMAIL_RE.test(email) ? email : null, phone || null);
          added++;
        }
      });
    });
    // Bewohner, die sich vorher ohne teilnehmenden Kaminfeger registriert haben, jetzt zuordnen
    for (const r of all(`SELECT r.*, u.email FROM residents r JOIN users u ON u.id = r.user_id WHERE r.status = 'unverified'`)) {
      const h = all('SELECT * FROM households WHERE district_id = ? AND street_key = ? AND plz = ?', s.district_id, streetKey(r.street), r.plz).find(x => nrKey(x.nr) === nrKey(r.nr));
      if (!h) continue;
      run(`UPDATE residents SET household_id = ?, status = 'needs_verify' WHERE id = ?`, h.id, r.id);
      queueMail({ to: r.email, subject: 'Ihr Kaminfeger ist jetzt dabei', text: `${sweepName(s)} nutzt Kaminfeger Verwaltung jetzt auch für die ${h.street}. Bestätigen Sie in der App kurz Ihren Wohnsitz – dann können Sie Termine buchen.`,
        link: `${config.baseUrl}/kunde`, linkLabel: 'Wohnsitz bestätigen' });
    }
    live.bump();
    return { added, updated, errors: errors.slice(0, 20), errorCount: errors.length };
  });

  // ---------- Übersicht ----------
  app.get('/api/sweep/overview', async req => {
    const s = activeSweep(req);
    const groups = all(`SELECT street, street_key, plz, COUNT(*) n FROM households WHERE district_id = ? GROUP BY street_key, plz ORDER BY street`, s.district_id);
    const camps = campaignsOfDistrict(s.district_id);
    const streets = groups.map(g => {
      const c = camps.find(x => x.street_key === g.street_key && x.plz === g.plz);
      if (!c) return { street: g.street, plz: g.plz, households: g.n, campaign: null };
      const rows = houseRows(c);
      const booked = rows.filter(r => r.status === 'booked').length, cancelled = rows.filter(r => r.status === 'cancelled').length;
      const visited = rows.filter(r => r.booking && r.booking.visit === 'done').length, missed = rows.filter(r => r.booking && r.booking.visit === 'missed').length;
      const done = rows.length > 0 && rows.every(r => r.moved || (r.booking && r.booking.visit === 'done'));
      return { street: g.street, plz: g.plz, households: g.n,
        campaign: { id: c.id, booked, open: rows.length - booked - cancelled, cancelled, total: rows.length, visited, missed, done,
          windows: windowsOf(c.id).map(w => w.label.split(', ')[1]) } };
    });
    const date = defaultRouteDate(s.district_id), route = routeFor(s.district_id, date);
    const tenants = all(`SELECT r.id, r.family_name, h.street, h.nr, h.owner_name FROM residents r JOIN households h ON h.id = r.household_id
      WHERE h.district_id = ? AND r.status = 'asked' ORDER BY r.id`, s.district_id).map(t => ({ id: t.id, name: t.family_name, street: t.street, nr: t.nr, owner: t.owner_name }));
    const hh = get('SELECT COUNT(*) n FROM households WHERE district_id = ?', s.district_id).n;
    // Für die Glocke: Absagen der Bewohner der letzten 14 Tage (Bewohner-Anfragen kommen über tenants)
    const alerts = all(`SELECT b.id, b.updated_at, b.time, w.date, h.id hid, h.street, h.nr, h.owner_name, c.id cid FROM bookings b
      JOIN campaigns c ON c.id = b.campaign_id JOIN windows w ON w.id = b.window_id JOIN households h ON h.id = b.household_id
      WHERE c.district_id = ? AND b.status = 'cancelled' AND b.updated_at > datetime('now','-14 days') ORDER BY b.updated_at DESC LIMIT 30`, s.district_id)
      .map(a => ({ id: 'c' + a.id, at: a.updated_at.replace(' ', 'T') + 'Z', campaignId: a.cid,
        text: `Familie ${householdName({ id: a.hid, owner_name: a.owner_name })}, ${a.street} ${a.nr} hat den Termin am ${dayLabel(a.date)}, ${a.time} Uhr abgesagt.` }));
    return {
      name: sweepName(s), first: s.first, ini: initials(sweepName(s)), bez: s.bez, kreis: s.kreis,
      today: { date, label: dayLabel(date), isToday: date === today(), count: route.length, from: route[0]?.t || null, to: route[route.length - 1]?.end || null,
        streets: [...new Set(route.map(r => r.street))] },
      streets, tenants, households: hh, alerts
    };
  });

  // Alle Haushalte des Bezirks mit Terminstatus (Kundenliste mit Suche)
  app.get('/api/sweep/customers', async req => {
    const s = activeSweep(req);
    const byStreet = new Map();
    for (const c of campaignsOfDistrict(s.district_id)) {
      const k = c.street_key + '|' + c.plz;
      if (byStreet.has(k)) continue;
      const wins = new Map(windowsOf(c.id).map(w => [w.id, w]));
      byStreet.set(k, { c, rows: new Map(houseRows(c).map(r => [r.id, r])), wins });
    }
    const hs = all('SELECT * FROM households WHERE district_id = ? ORDER BY street, CAST(nr AS INTEGER), nr', s.district_id);
    return { customers: hs.map(h => {
      const g = byStreet.get(h.street_key + '|' + h.plz), r = g?.rows.get(h.id);
      let status = 'none', line = 'Noch keine Zeitfenster';
      if (h.moved_at) { status = 'moved'; line = 'Ausgezogen'; }
      else if (r) {
        const w = r.booking && g.wins.get(r.booking.windowId);
        if (r.booking?.visit === 'done') { status = 'done'; line = 'Feuerstättenschau erledigt'; }
        else if (r.booking?.visit === 'missed') { status = 'missed'; line = 'Nicht angetroffen'; }
        else if (r.status === 'booked') { status = 'booked'; line = `${w ? w.label : ''} · ${r.booking.t} Uhr`; }
        else if (r.status === 'cancelled') { status = 'cancelled'; line = 'Hat abgesagt'; }
        else { status = 'open'; line = 'Keine Rückmeldung'; }
      }
      return { id: h.id, name: householdName(h), street: h.street, nr: h.nr, plz: h.plz, ort: h.ort, phone: h.phone || '', status, line, campaignId: g?.c.id || null };
    }) };
  });

  app.get('/api/sweep/campaigns/:id', async req => {
    const s = activeSweep(req), c = ownCampaign(s, req.params.id);
    const rows = houseRows(c), wins = windowsOf(c.id);
    return { id: c.id, street: c.street, plz: c.plz, slotLen: c.slot_len, deadline: c.deadline, deadlineLabel: dayLabel(c.deadline),
      windows: wins.map(w => { const total = slotsOf(w, c.slot_len).length, booked = rows.filter(r => r.booking && r.booking.windowId === w.id).length; return { ...w, total, booked }; }),
      houses: rows };
  });

  // Anlegen oder ändern – danach werden die Haushalte benachrichtigt
  app.post('/api/sweep/campaigns', async req => {
    const s = activeSweep(req), b = req.body || {};
    const slotLen = Number(b.slotLen), deadline = clean(b.deadline, 10);
    validateWindows(b.windows, slotLen);
    if (!DATE_RE.test(deadline)) throw bad('Bitte eine Antwortfrist angeben.');
    let c = b.id ? ownCampaign(s, b.id) : null;
    const street = c ? c.street : clean(b.street), plz = c ? c.plz : clean(b.plz, 5);
    const hs = streetHouseholds({ district_id: s.district_id, street_key: streetKey(street), plz });
    if (!hs.length) throw bad('Diese Straße steht nicht in Ihrem Kehrbuch.');
    const dropped = [];
    const result = tx(() => {
      if (!c) {
        const id = Number(run('INSERT INTO campaigns (district_id, street, street_key, plz, slot_len, deadline, sent_at) VALUES (?,?,?,?,?,?,?)',
          s.district_id, street, streetKey(street), plz, slotLen, deadline, nowIso()).lastInsertRowid);
        for (const w of b.windows) run('INSERT INTO windows (campaign_id, date, start, end) VALUES (?,?,?,?)', id, w.date, w.start, w.end);
        return { id, created: true };
      }
      run('UPDATE campaigns SET slot_len = ?, deadline = ?, sent_at = ? WHERE id = ?', slotLen, deadline, nowIso(), c.id);
      const keep = new Set();
      for (const w of b.windows) {
        const ex = w.id && get('SELECT id FROM windows WHERE id = ? AND campaign_id = ?', Number(w.id), c.id);
        if (ex) { run('UPDATE windows SET date = ?, start = ?, end = ? WHERE id = ?', w.date, w.start, w.end, ex.id); keep.add(ex.id); }
        else keep.add(Number(run('INSERT INTO windows (campaign_id, date, start, end) VALUES (?,?,?,?)', c.id, w.date, w.start, w.end).lastInsertRowid));
      }
      // Buchungen, die nicht mehr in ein Fenster passen, werden freigegeben – die Haushalte wählen neu
      for (const bk of all(`SELECT b.*, w.start, w.end FROM bookings b LEFT JOIN windows w ON w.id = b.window_id WHERE b.campaign_id = ? AND b.status = 'booked'`, c.id)) {
        const fits = keep.has(bk.window_id) && slotsOf(get('SELECT * FROM windows WHERE id = ?', bk.window_id), slotLen).includes(bk.time);
        if (!fits && !bk.visit) { run(`UPDATE bookings SET status = 'dropped', updated_at = ? WHERE id = ?`, nowIso(), bk.id); dropped.push(bk.household_id); }
      }
      for (const w of all('SELECT id FROM windows WHERE campaign_id = ?', c.id)) if (!keep.has(w.id)) {
        if (get(`SELECT 1 x FROM bookings WHERE window_id = ? AND visit IS NOT NULL`, w.id)) throw bad('Ein Fenster mit bereits besuchten Häusern kann nicht gelöscht werden.');
        run('DELETE FROM windows WHERE id = ?', w.id);
      }
      return { id: c.id, created: false };
    });
    c = get('SELECT * FROM campaigns WHERE id = ?', result.id);
    const wins = windowsOf(c.id);
    const winText = wins.map(w => `${w.label} ${w.start}–${w.end}`).join(', ');
    const text = result.created
      ? `Guten Tag! Ich komme zur Feuerstättenschau in die ${street}: ${winText}. Bitte wählen Sie bis ${dayLabel(deadline)} eine Zeit, in der jemand zu Hause ist.`
      : `Neue Zeitfenster für die ${street}: ${winText}. Bitte wählen Sie bis ${dayLabel(deadline)} Ihre Zeit in der App.`;
    postMessage(s.id, c.id, text, hs.map(h => h.id));
    if (dropped.length) postMessage(s.id, c.id, 'Ihr bisheriger Termin passt leider nicht mehr in die neuen Zeitfenster. Bitte wählen Sie in der App eine neue Zeit.', dropped);
    for (const h of hs) {
      const mails = householdEmails(h.id);
      const again = dropped.includes(h.id);
      if (mails.length) for (const to of mails) queueMail({ to, subject: again ? 'Bitte neue Zeit wählen' : `Zeitfenster für die ${street}`,
        text: again ? `${text}\n\nIhr bisheriger Termin passt leider nicht mehr. Bitte wählen Sie eine neue Zeit.` : text, link: `${config.baseUrl}/kunde`, linkLabel: 'Zeit wählen' });
      else if (h.email && !h.moved_at && !get(`SELECT 1 x FROM residents WHERE household_id = ? AND status NOT IN ('moved','rejected','dismissed')`, h.id)) {
        // Einladung an die E-Mail aus dem Kehrbuch – bestätigt zugleich den Wohnsitz
        const l = makeLink('invite', h.id, null, 30 * 86400000, '/kunde?einladung=');
        queueMail({ to: h.email, subject: 'Einladung: Termin für die Feuerstättenschau wählen',
          text: `Guten Tag ${householdName(h) ? 'Familie ' + householdName(h) : ''}, ich komme zur Feuerstättenschau in die ${h.street} ${h.nr}: ${winText}.\n\nBitte wählen Sie bis ${dayLabel(deadline)} Ihre Zeit in der App. Mit dem Link ist Ihre Adresse sofort bestätigt.\n\nIhr Kaminfeger ${sweepName(s)}`,
          link: l.url, linkLabel: 'Einladung annehmen' });
      }
    }
    live.bump();
    return { id: c.id, households: hs.length, dropped: dropped.length };
  });

  // Telefonisch vereinbarte Zeit eintragen
  app.post('/api/sweep/bookings', async req => {
    const s = activeSweep(req), b = req.body || {};
    const c = ownCampaign(s, b.campaignId);
    const h = get('SELECT * FROM households WHERE id = ? AND district_id = ?', Number(b.householdId), s.district_id);
    const w = get('SELECT * FROM windows WHERE id = ? AND campaign_id = ?', Number(b.windowId), c.id);
    if (!h || !w || !slotsOf(w, c.slot_len).includes(b.time)) throw bad('Ungültige Zeit.');
    try {
      tx(() => {
        const old = get(`SELECT * FROM bookings WHERE campaign_id = ? AND household_id = ? AND status = 'booked'`, c.id, h.id);
        if (old) run(`UPDATE bookings SET status = ?, updated_at = ? WHERE id = ?`, old.visit === 'missed' ? 'missed' : 'replaced', nowIso(), old.id);
        run(`INSERT INTO bookings (campaign_id, household_id, window_id, time, source) VALUES (?,?,?,?,'phone')`, c.id, h.id, w.id, b.time);
      });
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) throw bad('Diese Zeit ist schon vergeben.');
      throw e;
    }
    for (const to of householdEmails(h.id)) queueMail({ to, subject: `Termin eingetragen: ${dayLabel(w.date)}, ${b.time} Uhr`,
      text: `Wie telefonisch vereinbart, komme ich am ${dayLabel(w.date)} um ${b.time} Uhr zur Feuerstättenschau in die ${h.street} ${h.nr}.\n\nIhr Kaminfeger ${sweepName(s)}` });
    live.bump();
    return { ok: true };
  });

  // ---------- Termine absagen / verschieben (durch den Kaminfeger) ----------
  const reasonText = r => { const t = clean(r, 300); return t ? ` Grund: ${t}.` : ''; };
  function notify(s, c, householdIds, subject, text, linkLabel = 'In der App ansehen') {
    postMessage(s.id, c.id, text, householdIds);
    for (const h of new Set(householdIds)) for (const to of householdEmails(h))
      queueMail({ to, subject, text: `${text}\n\nIhr Kaminfeger ${sweepName(s)}`, link: `${config.baseUrl}/kunde`, linkLabel });
  }
  function ownBooking(s, id) {
    const b = get(`SELECT b.*, w.date, h.street, h.nr FROM bookings b JOIN windows w ON w.id = b.window_id JOIN households h ON h.id = b.household_id WHERE b.id = ? AND b.status = 'booked'`, Number(id));
    if (!b) throw notFound('Termin nicht gefunden.');
    const c = ownCampaign(s, b.campaign_id);
    if (b.visit) throw bad('Dieser Termin ist schon erledigt.');
    return { b, c };
  }

  // Einzelnen Termin auf einen anderen freien Slot legen – der Haushalt wird informiert und kann selbst wieder ändern
  app.post('/api/sweep/bookings/:id/move', async req => {
    const s = activeSweep(req), { b, c } = ownBooking(s, req.params.id), body = req.body || {};
    const w = get('SELECT * FROM windows WHERE id = ? AND campaign_id = ?', Number(body.windowId), c.id);
    if (!w || !slotsOf(w, c.slot_len).includes(body.time)) throw bad('Ungültige Zeit.');
    if (w.id === b.window_id && body.time === b.time) throw bad('Das ist bereits die gebuchte Zeit.');
    try {
      tx(() => {
        run(`UPDATE bookings SET status = 'replaced', updated_at = ? WHERE id = ?`, nowIso(), b.id);
        run(`INSERT INTO bookings (campaign_id, household_id, window_id, time, key_note, source) VALUES (?,?,?,?,?,?)`, c.id, b.household_id, w.id, body.time, b.key_note, b.source);
      });
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) throw bad('Diese Zeit ist schon vergeben.');
      throw e;
    }
    notify(s, c, [b.household_id], `Termin verschoben: ${dayLabel(w.date)}, ${body.time} Uhr`,
      `Ich muss Ihren Termin verschieben: statt ${dayLabel(b.date)}, ${b.time} Uhr komme ich am ${dayLabel(w.date)} um ${body.time} Uhr in die ${b.street} ${b.nr}.${reasonText(body.reason)} Passt das nicht, wählen Sie in der App eine andere Zeit.`);
    live.bump();
    return { ok: true, toast: `Termin auf ${dayLabel(w.date)}, ${body.time} verschoben – Haushalt informiert.` };
  });

  // Einzelnen Termin absagen – der Haushalt wählt neu
  app.post('/api/sweep/bookings/:id/cancel', async req => {
    const s = activeSweep(req), { b, c } = ownBooking(s, req.params.id);
    run(`UPDATE bookings SET status = 'dropped', updated_at = ? WHERE id = ?`, nowIso(), b.id);
    notify(s, c, [b.household_id], 'Termin abgesagt – bitte neue Zeit wählen',
      `Leider muss ich Ihren Termin am ${dayLabel(b.date)} um ${b.time} Uhr absagen.${reasonText(req.body?.reason)} Bitte wählen Sie in der App eine neue Zeit.`, 'Neue Zeit wählen');
    live.bump();
    return { ok: true, toast: 'Termin abgesagt – der Haushalt wählt neu.' };
  });

  // Einen Tag (Zeitfenster) absagen. Alle Termine darin werden freigegeben.
  // Ist es der einzige Tag der Straße, muss ein Ersatztag angegeben werden (das Fenster wandert dorthin).
  app.post('/api/sweep/windows/:id/cancel', async req => {
    const s = activeSweep(req), body = req.body || {};
    const w = get('SELECT * FROM windows WHERE id = ?', Number(req.params.id));
    if (!w) throw notFound('Zeitfenster nicht gefunden.');
    const c = ownCampaign(s, w.campaign_id);
    if (get(`SELECT 1 x FROM bookings WHERE window_id = ? AND visit IS NOT NULL`, w.id)) throw bad('An diesem Tag wurden schon Häuser besucht – er kann nicht mehr abgesagt werden.');
    const others = get('SELECT COUNT(*) n FROM windows WHERE campaign_id = ? AND id != ?', c.id, w.id).n;
    const date = body.date ? clean(body.date, 10) : null;
    if (date) {
      if (!DATE_RE.test(date) || date <= today()) throw bad('Bitte einen Ersatztag in der Zukunft wählen.');
      if (new Date(date + 'T12:00:00').getDay() === 0) throw bad('Sonntags sind keine Termine möglich.');
      if (get('SELECT 1 x FROM windows WHERE campaign_id = ? AND date = ? AND id != ?', c.id, date, w.id)) throw bad('An diesem Tag gibt es schon ein Zeitfenster.');
    } else if (!others) throw bad('Das ist der einzige Tag dieser Straße – bitte einen Ersatztag wählen.');
    const hit = all(`SELECT household_id FROM bookings WHERE window_id = ? AND status = 'booked'`, w.id).map(r => r.household_id);
    tx(() => {
      run(`UPDATE bookings SET status = 'dropped', updated_at = ? WHERE window_id = ? AND status = 'booked'`, nowIso(), w.id);
      if (date) {
        run('UPDATE windows SET date = ? WHERE id = ?', date, w.id);
        // Antwortfrist darf nicht nach dem ersten Termintag liegen
        const firstDay = get('SELECT MIN(date) d FROM windows WHERE campaign_id = ?', c.id).d;
        if (c.deadline >= firstDay) { const d = new Date(firstDay + 'T12:00:00'); d.setDate(d.getDate() - 1); run('UPDATE campaigns SET deadline = ? WHERE id = ?', d.toISOString().slice(0, 10), c.id); }
      }
      else run('DELETE FROM windows WHERE id = ?', w.id);
    });
    const alt = windowsOf(c.id).map(x => `${x.label} ${x.start}–${x.end}`).join(', ');
    if (hit.length) notify(s, c, hit, `Termin am ${dayLabel(w.date)} abgesagt – bitte neue Zeit wählen`,
      `Leider muss ich den ${dayLabel(w.date)} in der ${c.street} absagen, Ihr Termin an diesem Tag entfällt.${reasonText(body.reason)} Bitte wählen Sie in der App eine neue Zeit – möglich sind: ${alt}.`, 'Neue Zeit wählen');
    // Wer noch nicht gebucht hat, erfährt nur von der Änderung der Auswahl
    const open = streetHouseholds(c).map(h => h.id).filter(id => !hit.includes(id) && !get(`SELECT 1 x FROM bookings WHERE campaign_id = ? AND household_id = ? AND status = 'booked'`, c.id, id));
    if (open.length) postMessage(s.id, c.id, `Der ${dayLabel(w.date)} fällt aus.${reasonText(body.reason)} Wählbar sind jetzt: ${alt}.`, open);
    live.bump();
    return { ok: true, affected: hit.length, toast: `${dayLabel(w.date)} abgesagt${date ? ', Ersatztag ' + dayLabel(date) : ''} – ${hit.length === 1 ? '1 Haushalt' : hit.length + ' Haushalte'} informiert.` };
  });

  // ---------- Tagesroute ----------
  app.get('/api/sweep/route', async req => {
    const s = activeSweep(req);
    const date = DATE_RE.test(req.query.date || '') ? req.query.date : defaultRouteDate(s.district_id);
    const stops = routeFor(s.district_id, date);
    return { date, label: dayLabel(date), isToday: date === today(), started: routeStarted(s.district_id, date),
      dates: routeDates(s.district_id).map(d => ({ date: d, label: dayLabel(d) })), stops, streets: [...new Set(stops.map(x => x.street))], canStartFuture: config.testMode || config.allowEarlyRoute };
  });

  app.post('/api/sweep/route/start', async req => {
    const s = activeSweep(req), date = String(req.body?.date || '');
    if (!DATE_RE.test(date)) throw bad('Ungültiges Datum.');
    if (date > today() && !config.testMode && !config.allowEarlyRoute) throw bad('Die Route kann erst am Termintag gestartet werden.');
    run('INSERT OR IGNORE INTO route_days (district_id, date, started_at) VALUES (?,?,?)', s.district_id, date, nowIso());
    live.bump();
    return { ok: true };
  });

  app.post('/api/sweep/visit', async req => {
    const s = activeSweep(req), { bookingId, result } = req.body || {};
    if (!['done', 'missed'].includes(result)) throw bad('Ungültig.');
    const b = get(`SELECT b.*, w.date, h.street, h.nr FROM bookings b JOIN campaigns c ON c.id = b.campaign_id JOIN windows w ON w.id = b.window_id JOIN households h ON h.id = b.household_id
      WHERE b.id = ? AND c.district_id = ? AND b.status = 'booked'`, Number(bookingId), s.district_id);
    if (!b) throw notFound('Termin nicht gefunden.');
    if (!routeStarted(s.district_id, b.date)) throw bad('Bitte zuerst die Route starten.');
    run('UPDATE bookings SET visit = ?, updated_at = ? WHERE id = ?', result, nowIso(), b.id);
    if (result === 'missed') {
      const text = `Ich war um ${b.time} Uhr bei Ihnen, leider hat niemand geöffnet. Bitte wählen Sie in der App eine neue Zeit.`;
      postMessage(s.id, b.campaign_id, text, [b.household_id]);
      for (const to of householdEmails(b.household_id)) queueMail({ to, subject: 'Sie wurden nicht angetroffen', text, link: `${config.baseUrl}/kunde`, linkLabel: 'Neue Zeit wählen' });
    }
    live.bump();
    return { ok: true };
  });

  // ---------- Nachrichten ----------
  function recipients(s, c) {
    const rows = houseRows(c);
    const date = defaultRouteDate(s.district_id);
    const route = routeFor(s.district_id, date).filter(r => r.campaignId === c.id && !r.visit).map(r => r.householdId);
    return {
      all: rows.filter(r => !r.moved).map(r => r.id),
      open: rows.filter(r => !r.moved && (r.status !== 'booked' || r.booking.visit === 'missed')).map(r => r.id),
      route
    };
  }
  app.get('/api/sweep/messages', async req => {
    const s = activeSweep(req);
    const camps = campaignsOfDistrict(s.district_id).map(c => { const r = recipients(s, c); return { id: c.id, street: c.street, deadline: c.deadline, deadlineLabel: dayLabel(c.deadline), n: { all: r.all.length, open: r.open.length, route: r.route.length } }; });
    const sent = all(`SELECT m.*, c.street, (SELECT COUNT(*) FROM message_recipients r WHERE r.message_id = m.id) n FROM messages m LEFT JOIN campaigns c ON c.id = m.campaign_id WHERE m.sweep_id = ? ORDER BY m.id DESC LIMIT 50`, s.id)
      .map(m => ({ id: m.id, text: m.text, at: m.created_at, n: m.n, street: m.street }));
    return { campaigns: camps, sent };
  });

  app.post('/api/sweep/messages', async req => {
    const s = activeSweep(req), b = req.body || {};
    const c = ownCampaign(s, b.campaignId), text = clean(b.text, 1000);
    if (!text) throw bad('Bitte eine Nachricht eingeben.');
    const ids = recipients(s, c)[b.rcpt];
    if (!ids) throw bad('Unbekannte Empfänger.');
    if (!ids.length) throw bad('Keine Empfänger.');
    postMessage(s.id, c.id, text, ids);
    for (const h of ids) for (const to of householdEmails(h)) queueMail({ to, subject: `Nachricht von Ihrem Kaminfeger ${sweepName(s)}`, text, link: `${config.baseUrl}/kunde`, linkLabel: 'In der App ansehen' });
    live.bump();
    return { ok: true, n: ids.length };
  });

  // ---------- Bewohner bestätigen (z. B. Mieter ohne Kundennummer) ----------
  app.post('/api/sweep/tenant/:id', async req => {
    const s = activeSweep(req), yes = req.body?.answer === 'yes';
    const r = get(`SELECT r.*, h.street, h.nr, h.email hemail, h.owner_name, u.email FROM residents r JOIN households h ON h.id = r.household_id JOIN users u ON u.id = r.user_id
      WHERE r.id = ? AND h.district_id = ? AND r.status = 'asked'`, Number(req.params.id), s.district_id);
    if (!r) throw notFound('Anfrage nicht gefunden oder schon erledigt.');
    let toast;
    if (yes) {
      tx(() => {
        run(`UPDATE residents SET status = 'verified', verified_at = ? WHERE id = ?`, nowIso(), r.id);
        run('UPDATE households SET moved_at = NULL WHERE id = ?', r.household_id);
        adminLog('Kaminfeger', `${r.family_name} · ${r.street} ${r.nr} freigegeben`, `Bestätigt durch Kaminfeger ${sweepName(s)}`);
      });
      queueMail({ to: r.email, subject: 'Ihre Adresse ist bestätigt', text: `${sweepName(s)} hat bestätigt, dass Sie in der ${r.street} ${r.nr} wohnen. Tippen Sie auf den Link, um Ihr Konto zu öffnen und einen Termin zu wählen.`,
        link: `${config.baseUrl}/kunde`, linkLabel: 'Konto freischalten' });
      toast = `${r.family_name} ist freigeschaltet und kann jetzt buchen.`;
    } else if (r.hemail) {
      const l = makeLink('owner', r.id, null, 14 * 86400000, '/eigentuemer/');
      tx(() => {
        run(`UPDATE residents SET status = 'owner' WHERE id = ?`, r.id);
        adminLog('Kaminfeger', `${r.family_name} · Eigentümer per E-Mail gefragt`, 'Kaminfeger konnte nicht bestätigen');
      });
      queueMail({ to: r.hemail, subject: `Wohnt ${r.family_name} in der ${r.street} ${r.nr}?`,
        text: `Guten Tag ${r.owner_name},\n\n${r.family_name} möchte über Kaminfeger Verwaltung die Feuerstättenschau für ${r.street} ${r.nr} buchen. Bitte bestätigen Sie kurz, dass sie dort wohnen.`,
        link: l.url, linkLabel: 'Antworten' });
      toast = 'Danke – wir fragen den Eigentümer per E-Mail.';
    } else {
      tx(() => {
        run(`UPDATE residents SET status = 'review' WHERE id = ?`, r.id);
        adminLog('Kaminfeger', `${r.family_name} · an Betreiber übergeben`, 'Keine E-Mail des Eigentümers im Kehrbuch');
      });
      toast = 'Danke – der Betreiber prüft die Anfrage.';
    }
    live.bump();
    return { ok: true, toast };
  });

}
