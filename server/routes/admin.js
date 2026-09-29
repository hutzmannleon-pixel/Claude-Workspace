import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { get, all, run, tx } from '../db.js';
import { live } from '../live.js';
import { requireUser, endSession } from '../auth.js';
import { queueMail } from '../mail.js';
import { makeLink, revokeLinks, sweepName, initials, activeSweepForDistrict, adminLog } from '../domain.js';
import { deleteDocuments } from './sweep.js';
import { bad, forbidden, notFound, nameKey, today, parseCsv, pick, EMAIL_RE, normEmail, nowIso } from '../util.js';

const REASONS = ['Urkunde unleserlich – bitte neu hochladen', 'Name passt nicht zur Urkunde', 'Bezirk gehört einer anderen Person', 'Verdacht auf gefälschte Unterlagen'];
const CHECKS = ['name', 'nr', 'valid', 'id'];
const kreisShort = k => String(k || '').split(' ')[0];

function admin(req) {
  const u = requireUser(req, 'admin');
  if (!config.adminEmails.includes(u.email)) throw forbidden();
  return u;
}

function sweepAuto(s) {
  const out = [['ok', `E-Mail bestätigt · ${s.email}`]];
  if (!s.district_id) return out.concat([['warn', 'Kein Bezirk angegeben']]);
  out.push(['ok', `Bezirk ${s.number} im Verzeichnis gefunden`]);
  const same = nameKey(s.first + s.last) === nameKey(s.holder_name);
  out.push(same ? ['ok', 'Name stimmt mit Verzeichnis überein'] : ['warn', `Verzeichnis: „${s.holder_name}“ – Name weicht ab`]);
  if (s.appointed_until && s.appointed_until < today()) out.push(['warn', `Bestellung laut Verzeichnis nur bis ${s.appointed_until}`]);
  const other = activeSweepForDistrict(s.district_id);
  if (other && other.id !== s.id) out.push(['warn', `Bezirk wird bereits von ${sweepName(other)} genutzt`]);
  out.push(['info', `Betriebsadresse laut Verzeichnis: ${s.business_address || '–'}`]);
  const entered = `${s.bstreet}, ${s.bplz} ${s.bort}`;
  if (s.business_address && nameKey(entered) !== nameKey(s.business_address)) out.push(['info', `Selbst angegeben: ${entered}`]);
  return out;
}
const sweepRow = id => get(`SELECT s.*, u.email, d.kreis, d.number, d.holder_name, d.official_email, d.business_address, d.appointed_until
  FROM sweeps s JOIN users u ON u.id = s.user_id LEFT JOIN districts d ON d.id = s.district_id WHERE s.id = ?`, id);

function residentRow(id) {
  return get(`SELECT r.*, u.email, h.street hstreet, h.nr hnr, h.owner_name, h.email hemail, h.district_id, d.number bez
    FROM residents r JOIN users u ON u.id = r.user_id LEFT JOIN households h ON h.id = r.household_id LEFT JOIN districts d ON d.id = h.district_id WHERE r.id = ?`, id);
}
function residentAuto(r) {
  const out = [['ok', 'E-Mail bestätigt']];
  if (r.household_id) out.push(['ok', `Adresse im Kehrbuch · Bezirk ${r.bez}`]);
  else out.push(['warn', 'Adresse nicht im Kehrbuch']);
  if (r.owner_name && !nameKey(r.owner_name).includes(nameKey(r.family_name))) out.push(['warn', `Name nicht im Kehrbuch (Eigentümer: ${r.owner_name})`]);
  if (r.method === 'number' && r.status === 'review') out.push(['warn', 'Kundennummer mehrfach falsch eingegeben']);
  if (r.status === 'owner') out.push(['warn', 'Link aus der E-Mail an den Eigentümer noch nicht geöffnet']);
  return out;
}
const RES_STATUS = { review: 'pending', asked: 'asked', owner: 'letter', rejected: 'rejected', dismissed: 'dismissed', verified: 'approved' };

export default async function adminRoutes(app) {
  app.post('/api/admin/logout', async (req, reply) => { endSession(req, reply, 'admin'); return { ok: true }; });

  app.get('/api/admin/queue', async req => {
    admin(req);
    const sweeps = all(`SELECT s.*, u.email, d.kreis, d.number, d.holder_name, d.business_address, d.appointed_until FROM sweeps s JOIN users u ON u.id = s.user_id
      LEFT JOIN districts d ON d.id = s.district_id WHERE s.status != 'draft' ORDER BY s.submitted_at DESC`)
      .map(s => ({ id: s.id, name: sweepName(s), ini: initials(sweepName(s)), bez: `${kreisShort(s.kreis)} ${s.number}`, since: s.submitted_at,
        status: s.status === 'active' ? 'approved' : s.status, auto: sweepAuto(s) }));
    const residents = all(`SELECT r.id FROM residents r WHERE r.status IN ('review','asked','owner','rejected','dismissed') OR (r.status = 'verified' AND r.method IN ('sweep','owner','admin')) ORDER BY r.id DESC`)
      .map(x => residentRow(x.id)).map(r => ({ id: r.id, name: r.family_name, ini: initials(r.family_name), addr: `${r.hstreet || r.street} ${r.hnr || r.nr}`, since: r.created_at,
        status: RES_STATUS[r.status] || 'pending', auto: residentAuto(r),
        flag: r.method === 'sweep' ? 'Mieter – keine Kundennummer' : r.method === 'number' ? 'Kundennummer passt nicht' : null }));
    return { sweeps, residents };
  });

  app.get('/api/admin/sweeps/:id', async req => {
    admin(req);
    const s = sweepRow(Number(req.params.id));
    if (!s) throw notFound();
    const docs = all("SELECT id, kind, mime, filename FROM documents WHERE sweep_id = ? ORDER BY kind = 'urkunde' DESC", s.id);
    return { id: s.id, kind: 'sweep', name: sweepName(s), ini: initials(sweepName(s)), bez: `${kreisShort(s.kreis)} ${s.number}`, bezNr: s.number, since: s.submitted_at,
      status: s.status === 'active' ? 'approved' : s.status, rejectReason: s.reject_reason, auto: sweepAuto(s), docs };
  });

  app.get('/api/admin/residents/:id', async req => {
    admin(req);
    const r = residentRow(Number(req.params.id));
    if (!r) throw notFound();
    const hint = r.method === 'sweep'
      ? 'Den Feuerstättenbescheid bekommt der Eigentümer. Am schnellsten bestätigt der Kaminfeger, dass die Bewohner dort wohnen.'
      : r.status === 'owner' ? 'Der Eigentümer wurde per E-Mail gefragt. Wird der Link 14 Tage nicht geöffnet, verfällt die Anfrage.'
      : 'Die Kundennummer passte mehrfach nicht. Der Kaminfeger kann bestätigen oder der Eigentümer per E-Mail gefragt werden.';
    return { id: r.id, kind: 'res', name: r.family_name, ini: initials(r.family_name), addr: `${r.hstreet || r.street} ${r.hnr || r.nr}`, since: r.created_at,
      status: RES_STATUS[r.status] || 'pending', raw: r.status, hint, auto: residentAuto(r), ownerMail: !!r.hemail, sweep: r.district_id ? sweepName(activeSweepForDistrict(r.district_id)) : '' };
  });

  // Dokumente nur ansehen: kein Cache, kein Download-Name
  app.get('/api/admin/documents/:id', async (req, reply) => {
    admin(req);
    const d = get('SELECT * FROM documents WHERE id = ?', Number(req.params.id));
    if (!d) throw notFound('Dokument gelöscht.');
    const file = path.join(config.dataDir, 'uploads', d.stored);
    if (!fs.existsSync(file)) throw notFound('Dokument gelöscht.');
    reply.header('Content-Type', d.mime).header('Cache-Control', 'no-store, private').header('Content-Disposition', 'inline')
      .header('X-Content-Type-Options', 'nosniff').header('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; object-src 'self'; frame-ancestors 'self'");
    return reply.send(fs.createReadStream(file));
  });

  app.post('/api/admin/sweeps/:id/approve', async req => {
    const a = admin(req), s = sweepRow(Number(req.params.id));
    if (!s || !['pending', 'query'].includes(s.status)) throw bad('Nicht (mehr) offen.');
    const checks = req.body?.checks || [];
    if (!CHECKS.every(c => checks.includes(c))) throw bad('Bitte alle 4 Punkte prüfen.');
    const other = activeSweepForDistrict(s.district_id);
    if (other && other.id !== s.id) throw bad(`Der Bezirk wird bereits von ${sweepName(other)} genutzt.`);
    const link = tx(() => {
      run(`UPDATE sweeps SET status = 'approved', decided_at = ? WHERE id = ?`, nowIso(), s.id);
      deleteDocuments(s.id);
      revokeLinks('activate', s.id);
      adminLog(a.email, `${sweepName(s)} · ${kreisShort(s.kreis)} ${s.number} freigegeben`, 'Urkunde und Ausweis gelöscht');
      return makeLink('activate', s.id, null, 48 * 3600000, '/aktivieren/');
    });
    // An die Adresse aus dem Bezirksverzeichnis – nicht an die selbst angegebene
    queueMail({ to: s.official_email, subject: `Kehrbezirk ${s.number} freischalten`,
      text: `Guten Tag ${sweepName(s)},\n\nIhre Bestellung wurde geprüft. Diese E-Mail geht an die Adresse aus dem Bezirksverzeichnis – so wissen wir, dass wirklich Sie es sind.\n\nDer Link gilt 48 Stunden.`,
      link: link.url, linkLabel: 'Bezirk freischalten' });
    if (normEmail(s.official_email) !== s.email) queueMail({ to: s.email, subject: 'Prüfung abgeschlossen',
      text: `Ihre Unterlagen sind geprüft. Den Freischaltlink haben wir an die E-Mail-Adresse aus dem Bezirksverzeichnis geschickt (${s.official_email}).` });
    live.bump();
    return { ok: true, sentTo: s.official_email };
  });

  app.post('/api/admin/sweeps/:id/reject', async req => {
    const a = admin(req), s = sweepRow(Number(req.params.id));
    if (!s || !['pending', 'query'].includes(s.status)) throw bad('Nicht (mehr) offen.');
    const reason = String(req.body?.reason || '');
    if (!REASONS.includes(reason)) throw bad('Bitte einen Grund wählen.');
    tx(() => {
      run(`UPDATE sweeps SET status = 'rejected', reject_reason = ?, decided_at = ? WHERE id = ?`, reason, nowIso(), s.id);
      deleteDocuments(s.id);
      adminLog(a.email, `${sweepName(s)} · abgelehnt`, 'Urkunde und Ausweis gelöscht');
    });
    queueMail({ to: s.email, subject: 'Nachweis abgelehnt', text: `Ihre Unterlagen für den Kehrbezirk ${s.number} konnten wir leider nicht bestätigen.\n\nGrund: ${reason}\n\nSie können in der App neue Unterlagen hochladen.`,
      link: `${config.baseUrl}/kaminfeger`, linkLabel: 'Neue Unterlagen hochladen' });
    live.bump();
    return { ok: true };
  });

  app.post('/api/admin/sweeps/:id/query', async req => {
    const a = admin(req), s = sweepRow(Number(req.params.id));
    if (!s || !['pending', 'query'].includes(s.status)) throw bad('Nicht (mehr) offen.');
    run(`UPDATE sweeps SET status = 'query' WHERE id = ?`, s.id);
    adminLog(a.email, `${sweepName(s)} · Rückfrage gestellt (${req.body?.to === 'innung' ? 'Innung' : 'Behörde'})`, 'Dokumente bleiben bis zur Entscheidung, max. 14 Tage');
    live.bump();
    return { ok: true };
  });

  app.post('/api/admin/residents/:id', async req => {
    const a = admin(req), r = residentRow(Number(req.params.id)), action = req.body?.action;
    if (!r) throw notFound();
    if (!['review', 'owner', 'asked'].includes(r.status)) throw bad('Bereits entschieden.');
    let toast = '';
    if (action === 'ask_sweep') {
      if (!r.district_id || !activeSweepForDistrict(r.district_id)) throw bad('Für diese Adresse gibt es keinen aktiven Kaminfeger.');
      run(`UPDATE residents SET status = 'asked', method = 'sweep' WHERE id = ?`, r.id);
      adminLog(a.email, `${r.family_name} · Bestätigung beim Kaminfeger angefragt`, 'Keine Dokumente nötig');
      toast = `Anfrage an ${sweepName(activeSweepForDistrict(r.district_id))} gesendet – er bestätigt in seiner App.`;
    } else if (action === 'ask_owner' || action === 'resend') {
      if (!r.hemail) throw bad('Im Kehrbuch ist keine E-Mail des Eigentümers hinterlegt.');
      revokeLinks('owner', r.id);
      const l = makeLink('owner', r.id, null, 14 * 86400000, '/eigentuemer/');
      run(`UPDATE residents SET status = 'owner' WHERE id = ?`, r.id);
      queueMail({ to: r.hemail, subject: `Wohnt ${r.family_name} in der ${r.hstreet} ${r.hnr}?`,
        text: `Guten Tag ${r.owner_name},\n\n${r.family_name} möchte über Kaminfeger Verwaltung die Feuerstättenschau für ${r.hstreet} ${r.hnr} buchen. Bitte bestätigen Sie kurz, dass sie dort wohnen.`,
        link: l.url, linkLabel: 'Antworten' });
      adminLog(a.email, `${r.family_name} · ${action === 'resend' ? 'Bestätigungs-E-Mail erneut gesendet' : 'Eigentümer per E-Mail gefragt'}`, action === 'resend' ? 'Neuer Link, alter Link ungültig' : 'Keine Dokumente gespeichert');
      toast = action === 'resend' ? 'Neue E-Mail gesendet, der alte Link ist ungültig.' : `E-Mail an ${r.owner_name} (Eigentümer) gesendet.`;
    } else if (action === 'reject') {
      run(`UPDATE residents SET status = 'rejected' WHERE id = ?`, r.id);
      queueMail({ to: r.email, subject: 'Adresse nicht bestätigt', text: `Wir konnten leider nicht bestätigen, dass Sie in der ${r.hstreet || r.street} ${r.hnr || r.nr} wohnen. Bitte wenden Sie sich an Ihren Kaminfeger.` });
      adminLog(a.email, `${r.family_name} · abgelehnt`, 'Keine Dokumente gespeichert');
      toast = 'Abgelehnt und per E-Mail informiert.';
    } else if (action === 'dismiss') {
      tx(() => {
        adminLog(a.email, `${r.family_name} · Anfrage verworfen`, 'Kontodaten gelöscht');
        run('DELETE FROM message_reads WHERE user_id = ?', r.user_id);
        run('DELETE FROM users WHERE id = ?', r.user_id);
      });
      toast = 'Anfrage verworfen, Kontodaten gelöscht.';
    } else throw bad('Unbekannte Aktion.');
    live.bump();
    return { ok: true, toast };
  });

  app.get('/api/admin/log', async req => {
    admin(req);
    return { log: all('SELECT * FROM admin_log ORDER BY id DESC LIMIT 200').map(l => ({ id: l.id, at: l.at, what: l.what, note: l.note, by: l.admin_email })) };
  });

  // ---------- Bezirksverzeichnis ----------
  app.get('/api/admin/directory', async req => {
    admin(req);
    return { count: get('SELECT COUNT(*) n FROM districts').n, rows: all('SELECT * FROM districts ORDER BY land, kreis, CAST(number AS INTEGER) LIMIT 300') };
  });
  app.post('/api/admin/directory', async req => {
    const a = admin(req);
    const file = await req.file({ limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
    if (!file) throw bad('Keine Datei.');
    const rows = parseCsv((await file.toBuffer()).toString('utf8'));
    if (!rows.length) throw bad('Die Datei ist leer oder hat keine Kopfzeile.');
    let added = 0, updated = 0; const errors = [];
    tx(() => rows.forEach((r, i) => {
      const land = pick(r, 'bundesland', 'land'), kreis = pick(r, 'kreis', 'stadtlandkreis', 'landkreis', 'stadt'), nr = pick(r, 'bezirk', 'bezirksnummer', 'nummer').replace(/^0+(?=\d)/, '');
      const name = pick(r, 'name', 'inhaber', 'bevollmaechtigt'), email = normEmail(pick(r, 'email', 'mail')), addr = pick(r, 'betriebsadresse', 'adresse'), until = pick(r, 'bestelltbis', 'bis');
      if (!land || !kreis || !nr || !name || !EMAIL_RE.test(email)) { errors.push(`Zeile ${i + 2}: Bundesland, Kreis, Bezirk, Name oder E-Mail fehlt`); return; }
      const ex = get('SELECT id FROM districts WHERE kreis = ? AND number = ?', kreis, nr);
      if (ex) { run('UPDATE districts SET land = ?, holder_name = ?, official_email = ?, business_address = ?, appointed_until = ? WHERE id = ?', land, name, email, addr || null, until || null, ex.id); updated++; }
      else { run('INSERT INTO districts (land, kreis, number, holder_name, official_email, business_address, appointed_until) VALUES (?,?,?,?,?,?,?)', land, kreis, nr, name, email, addr || null, until || null); added++; }
    }));
    adminLog(a.email, `Bezirksverzeichnis importiert · ${added} neu, ${updated} aktualisiert`, 'Keine Dokumente gespeichert');
    live.bump();
    return { added, updated, errors: errors.slice(0, 20), errorCount: errors.length };
  });


}
