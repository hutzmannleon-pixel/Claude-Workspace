import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { get, all, run, tx } from '../db.js';
import { live } from '../live.js';
import { requireUser, endSession, startSession } from '../auth.js';
import { ensureDemo } from '../demo.js';
import { queueMail } from '../mail.js';
import { makeLink, revokeLinks, sweepName, companyName, initials, activeSweep, adminLog } from '../domain.js';
import { deleteDocuments } from './sweep.js';
import { bad, forbidden, notFound, nameKey, nowIso } from '../util.js';

// Geprüft wird, ob der Betrieb im Schornsteinfegerregister des BAFA steht – dort sind alle Betriebe eingetragen,
// die Schornsteinfegerarbeiten ausführen dürfen. Ein Kehrbezirk ist dafür nicht nötig.
const REASONS = ['Nachweis unleserlich – bitte neu hochladen', 'Betrieb nicht im Schornsteinfegerregister gefunden', 'Name oder Anschrift passen nicht zum Register', 'Verdacht auf gefälschte Unterlagen'];
const CHECKS = ['bafa', 'leiter', 'id'];
const whereOf = s => `${s.bplz} ${s.bort}`;
/** Angaben zum Abgleich im Schornsteinfegerregister des BAFA */
const registerInfo = s => ({ url: config.bafaRegisterUrl, company: companyName(s), name: sweepName(s), plz: s.bplz, ort: s.bort, address: `${s.bstreet}, ${s.bplz} ${s.bort}` });

function admin(req) {
  const u = requireUser(req, 'admin');
  if (!config.adminEmails.includes(u.email)) throw forbidden();
  if (config.adminPasskeyRequired && !get('SELECT 1 x FROM passkeys WHERE user_id = ?', u.id)) throw forbidden('Bitte zuerst einen Passkey einrichten.');
  return u;
}

function sweepAuto(s) {
  const out = [['ok', `E-Mail bestätigt · ${s.email}`]];
  out.push(['info', `Betrieb: ${companyName(s)} · ${s.bstreet}, ${s.bplz} ${s.bort}`]);
  if (s.company) out.push(['info', `Inhaberin / Inhaber laut Anmeldung: ${sweepName(s)}`]);
  if (['pending', 'query'].includes(s.status)) {
    out.push(['info', 'Bitte im Schornsteinfegerregister (BAFA) prüfen: Betrieb, Anschrift und Betriebsleitung']);
    if (!get('SELECT 1 x FROM documents WHERE sweep_id = ?', s.id)) out.push(['warn', 'Kein Nachweis mehr vorhanden – Dokumente werden nach 14 Tagen gelöscht']);
  }
  // Derselbe Name am selben Ort: könnte eine doppelte Anmeldung sein oder jemand gibt sich als bestehender Betrieb aus
  const twins = all(`SELECT * FROM sweeps WHERE id != ? AND demo = 0 AND bplz = ? AND status IN ('pending','query','active')`, s.id, s.bplz)
    .filter(o => nameKey(o.first + o.last) === nameKey(s.first + s.last) || nameKey(companyName(o)) === nameKey(companyName(s)));
  for (const o of twins) out.push(['warn', `Gleicher Name in ${s.bplz}: ${companyName(o)} (${o.status === 'active' ? 'freigeschaltet' : 'in Prüfung'})`]);
  if (s.status === 'active') {
    const n = get('SELECT COUNT(*) n FROM households WHERE sweep_id = ?', s.id).n;
    out.push([s.own_data_at ? 'ok' : 'info', s.own_data_at ? `Kundenliste: ${n} Haushalte · als eigene Kundendaten bestätigt` : 'Noch keine Kundenliste importiert']);
  }
  return out;
}
const sweepRow = id => get(`SELECT s.*, u.email FROM sweeps s JOIN users u ON u.id = s.user_id WHERE s.id = ?`, id);

function residentRow(id) {
  return get(`SELECT r.*, u.email, h.street hstreet, h.nr hnr, h.owner_name, h.email hemail, h.sweep_id
    FROM residents r JOIN users u ON u.id = r.user_id LEFT JOIN households h ON h.id = r.household_id WHERE r.id = ?`, id);
}
function residentAuto(r) {
  const out = [['ok', 'E-Mail bestätigt']];
  if (r.household_id) out.push(['ok', `Adresse in der Kundenliste von ${companyName(get('SELECT * FROM sweeps WHERE id = ?', r.sweep_id))}`]);
  else out.push(['warn', 'Adresse in keiner Kundenliste']);
  if (r.owner_name && !nameKey(r.owner_name).includes(nameKey(r.family_name))) out.push(['warn', `Name nicht in der Kundenliste (dort: ${r.owner_name})`]);
  if (r.method === 'number' && r.status === 'review') out.push(['warn', 'Kundennummer mehrfach falsch eingegeben']);
  if (r.status === 'owner') out.push(['warn', 'Link aus der E-Mail an den Eigentümer noch nicht geöffnet']);
  return out;
}
const RES_STATUS = { review: 'pending', asked: 'asked', owner: 'letter', rejected: 'rejected', dismissed: 'dismissed', verified: 'approved' };

export default async function adminRoutes(app) {
  app.post('/api/admin/logout', async (req, reply) => { endSession(req, reply, 'admin'); return { ok: true }; });

  app.get('/api/admin/queue', async req => {
    admin(req);
    const sweeps = all(`SELECT s.*, u.email FROM sweeps s JOIN users u ON u.id = s.user_id WHERE s.status != 'draft' AND s.demo = 0 ORDER BY s.submitted_at DESC`)
      .map(s => ({ id: s.id, name: companyName(s), person: sweepName(s), ini: initials(sweepName(s)), where: whereOf(s), since: s.submitted_at,
        status: s.status === 'active' ? 'approved' : s.status, auto: sweepAuto(s) }));
    const residents = all(`SELECT r.id FROM residents r JOIN users ru ON ru.id = r.user_id WHERE ru.email NOT LIKE '%@demo.invalid' AND (r.status IN ('review','asked','owner','rejected','dismissed') OR (r.status = 'verified' AND r.method IN ('sweep','owner','admin'))) ORDER BY r.id DESC`)
      .map(x => residentRow(x.id)).map(r => ({ id: r.id, name: r.family_name, ini: initials(r.family_name), addr: `${r.hstreet || r.street} ${r.hnr || r.nr}`, since: r.created_at,
        status: RES_STATUS[r.status] || 'pending', auto: residentAuto(r),
        flag: r.method === 'sweep' ? 'Mieter – keine Kundennummer' : r.method === 'number' ? 'Kundennummer passt nicht' : null }));
    return { sweeps, residents };
  });

  app.get('/api/admin/sweeps/:id', async req => {
    admin(req);
    const s = sweepRow(Number(req.params.id));
    if (!s) throw notFound();
    const docs = all('SELECT id, kind, mime, filename FROM documents WHERE sweep_id = ? ORDER BY id', s.id);
    return { id: s.id, kind: 'sweep', name: companyName(s), person: sweepName(s), ini: initials(sweepName(s)), where: whereOf(s), since: s.submitted_at,
      register: registerInfo(s), status: s.status === 'active' ? 'approved' : s.status, rejectReason: s.reject_reason, auto: sweepAuto(s), docs };
  });

  app.get('/api/admin/residents/:id', async req => {
    admin(req);
    const r = residentRow(Number(req.params.id));
    if (!r) throw notFound();
    const hint = r.method === 'sweep'
      ? 'Rechnung und Kundennummer bekommt meist der Eigentümer. Am schnellsten bestätigt der Kaminfeger, dass die Bewohner dort wohnen.'
      : r.status === 'owner' ? 'Der Eigentümer wurde per E-Mail gefragt. Wird der Link 14 Tage nicht geöffnet, verfällt die Anfrage.'
      : 'Die Kundennummer passte mehrfach nicht. Der Kaminfeger kann bestätigen oder der Eigentümer per E-Mail gefragt werden.';
    return { id: r.id, kind: 'res', name: r.family_name, ini: initials(r.family_name), addr: `${r.hstreet || r.street} ${r.hnr || r.nr}`, since: r.created_at,
      status: RES_STATUS[r.status] || 'pending', raw: r.status, hint, auto: residentAuto(r), ownerMail: !!r.hemail, sweep: r.sweep_id ? companyName(activeSweep(r.sweep_id)) : '' };
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

  // Freigabe schaltet den Betrieb sofort frei – ein zusätzlicher Link per E-Mail ist nicht nötig, die E-Mail ist schon bestätigt
  app.post('/api/admin/sweeps/:id/approve', async req => {
    const a = admin(req), s = sweepRow(Number(req.params.id));
    if (!s || !['pending', 'query'].includes(s.status)) throw bad('Nicht (mehr) offen.');
    const checks = req.body?.checks || [];
    if (!CHECKS.every(c => checks.includes(c))) throw bad(`Bitte alle ${CHECKS.length} Punkte prüfen.`);
    tx(() => {
      run(`UPDATE sweeps SET status = 'active', decided_at = ? WHERE id = ?`, nowIso(), s.id);
      deleteDocuments(s.id);
      adminLog(a.email, `${companyName(s)} · ${whereOf(s)} freigeschaltet`, 'Im Schornsteinfegerregister geprüft, Nachweis gelöscht');
    });
    queueMail({ to: s.email, subject: 'Ihr Betrieb ist freigeschaltet',
      text: `Guten Tag ${sweepName(s)},\n\nwir haben Ihren Betrieb geprüft und freigeschaltet. Sie können jetzt Ihre Kundenliste importieren und Termine anbieten.\n\nDie App ist für Ihre freien Arbeiten gedacht: Kehren, Überprüfen und Messen. Amtliche Aufgaben wie die Feuerstättenschau laufen nicht über die App.`,
      link: `${config.baseUrl}/kaminfeger`, linkLabel: 'App öffnen' });
    live.bump();
    return { ok: true, sentTo: s.email };
  });

  app.post('/api/admin/sweeps/:id/reject', async req => {
    const a = admin(req), s = sweepRow(Number(req.params.id));
    if (!s || !['pending', 'query'].includes(s.status)) throw bad('Nicht (mehr) offen.');
    const reason = String(req.body?.reason || '');
    if (!REASONS.includes(reason)) throw bad('Bitte einen Grund wählen.');
    tx(() => {
      run(`UPDATE sweeps SET status = 'rejected', reject_reason = ?, decided_at = ? WHERE id = ?`, reason, nowIso(), s.id);
      deleteDocuments(s.id);
      adminLog(a.email, `${companyName(s)} · abgelehnt`, 'Nachweis gelöscht');
    });
    queueMail({ to: s.email, subject: 'Nachweis abgelehnt', text: `Die Angaben zu Ihrem Betrieb „${companyName(s)}“ konnten wir leider nicht bestätigen.\n\nGrund: ${reason}\n\nSie können in der App einen neuen Nachweis hochladen.`,
      link: `${config.baseUrl}/kaminfeger`, linkLabel: 'Neue Unterlagen hochladen' });
    live.bump();
    return { ok: true };
  });

  app.post('/api/admin/sweeps/:id/query', async req => {
    const a = admin(req), s = sweepRow(Number(req.params.id));
    if (!s || !['pending', 'query'].includes(s.status)) throw bad('Nicht (mehr) offen.');
    run(`UPDATE sweeps SET status = 'query' WHERE id = ?`, s.id);
    adminLog(a.email, `${companyName(s)} · Rückfrage gestellt (${req.body?.to === 'innung' ? 'Innung' : 'Handwerkskammer'})`, 'Nachweis bleibt bis zur Entscheidung, max. 14 Tage');
    live.bump();
    return { ok: true };
  });

  app.post('/api/admin/residents/:id', async req => {
    const a = admin(req), r = residentRow(Number(req.params.id)), action = req.body?.action;
    if (!r) throw notFound();
    if (!['review', 'owner', 'asked'].includes(r.status)) throw bad('Bereits entschieden.');
    let toast = '';
    if (action === 'ask_sweep') {
      const sw = r.sweep_id ? activeSweep(r.sweep_id) : null;
      if (!sw) throw bad('Für diese Adresse gibt es keinen aktiven Kaminfeger.');
      run(`UPDATE residents SET status = 'asked', method = 'sweep' WHERE id = ?`, r.id);
      adminLog(a.email, `${r.family_name} · Bestätigung beim Kaminfeger angefragt`, 'Keine Dokumente nötig');
      toast = `Anfrage an ${companyName(sw)} gesendet – der Betrieb bestätigt in seiner App.`;
    } else if (action === 'ask_owner' || action === 'resend') {
      if (!r.hemail) throw bad('In der Kundenliste ist keine E-Mail des Eigentümers hinterlegt.');
      revokeLinks('owner', r.id);
      const l = makeLink('owner', r.id, null, 14 * 86400000, '/eigentuemer/');
      run(`UPDATE residents SET status = 'owner' WHERE id = ?`, r.id);
      queueMail({ to: r.hemail, subject: `Wohnt ${r.family_name} in der ${r.hstreet} ${r.hnr}?`,
        text: `Guten Tag ${r.owner_name},\n\n${r.family_name} möchte über Kaminfeger Verwaltung Termine mit dem Kaminfeger für ${r.hstreet} ${r.hnr} buchen. Bitte bestätigen Sie kurz, dass sie dort wohnen.`,
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

  // Vorschau: Kaminfeger- bzw. Bewohner-App mit dem Beispiel-Betrieb öffnen (eigene Sitzung in diesem Browser)
  app.post('/api/admin/demo', async (req, reply) => {
    admin(req);
    const as = req.body?.as === 'customer' ? 'customer' : 'sweep';
    const ids = ensureDemo(!!req.body?.reset);
    startSession(reply, as === 'sweep' ? ids.sweepUserId : ids.residentUserId, as);
    live.bump();
    return { ok: true, url: as === 'sweep' ? '/kaminfeger' : '/kunde' };
  });

  app.get('/api/admin/log', async req => {
    admin(req);
    return { log: all('SELECT * FROM admin_log ORDER BY id DESC LIMIT 200').map(l => ({ id: l.id, at: l.at, what: l.what, note: l.note, by: l.admin_email })) };
  });


}
