// Integrationstest: spielt alle Abläufe über die echte API durch – mit eigener, temporärer Datenbank.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kf-test-'));
Object.assign(process.env, { DATA_DIR: dir, TEST_MODE: '1', ADMIN_EMAILS: 'admin@test.de', BASE_URL: 'http://localhost:3000', APP_SECRET: 'test', ADMIN_PASSKEY: 'optional', IP_CODES_PER_HOUR: '100000', IP_LOGINS_PER_HOUR: '100000' });

const { build } = await import('../index.js');
const { get, all, run } = await import('../db.js');
const { sendReminders, sendChatMails } = await import('../jobs.js');
let app;
before(async () => { app = await build({ logger: false }); });

// ---------- Hilfen ----------
const jars = {};
async function call(role, method, url, body, extra = {}) {
  const headers = { ...(extra.headers || {}) };
  if (jars[role]) headers.cookie = Object.entries(jars[role]).map(([k, v]) => `${k}=${v}`).join('; ');
  const opts = { method, url, headers };
  if (extra.payload) opts.payload = extra.payload;
  else if (body !== undefined) opts.payload = body;
  const res = await app.inject(opts);
  for (const c of [].concat(res.headers['set-cookie'] || [])) {
    const [kv] = c.split(';'); const [k, v] = kv.split('=');
    jars[role] = jars[role] || {};
    if (v) jars[role][k] = v; else delete jars[role][k];
  }
  let json = null; try { json = res.json(); } catch {}
  return { status: res.statusCode, json, res };
}
const ok = async (...a) => { const r = await call(...a); assert.ok(r.status < 300, `${a[1]} ${a[2]} → ${r.status} ${JSON.stringify(r.json)}`); return r.json; };
const fails = async (status, ...a) => { const r = await call(...a); assert.equal(r.status, status, `${a[1]} ${a[2]} sollte ${status} sein: ${JSON.stringify(r.json)}`); return r.json; };
const lastMail = to => get('SELECT * FROM outbox WHERE to_addr = ? ORDER BY id DESC LIMIT 1', to);
const codeFor = to => (lastMail(to).subject.match(/(\d{6})/) || [])[1];
function form(name, filename, type, content) {
  const b = '----kf' + Math.random().toString(16).slice(2);
  const payload = Buffer.concat([Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${name}"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`), Buffer.from(content), Buffer.from(`\r\n--${b}--\r\n`)]);
  return { payload, headers: { 'content-type': `multipart/form-data; boundary=${b}` } };
}
const upload = (role, url, name, type, content) => { const f = form('file', name, type, content); return call(role, 'POST', url, undefined, f); };
const fmtDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// n Tage voraus, Sonntage werden übersprungen – so ergeben verschiedene n immer verschiedene Tage (negativ: einfach zurück)
const iso = n => {
  const d = new Date();
  if (n < 0) d.setDate(d.getDate() + n);
  for (let i = 0; i < n; i++) { d.setDate(d.getDate() + 1); if (d.getDay() === 0) d.setDate(d.getDate() + 1); }
  return fmtDate(d);
};
async function login(role, email, jar = role) {
  await ok(jar, 'POST', '/api/auth/code', { email, role, purpose: 'login' });
  await ok(jar, 'POST', '/api/auth/login', { email, role, code: codeFor(email) });
}
async function registerCustomer(jar, email, addr) {
  await ok(jar, 'POST', '/api/auth/code', { email, role: 'customer', purpose: 'register' });
  return ok(jar, 'POST', '/api/customer/register', { email, code: codeFor(email), ...addr });
}
const D1 = iso(10), D2 = iso(11);
const KUNDEN = '/api/sweep/kunden?eigene=1';

// ---------- Tests ----------
test('Betreiber: nur freigeschaltete Admins · Kehrbezirke und Bezirksverzeichnis gibt es nicht mehr', async () => {
  await ok('x', 'POST', '/api/auth/code', { email: 'fremd@test.de', role: 'admin', purpose: 'login' });
  assert.equal(lastMail('fremd@test.de'), undefined, 'kein Code an Nicht-Admins');
  await fails(400, 'x', 'POST', '/api/auth/login', { email: 'fremd@test.de', role: 'admin', code: '123456' });
  await login('admin', 'admin@test.de');
  await fails(401, 'nobody', 'GET', '/api/admin/queue');
  await fails(404, 'x', 'GET', '/api/directory/options');
  await fails(404, 'admin', 'GET', '/api/admin/directory');
  assert.equal(get(`SELECT COUNT(*) n FROM sqlite_master WHERE name = 'districts'`).n, 0);
});

test('Login-Codes: falsch, abgelaufen nach 5 Versuchen, nur einmal gültig', async () => {
  await ok('s', 'POST', '/api/auth/code', { email: 'mb@test.de', role: 'sweep', purpose: 'register' });
  const code = codeFor('mb@test.de');
  assert.match(code, /^\d{6}$/);
  const wrong = code === '000000' ? '111111' : '000000';
  await fails(400, 's', 'POST', '/api/sweep/register', { first: 'Markus', last: 'Brandt', bstreet: 'Talstraße 12', bplz: '79102', bort: 'Freiburg', email: 'mb@test.de', code: wrong });
  await ok('s', 'POST', '/api/sweep/register', { first: 'Markus', last: 'Brandt', company: 'Kaminfeger Brandt', bstreet: 'Talstraße 12', bplz: '79102', bort: 'Freiburg', email: 'mb@test.de', code, phone: '0761 1234' });
  await fails(400, 's2', 'POST', '/api/sweep/register', { first: 'X', last: 'Y', bstreet: 'a', bplz: '79102', bort: 'b', email: 'mb@test.de', code });
  // Brute-Force: nach 5 Fehlversuchen ist der Code verbraucht
  await ok('k', 'POST', '/api/auth/code', { email: 'bf@test.de', role: 'customer', purpose: 'register' });
  const good = codeFor('bf@test.de');
  for (let i = 0; i < 5; i++) await fails(400, 'k', 'POST', '/api/customer/register', { email: 'bf@test.de', code: good === '000000' ? '999999' : '000000', street: 'Lindenstraße', nr: '1', plz: '79102', ort: 'Freiburg', name: 'X' });
  await fails(400, 'k', 'POST', '/api/customer/register', { email: 'bf@test.de', code: good, street: 'Lindenstraße', nr: '1', plz: '79102', ort: 'Freiburg', name: 'X' });
});

test('Kaminfeger: Betrieb anmelden – ein Nachweis genügt, kein Kehrbezirk nötig', async () => {
  const me = await ok('s', 'GET', '/api/sweep/me');
  assert.deepEqual([me.status, me.company, me.households], ['draft', 'Kaminfeger Brandt', 0]);
  await fails(404, 's', 'POST', '/api/sweep/district', { land: 'Baden-Württemberg', kreis: 'Freiburg im Breisgau', bez: '14' });
  await fails(400, 's', 'POST', '/api/sweep/submit', { assure: true });
  assert.equal((await upload('s', '/api/sweep/documents/urkunde', 'urkunde.pdf', 'application/pdf', '%PDF-1.4 test')).status, 400, 'Bestellungsurkunde wird nicht mehr verlangt');
  assert.equal((await upload('s', '/api/sweep/documents/ausweis', 'x.exe', 'application/x-msdownload', 'MZ')).status, 400);
  assert.equal((await upload('s', '/api/sweep/documents/ausweis', 'handwerkskarte.jpg', 'image/jpeg', 'jpgdata')).status, 200);
  assert.equal((await ok('s', 'GET', '/api/sweep/me')).docs.ausweis.name, 'handwerkskarte.jpg');
  await fails(400, 's', 'POST', '/api/sweep/submit', { assure: false });
  await ok('s', 'POST', '/api/sweep/submit', { assure: true });
  assert.equal((await ok('s', 'GET', '/api/sweep/me')).status, 'pending');
  await fails(403, 's', 'GET', '/api/sweep/overview');
  const mail = lastMail('admin@test.de');
  assert.ok(mail.subject.includes('Neue Prüfung') && mail.subject.includes('Kaminfeger Brandt'));
  assert.ok(mail.text.includes('Schornsteinfegerregister'));
});

test('Betreiber: Nachweis ansehen, im Register prüfen, freischalten – Betrieb ist sofort aktiv, Nachweis gelöscht', async () => {
  const q = await ok('admin', 'GET', '/api/admin/queue');
  const item = q.sweeps.find(s => s.name === 'Kaminfeger Brandt');
  assert.deepEqual([item.status, item.person, item.where], ['pending', 'Markus Brandt', '79102 Freiburg']);
  const d = await ok('admin', 'GET', `/api/admin/sweeps/${item.id}`);
  assert.equal(d.docs.length, 1);
  assert.deepEqual([d.register.company, d.register.name, d.register.plz], ['Kaminfeger Brandt', 'Markus Brandt', '79102']);
  assert.ok(d.register.url.startsWith('https://'));
  assert.ok(d.auto.some(a => a[1].includes('Schornsteinfegerregister')));
  const doc = await call('admin', 'GET', `/api/admin/documents/${d.docs[0].id}`);
  assert.equal(doc.status, 200);
  assert.equal(doc.res.headers['cache-control'], 'no-store, private');
  await fails(401, 's', 'GET', `/api/admin/documents/${d.docs[0].id}`);
  await fails(400, 'admin', 'POST', `/api/admin/sweeps/${item.id}/approve`, { checks: ['bafa', 'id'] });
  const res = await ok('admin', 'POST', `/api/admin/sweeps/${item.id}/approve`, { checks: ['bafa', 'leiter', 'id'] });
  assert.equal(res.sentTo, 'mb@test.de');
  assert.equal(get('SELECT COUNT(*) n FROM documents').n, 0);
  assert.equal(fs.readdirSync(path.join(dir, 'uploads')).length, 0, 'Dateien gelöscht');
  assert.equal((await ok('s', 'GET', '/api/sweep/me')).status, 'active', 'ohne zusätzlichen Freischaltlink');
  const mail = lastMail('mb@test.de');
  assert.equal(mail.subject, 'Ihr Betrieb ist freigeschaltet');
  assert.ok(mail.link.endsWith('/kaminfeger') && mail.text.includes('Feuerstättenschau laufen nicht über die App'));
  assert.equal((await call('x', 'GET', '/aktivieren/alter-link')).res.headers.location, '/kaminfeger', 'alte Links führen nur noch zur App');
  const log = await ok('admin', 'GET', '/api/admin/log');
  assert.ok(log.log[0].what.includes('freigeschaltet'));
});

test('Betreiber: Ablehnen mit Grund, Kaminfeger reicht neu ein, Rückfrage', async () => {
  await ok('s2', 'POST', '/api/auth/code', { email: 'em@test.de', role: 'sweep', purpose: 'register' });
  await ok('s2', 'POST', '/api/sweep/register', { first: 'Erika', last: 'Muster', bstreet: 'Hauptstr. 1', bplz: '79100', bort: 'Freiburg', email: 'em@test.de', code: codeFor('em@test.de') });
  await upload('s2', '/api/sweep/documents/ausweis', 'a.png', 'image/png', 'png');
  await ok('s2', 'POST', '/api/sweep/submit', { assure: true });
  const id = (await ok('admin', 'GET', '/api/admin/queue')).sweeps.find(s => s.name === 'Erika Muster').id;
  await ok('admin', 'POST', `/api/admin/sweeps/${id}/query`, { to: 'kammer' });
  assert.equal((await ok('s2', 'GET', '/api/sweep/me')).status, 'query');
  await fails(400, 'admin', 'POST', `/api/admin/sweeps/${id}/reject`, { reason: 'Einfach so' });
  await ok('admin', 'POST', `/api/admin/sweeps/${id}/reject`, { reason: 'Nachweis unleserlich – bitte neu hochladen' });
  const me = await ok('s2', 'GET', '/api/sweep/me');
  assert.equal(me.status, 'rejected');
  assert.equal(me.rejectReason, 'Nachweis unleserlich – bitte neu hochladen');
  assert.equal(me.docs.ausweis, null);
  await upload('s2', '/api/sweep/documents/ausweis', 'a2.png', 'image/png', 'png');
  await ok('s2', 'POST', '/api/sweep/submit', { assure: true });
  assert.equal((await ok('admin', 'GET', `/api/admin/sweeps/${id}`)).status, 'pending');
});

let campaignId;
test('Kaminfeger: eigene Kundenliste importieren (mit Bestätigung), Art der Arbeit wählen, Zeitfenster senden', async () => {
  const csv = 'Straße;Hausnummer;PLZ;Ort;Kunde;Kundennummer;E-Mail;Telefon\n' +
    'Lindenstraße;1;79102;Freiburg;Berger;KF-14-0001;;0761 1\n' +
    'Lindenstraße;2;79102;Freiburg;Yilmaz;KF-14-0002;;0761 2\n' +
    'Lindenstraße;3;79102;Freiburg;Keller;KF-14-0003;keller@test.de;0761 3\n' +
    'Lindenstraße;4;79102;Freiburg;Fam. Lang;;;0761 4\n' +
    'Ahornweg;1;79102;Freiburg;Vogel;KF-14-1001;;\n' +
    ';;;;;\n';
  // Ohne die Bestätigung „eigene Kundendaten, nicht das Kehrbuch“ wird nichts importiert
  const no = await upload('s', '/api/sweep/kunden', 'kunden.csv', 'text/csv', csv);
  assert.deepEqual([no.status, no.json.code], [400, 'confirm']);
  await fails(404, 's', 'POST', '/api/sweep/kehrbuch', undefined, form('file', 'kb.csv', 'text/csv', csv));
  assert.equal(get('SELECT COUNT(*) n FROM households').n, 0);
  const r = await upload('s', KUNDEN, 'kunden.csv', 'text/csv', csv);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.deepEqual([r.json.added, r.json.errorCount], [5, 0]);
  const again = await upload('s', KUNDEN, 'kunden.csv', 'text/csv', csv);
  assert.equal(again.json.updated, 5, 'Import ist wiederholbar');
  assert.ok(get(`SELECT own_data_at FROM sweeps WHERE company = 'Kaminfeger Brandt'`).own_data_at, 'Bestätigung festgehalten');
  assert.ok((await ok('admin', 'GET', '/api/admin/log')).log.some(l => l.what.includes('Kundenliste importiert') && l.note.includes('eigene Kundendaten')));
  const ov = await ok('s', 'GET', '/api/sweep/overview');
  assert.deepEqual([ov.company, ov.ort], ['Kaminfeger Brandt', 'Freiburg']);
  assert.deepEqual(ov.streets.map(s => [s.street, s.households, s.campaign]), [['Ahornweg', 1, null], ['Lindenstraße', 4, null]]);
  await fails(400, 's', 'POST', '/api/sweep/campaigns', { street: 'Lindenstraße', plz: '79102', slotLen: 30, deadline: iso(5), windows: [{ date: D1, start: '08:00', end: '08:10' }] });
  await fails(400, 's', 'POST', '/api/sweep/campaigns', { street: 'Lindenstraße', plz: '79102', slotLen: 30, deadline: iso(5), windows: [{ date: D1, start: '08:00', end: '10:00' }, { date: D1, start: '13:00', end: '15:00' }] });
  // Amtliche Aufgaben laufen nicht über die App
  const two = [{ date: D1, start: '08:00', end: '10:00' }, { date: D2, start: '13:00', end: '14:00' }];
  for (const work of ['Feuerstättenschau', 'feuerstaetten-schau 2026', 'Bauabnahme Kaminofen', '   '])
    assert.equal((await fails(400, 's', 'POST', '/api/sweep/campaigns', { street: 'Lindenstraße', plz: '79102', work, slotLen: 30, deadline: iso(5), windows: two })).code, 'work');
  const c = await ok('s', 'POST', '/api/sweep/campaigns', { street: 'Lindenstraße', plz: '79102', work: 'Kehren', slotLen: 30, deadline: iso(5), windows: two });
  campaignId = c.id;
  assert.equal(c.households, 4);
  assert.equal((await ok('s', 'GET', `/api/sweep/campaigns/${campaignId}`)).work, 'Kehren');
  const inv = lastMail('keller@test.de');
  assert.ok(inv.link.includes('/kunde?einladung='), 'Einladung an die E-Mail aus der Kundenliste');
  assert.ok(inv.text.includes('steht an: Kehren') && !/Feuerst/.test(inv.subject + inv.text));
});

test('Bewohner: Adresse finden, E-Mail-Code, Kundennummer prüfen, buchen', async () => {
  // Vor der Anmeldung: nur ob ein Betrieb die Adresse führt – nicht welcher
  const found = await call('k1', 'POST', '/api/customer/lookup', { street: 'Lindenstrasse', nr: '1', plz: '79102', ort: 'Freiburg' });
  assert.deepEqual(found.json, { known: true, householdFound: true });
  assert.ok(!found.res.body.includes('Brandt'));
  assert.deepEqual(await ok('k1', 'POST', '/api/customer/lookup', { street: 'Lindenstraße', nr: '99', plz: '79102' }), { known: true, householdFound: false });
  assert.deepEqual(await ok('k1', 'POST', '/api/customer/lookup', { street: 'Unter den Linden', nr: '1', plz: '10117', ort: 'Berlin' }), { known: false, householdFound: false });
  const reg = await registerCustomer('k1', 'berger@test.de', { street: 'Lindenstraße', nr: '1', plz: '79102', ort: 'Freiburg', name: 'Berger' });
  assert.equal(reg.next, 'verify');
  const pre = await ok('k1', 'GET', '/api/customer/state');
  assert.deepEqual([pre.listed, pre.hasSweep, pre.sweep, pre.campaign && pre.campaign.work], [true, true, null, 'Kehren'], 'Betriebsname erst nach bestätigtem Wohnsitz');
  await fails(403, 'k1', 'POST', '/api/customer/book', { windowId: 1, time: '08:00' });
  await fails(400, 'k1', 'POST', '/api/customer/verify-number', { kdnr: 'KF-14-9999' });
  await ok('k1', 'POST', '/api/customer/verify-number', { kdnr: 'kf 14 0001' });
  const st = await ok('k1', 'GET', '/api/customer/state');
  assert.equal(st.resident.status, 'verified');
  assert.deepEqual([st.sweep.company, st.sweep.name, st.options], ['Kaminfeger Brandt', 'Markus Brandt', []]);
  assert.equal(st.campaign.windows.length, 2);
  assert.equal(st.messages.length, 1, 'Nachricht zu den Zeitfenstern');
  assert.ok(st.messages[0].text.includes('steht an: Kehren'));
  const w1 = st.campaign.windows[0];
  assert.deepEqual(w1.slots.map(s => s.t), ['08:00', '08:30', '09:00', '09:30']);
  await fails(400, 'k1', 'POST', '/api/customer/book', { windowId: w1.id, time: '08:15' });
  await ok('k1', 'POST', '/api/customer/book', { windowId: w1.id, time: '08:00', key: 'Fam. Yilmaz, Nr. 2' });
  assert.ok(lastMail('berger@test.de').subject.startsWith('Termin bestätigt'));
  assert.ok(lastMail('berger@test.de').text.includes('(Kehren)'));
  const st2 = await ok('k1', 'GET', '/api/customer/state');
  assert.equal(st2.booking.t, '08:00');
  assert.equal(st2.booking.key, 'Fam. Yilmaz, Nr. 2');
  const ics = await call('k1', 'GET', '/api/customer/calendar.ics');
  assert.ok(ics.res.body.includes('BEGIN:VEVENT') && ics.res.body.includes('SUMMARY:Kehren – Kaminfeger Markus Brandt'));
});

test('Einladungslink: Wohnsitz sofort bestätigt · vergebene Slots gesperrt', async () => {
  const token = new URL(lastMail('keller@test.de').link).searchParams.get('einladung');
  const info = await ok('x', 'GET', `/api/customer/invite/${token}`);
  assert.deepEqual([info.family, info.sweep], ['Keller', 'Kaminfeger Brandt']);
  const reg = await registerCustomer('k3', 'keller@test.de', { invite: token });
  assert.equal(reg.status, 'verified');
  await fails(404, 'x', 'GET', `/api/customer/invite/${token}`);
  const st = await ok('k3', 'GET', '/api/customer/state');
  const w1 = st.campaign.windows[0];
  assert.equal(w1.slots.find(s => s.t === '08:00').taken, true);
  await fails(400, 'k3', 'POST', '/api/customer/book', { windowId: w1.id, time: '08:00' });
  await ok('k3', 'POST', '/api/customer/book', { windowId: w1.id, time: '08:30' });
  // verschieben und absagen
  await ok('k3', 'POST', '/api/customer/book', { windowId: w1.id, time: '09:30' });
  await ok('k3', 'POST', '/api/customer/cancel');
  assert.equal((await ok('k3', 'GET', '/api/customer/state')).houseStatus, 'cancelled');
  const detail = await ok('s', 'GET', `/api/sweep/campaigns/${campaignId}`);
  assert.equal(detail.houses.find(h => h.nr === '3').status, 'cancelled');
  // Kaminfeger trägt telefonisch vereinbarte Zeit ein
  await ok('s', 'POST', '/api/sweep/bookings', { campaignId, householdId: detail.houses.find(h => h.nr === '3').id, windowId: w1.id, time: '09:00' });
  assert.equal((await ok('k3', 'GET', '/api/customer/state')).booking.t, '09:00');
});

test('Mieter ohne Kundennummer: Kaminfeger fragt – Betreiber übernimmt – Kaminfeger bestätigt', async () => {
  const reg = await registerCustomer('k4', 'oezdemir@test.de', { street: 'Lindenstraße', nr: '4', plz: '79102', ort: 'Freiburg', name: 'S. Özdemir' });
  assert.equal(reg.next, 'verify');
  await ok('k4', 'POST', '/api/customer/request-sweep');
  assert.ok(lastMail('mb@test.de').subject.includes('Bewohner-Anfrage'));
  const ov = await ok('s', 'GET', '/api/sweep/overview');
  const t = ov.tenants.find(x => x.name === 'S. Özdemir');
  assert.ok(t);
  const no = await ok('s', 'POST', `/api/sweep/tenant/${t.id}`, { answer: 'no' });
  assert.ok(no.toast.includes('Betreiber'), 'ohne Eigentümer-E-Mail geht es an den Betreiber');
  const q = await ok('admin', 'GET', '/api/admin/queue');
  const r = q.residents.find(x => x.name === 'S. Özdemir');
  assert.equal(r.status, 'pending');
  await fails(400, 'admin', 'POST', `/api/admin/residents/${r.id}`, { action: 'ask_owner' });
  await ok('admin', 'POST', `/api/admin/residents/${r.id}`, { action: 'ask_sweep' });
  await ok('s', 'POST', `/api/sweep/tenant/${t.id}`, { answer: 'yes' });
  assert.equal((await ok('k4', 'GET', '/api/customer/state')).resident.status, 'verified');
  assert.equal(lastMail('oezdemir@test.de').subject, 'Ihre Adresse ist bestätigt');
});

test('Eigentümer bestätigt per E-Mail-Link', async () => {
  run(`UPDATE households SET email = 'lang@test.de' WHERE nr = '2'`);
  const reg = await registerCustomer('k2', 'mieter2@test.de', { street: 'Lindenstraße', nr: '2', plz: '79102', ort: 'Freiburg', name: 'Neu' });
  assert.equal(reg.next, 'verify');
  await ok('k2', 'POST', '/api/customer/request-sweep');
  const t = (await ok('s', 'GET', '/api/sweep/overview')).tenants.find(x => x.name === 'Neu');
  await ok('s', 'POST', `/api/sweep/tenant/${t.id}`, { answer: 'no' });
  const link = lastMail('lang@test.de').link;
  const token = link.split('/eigentuemer/')[1];
  assert.equal((await ok('x', 'GET', `/api/owner/${token}`)).resident, 'Neu');
  await ok('x', 'POST', `/api/owner/${token}`, { answer: 'yes' });
  assert.equal((await ok('k2', 'GET', '/api/customer/state')).resident.status, 'verified');
  await fails(404, 'x', 'POST', `/api/owner/${token}`, { answer: 'yes' });
});

test('Kundennummer 3× falsch → Betreiber-Prüfung', async () => {
  run(`UPDATE households SET email = NULL WHERE nr = '2'`);
  await ok('s', 'POST', KUNDEN, undefined, form('file', 'kb.csv', 'text/csv', 'strasse;hausnummer;plz;ort;eigentuemer;kundennummer\nAhornweg;2;79102;Freiburg;Seitz;KF-14-1002\n'));
  await registerCustomer('k5', 'seitz@test.de', { street: 'Ahornweg', nr: '2', plz: '79102', ort: 'Freiburg', name: 'Seitz' });
  for (let i = 0; i < 3; i++) await fails(400, 'k5', 'POST', '/api/customer/verify-number', { kdnr: 'falsch' + i });
  assert.equal((await ok('k5', 'GET', '/api/customer/state')).resident.status, 'review');
  const r = (await ok('admin', 'GET', '/api/admin/queue')).residents.find(x => x.name === 'Seitz');
  assert.equal(r.status, 'pending');
  await ok('admin', 'POST', `/api/admin/residents/${r.id}`, { action: 'reject' });
  assert.equal((await ok('k5', 'GET', '/api/customer/state')).resident.status, 'rejected');
});

test('Adresse ohne teilnehmenden Kaminfeger: Konto ja, Wohnsitz später', async () => {
  const reg = await registerCustomer('k6', 'berlin@test.de', { street: 'Unter den Linden', nr: '1', plz: '10117', ort: 'Berlin', name: 'Schmidt' });
  assert.deepEqual([reg.next, reg.status, reg.known], ['done', 'unverified', false]);
  const st = await ok('k6', 'GET', '/api/customer/state');
  assert.deepEqual([st.campaign, st.listed, st.sweep], [null, false, null]);
});

test('Zeitfenster ändern: nicht mehr passende Buchungen werden freigegeben und benachrichtigt', async () => {
  const detail = await ok('s', 'GET', `/api/sweep/campaigns/${campaignId}`);
  const [w1, w2] = detail.windows;
  const r = await ok('s', 'POST', '/api/sweep/campaigns', { id: campaignId, slotLen: 30, deadline: iso(5),
    windows: [{ id: w1.id, date: w1.date, start: '08:30', end: '10:00' }, { id: w2.id, date: w2.date, start: '13:00', end: '14:00' }] });
  assert.equal(r.dropped, 1, 'Berger (08:00) passt nicht mehr');
  const st = await ok('k1', 'GET', '/api/customer/state');
  assert.equal(st.houseStatus, 'open');
  assert.ok(st.messages.some(m => m.text.includes('passt leider nicht mehr')));
  await ok('k1', 'POST', '/api/customer/book', { windowId: w1.id, time: '08:30' });
});

test('Termintag: Route starten, live sehen, erledigt / niemand da, neu buchen', async () => {
  const route = await ok('s', 'GET', `/api/sweep/route?date=${D1}`);
  assert.deepEqual(route.stops.map(s => [s.t, s.nr]), [['08:30', '1'], ['09:00', '3']]);
  await fails(400, 's', 'POST', '/api/sweep/visit', { bookingId: route.stops[0].id, result: 'done' });
  assert.equal((await ok('k3', 'GET', '/api/customer/state')).live, null, 'vor dem Start nichts live');
  await ok('s', 'POST', '/api/sweep/route/start', { date: D1 });
  let live = (await ok('k3', 'GET', '/api/customer/state')).live;
  assert.equal(live.curNr, '1');
  assert.deepEqual(live.stops.map(s => s.me), [false, true]);
  await ok('s', 'POST', '/api/sweep/visit', { bookingId: route.stops[0].id, result: 'done' });
  live = (await ok('k3', 'GET', '/api/customer/state')).live;
  assert.equal(live.curNr, '3');
  await ok('s', 'POST', '/api/sweep/visit', { bookingId: route.stops[1].id, result: 'missed' });
  const st = await ok('k3', 'GET', '/api/customer/state');
  assert.equal(st.booking.visit, 'missed');
  assert.ok(st.messages.at(-1).text.includes('niemand geöffnet'));
  assert.equal(lastMail('keller@test.de').subject, 'Sie wurden nicht angetroffen');
  const w2 = st.campaign.windows[1];
  await ok('k3', 'POST', '/api/customer/book', { windowId: w2.id, time: '13:00' });
  assert.equal((await ok('k3', 'GET', '/api/customer/state')).booking.visit, null);
  const d = await ok('s', 'GET', `/api/sweep/campaigns/${campaignId}`);
  assert.equal(d.houses.find(h => h.nr === '1').booking.visit, 'done');
});

test('Nachrichten an Empfängergruppen, gelesen markieren', async () => {
  const m = await ok('s', 'GET', '/api/sweep/messages');
  const c = m.campaigns.find(x => x.id === campaignId);
  assert.equal(c.n.all, 4);
  const r = await ok('s', 'POST', '/api/sweep/messages', { campaignId, rcpt: 'all', text: 'Ich bin heute 15 Minuten später dran.' });
  assert.equal(r.n, 4);
  let st = await ok('k1', 'GET', '/api/customer/state');
  assert.ok(st.messages.some(x => !x.read));
  await ok('k1', 'POST', '/api/customer/read');
  st = await ok('k1', 'GET', '/api/customer/state');
  assert.ok(st.messages.every(x => x.read));
});

test('Messenger: Bewohner und Kaminfeger schreiben sich, gelesen, gebündelte E-Mail', async () => {
  // Bewohner schreibt, Kaminfeger sieht die Unterhaltung mit Zähler
  await ok('k1', 'POST', '/api/customer/chat', { text: 'Kann ich den Schlüssel beim Nachbarn lassen?' });
  await ok('k1', 'POST', '/api/customer/chat', { text: 'Nr. 3, Familie Yilmaz.' });
  await fails(400, 'k1', 'POST', '/api/customer/chat', { text: '   ' });
  let ov = await ok('s', 'GET', '/api/sweep/overview');
  assert.equal(ov.chatUnread, 2);
  const list = await ok('s', 'GET', '/api/sweep/chats');
  const t = list.chats[0];
  assert.equal(t.unread, 2);
  assert.equal(t.last, 'Nr. 3, Familie Yilmaz.');
  const th = await ok('s', 'GET', `/api/sweep/chats/${t.id}`);
  assert.equal(th.hasApp, true);
  assert.equal(th.messages.length, 2);
  // Nach 10 Minuten ungelesen: genau eine Mail an den Kaminfeger
  run(`UPDATE chat_messages SET created_at = datetime('now','-11 minutes')`);
  const before = all('SELECT id FROM outbox WHERE to_addr = ?', 'mb@test.de').length;
  sendChatMails(); sendChatMails();
  assert.equal(all('SELECT id FROM outbox WHERE to_addr = ?', 'mb@test.de').length, before + 1);
  assert.match(lastMail('mb@test.de').subject, /Neue Nachricht/);
  run(`UPDATE chat_messages SET created_at = datetime('now')`);
  // Kaminfeger liest und antwortet
  await ok('s', 'POST', `/api/sweep/chats/${t.id}/read`);
  assert.equal((await ok('s', 'GET', '/api/sweep/overview')).chatUnread, 0);
  await ok('s', 'POST', `/api/sweep/chats/${t.id}`, { text: 'Ja, gerne – ich klingle dort.' });
  let st = await ok('k1', 'GET', '/api/customer/state');
  assert.equal(st.chatUnread, 1);
  const ch = await ok('k1', 'GET', '/api/customer/chat');
  assert.equal(ch.canWrite, true);
  assert.deepEqual(ch.messages.map(m => m.fromSweep), [false, false, true]);
  await ok('k1', 'POST', '/api/customer/read');
  assert.equal((await ok('k1', 'GET', '/api/customer/state')).chatUnread, 0);
  // Fremde Haushalte und Haushalte ohne App
  const other = get(`SELECT id FROM households WHERE id != ? AND id NOT IN (SELECT household_id FROM residents WHERE household_id IS NOT NULL)`, t.id);
  await fails(400, 's', 'POST', `/api/sweep/chats/${other.id}`, { text: 'Hallo' });
  await fails(404, 's', 'GET', '/api/sweep/chats/999999');
  await fails(401, 'niemand', 'GET', '/api/customer/chat');
});

test('Erinnerungen am Vorabend und eine Stunde vorher', async () => {
  const b = get(`SELECT b.*, w.date FROM bookings b JOIN windows w ON w.id = b.window_id WHERE b.status = 'booked' AND b.time = '13:00'`);
  const [y, mo, d] = b.date.split('-').map(Number);
  const before = all('SELECT id FROM outbox WHERE to_addr = ?', 'keller@test.de').length;
  sendReminders(new Date(y, mo - 1, d - 1, 18, 5));
  sendReminders(new Date(y, mo - 1, d - 1, 18, 6));
  assert.equal(all('SELECT id FROM outbox WHERE to_addr = ?', 'keller@test.de').length, before + 1, 'Vorabend genau einmal');
  await ok('k3', 'POST', '/api/customer/prefs', { hour: false });
  sendReminders(new Date(y, mo - 1, d, 12, 10));
  assert.equal(all('SELECT id FROM outbox WHERE to_addr = ?', 'keller@test.de').length, before + 1, 'abgeschaltete Erinnerung kommt nicht');
});

test('Profil: Mitbewohner einladen, Umzug melden', async () => {
  await ok('k1', 'POST', '/api/customer/members', { email: 'tom@test.de' });
  const token = new URL(lastMail('tom@test.de').link).searchParams.get('einladung');
  const reg = await registerCustomer('k1b', 'tom@test.de', { invite: token, person: 'Tom Berger' });
  assert.equal(reg.status, 'verified');
  const st = await ok('k1b', 'GET', '/api/customer/state');
  assert.equal(st.resident.isMember, true);
  assert.ok(st.booking, 'Mitbewohner sieht den Termin');
  await ok('k1', 'POST', '/api/customer/move');
  const after = await ok('k1', 'GET', '/api/customer/state');
  assert.equal(after.resident.status, 'moved');
  assert.equal(after.campaign, null);
  const d = await ok('s', 'GET', `/api/sweep/campaigns/${campaignId}`);
  const h1 = d.houses.find(h => h.nr === '1');
  assert.equal(h1.moved, true);
});

test('Abmelden und wieder anmelden', async () => {
  await ok('k4', 'POST', '/api/customer/logout');
  await fails(401, 'k4', 'GET', '/api/customer/state');
  await ok('k4', 'POST', '/api/auth/code', { email: 'unbekannt@test.de', role: 'customer', purpose: 'login' });
  assert.equal(lastMail('unbekannt@test.de').subject, 'Anmeldung nicht möglich');
  await login('customer', 'oezdemir@test.de', 'k4');
  assert.equal((await ok('k4', 'GET', '/api/customer/state')).resident.family, 'S. Özdemir');
});

test('Schutz: fremde Herkunft, Zugriff auf fremde Daten', async () => {
  await fails(403, 'k4', 'POST', '/api/customer/cancel', {}, { headers: { origin: 'https://boese.example' } });
  const r = await call('s2', 'GET', `/api/sweep/campaigns/${campaignId}`);
  assert.ok([403, 404].includes(r.status));
  await fails(401, 'k4', 'GET', '/api/admin/queue');
});

test('Nach dem Umzug: neue Adresse verifizieren', async () => {
  await fails(400, 'k3', 'POST', '/api/customer/readdress', { street: 'Ahornweg', nr: '1', plz: '79102', ort: 'Freiburg' });
  const r = await ok('k1', 'POST', '/api/customer/readdress', { street: 'Ahornweg', nr: '1', plz: '79102', ort: 'Freiburg', name: 'Berger' });
  assert.equal(r.next, 'verify');
  await ok('k1', 'POST', '/api/customer/verify-number', { kdnr: 'KF-14-1001' });
  const st = await ok('k1', 'GET', '/api/customer/state');
  assert.deepEqual([st.resident.status, st.resident.street, st.resident.nr], ['verified', 'Ahornweg', '1']);
});

test('Freigabeliste im Testbetrieb', async () => {
  const { config } = await import('../config.js');
  config.allowedEmails = ['erlaubt@test.de', '@team.de'];
  try {
    await fails(403, 'fl', 'POST', '/api/auth/code', { email: 'fremd@test.de', role: 'customer', purpose: 'register' });
    await ok('fl', 'POST', '/api/auth/code', { email: 'erlaubt@test.de', role: 'customer', purpose: 'register' });
    await ok('fl', 'POST', '/api/auth/code', { email: 'jemand@team.de', role: 'customer', purpose: 'register' });
    await ok('fl', 'POST', '/api/auth/code', { email: 'admin@test.de', role: 'admin', purpose: 'login' });
  } finally { config.allowedEmails = []; }
});

test('Konto löschen: Bewohner und Kaminfeger', async () => {
  const reg = await registerCustomer('kd', 'loeschen@test.de', { street: 'Lindenstraße', nr: '4', plz: '79102', ort: 'Freiburg', name: 'Weg' });
  assert.equal(reg.next, 'verify');
  await fails(400, 'kd', 'POST', '/api/customer/delete', { confirm: 'ja' });
  await ok('kd', 'POST', '/api/customer/delete', { confirm: 'LÖSCHEN' });
  await fails(401, 'kd', 'GET', '/api/customer/state');
  assert.equal(get(`SELECT COUNT(*) n FROM users WHERE email = 'loeschen@test.de'`).n, 0);
  // Kaminfeger (abgelehnter Zweit-Account aus einem früheren Test ist wieder pending) löscht sich samt Dokumenten
  const before = fs.readdirSync(path.join(dir, 'uploads')).length;
  await ok('s2', 'POST', '/api/sweep/delete', { confirm: 'LÖSCHEN' });
  await fails(401, 's2', 'GET', '/api/sweep/me');
  assert.ok(fs.readdirSync(path.join(dir, 'uploads')).length < before, 'Dokumente gelöscht');
  assert.equal(get(`SELECT COUNT(*) n FROM users WHERE email = 'em@test.de'`).n, 0);
});

test('Konfiguration für die App: Testbetrieb und Betreiberangaben', async () => {
  const c = await ok('x', 'GET', '/api/config');
  assert.equal(typeof c.restricted, 'boolean');
  assert.equal(c.operator.email, 'admin@test.de');
});

test('Feedback: mit Bild und Markierung, beim Betreiber sichtbar, verschwindet mit dem Konto', async () => {
  await registerCustomer('fbk', 'feedback@test.de', { street: 'Lindenstraße', nr: '6', plz: '79102', ort: 'Freiburg', name: 'Rückmeldung' });
  const jpeg = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]).toString('base64');
  // Ohne Anmeldung (Startseite, Registrierung): anonym, E-Mail optional
  await ok('niemand', 'POST', '/api/feedback', { role: 'public', note: 'Startseite lädt langsam', page: '/' });
  await ok('niemand', 'POST', '/api/feedback', { role: 'customer', note: 'Registrierung unklar', contact: 'Frage@Test.de' });
  await fails(400, 'niemand', 'POST', '/api/feedback', { role: 'public', note: 'Hallo Welt', contact: 'keine-mail' });
  await fails(400, 'fbk', 'POST', '/api/feedback', { role: 'customer', note: 'x' });
  await fails(400, 'fbk', 'POST', '/api/feedback', { role: 'customer', note: 'Kein JPEG', image: 'data:image/png;base64,AAAA' });
  await ok('fbk', 'POST', '/api/feedback', { role: 'customer', note: 'Knopf reagiert nicht', page: '/kunde · home', image: jpeg, mark: { x: 0.1, y: 0.2, w: 0.3, h: 0.1 }, device: '390×844' });
  await fails(401, 'fbk', 'GET', '/api/admin/feedback');
  await login('admin', 'admin@test.de');
  const { items } = await ok('admin', 'GET', '/api/admin/feedback');
  const f = items.find(i => i.email === 'feedback@test.de');
  assert.equal(f.note, 'Knopf reagiert nicht');
  assert.deepEqual(f.mark, { x: 0.1, y: 0.2, w: 0.3, h: 0.1 });
  assert.equal(f.status, 'open');
  assert.ok(items.some(i => i.note === 'Startseite lädt langsam' && i.email === 'ohne Anmeldung' && i.role === 'public'));
  assert.ok(items.some(i => i.note === 'Registrierung unklar' && i.email === 'frage@test.de'));
  const img = await call('admin', 'GET', `/api/admin/feedback/${f.id}/image`);
  assert.equal(img.res.headers['content-type'], 'image/jpeg');
  await ok('admin', 'POST', `/api/admin/feedback/${f.id}`, { action: 'done' });
  assert.equal(get('SELECT status FROM feedback WHERE id = ?', f.id).status, 'done');
  await ok('fbk', 'POST', '/api/customer/delete', { confirm: 'LÖSCHEN' });
  assert.equal(get('SELECT COUNT(*) n FROM feedback WHERE id = ?', f.id).n, 0, 'Feedback mit Konto gelöscht');
});

test('Kaminfeger: Termin verschieben, absagen, Tag absagen (mit Ersatztag)', async () => {
  const D3 = iso(20), D4 = iso(21), D5 = iso(25);
  const c = await ok('s', 'POST', '/api/sweep/campaigns', { street: 'Ahornweg', plz: '79102', slotLen: 30, deadline: iso(15),
    windows: [{ date: D3, start: '08:00', end: '10:00' }, { date: D4, start: '13:00', end: '15:00' }] });
  const st = await ok('k1', 'GET', '/api/customer/state');
  const [w3, w4] = st.campaign.windows;
  await ok('k1', 'POST', '/api/customer/book', { windowId: w3.id, time: '08:30' });
  const bookingId = () => get(`SELECT id FROM bookings WHERE campaign_id = ? AND status = 'booked'`, c.id).id;
  // Verschieben: freie Zeit, Haushalt informiert
  await fails(400, 's', 'POST', `/api/sweep/bookings/${bookingId()}/move`, { windowId: w3.id, time: '08:30' });
  await fails(400, 's', 'POST', `/api/sweep/bookings/${bookingId()}/move`, { windowId: w4.id, time: '13:15' });
  const mv = await ok('s', 'POST', `/api/sweep/bookings/${bookingId()}/move`, { windowId: w4.id, time: '14:00', reason: 'Terminkonflikt' });
  assert.ok(mv.toast.includes('14:00'));
  let me = await ok('k1', 'GET', '/api/customer/state');
  assert.deepEqual([me.booking.windowId, me.booking.t], [w4.id, '14:00']);
  assert.ok(lastMail('berger@test.de').subject.startsWith('Termin verschoben'));
  assert.ok(lastMail('berger@test.de').text.includes('Grund: Terminkonflikt'));
  // Absagen: Haushalt ist wieder offen und kann neu buchen
  await ok('s', 'POST', `/api/sweep/bookings/${bookingId()}/cancel`, { reason: 'Krankheit' });
  me = await ok('k1', 'GET', '/api/customer/state');
  assert.equal(me.booking, null);
  assert.ok(lastMail('berger@test.de').subject.startsWith('Termin abgesagt'));
  await ok('k1', 'POST', '/api/customer/book', { windowId: w3.id, time: '09:00' });
  // Tag absagen: Termine darin freigegeben, Fenster entfällt
  await ok('s', 'POST', `/api/sweep/windows/${w3.id}/cancel`, { reason: 'Wetter' });
  me = await ok('k1', 'GET', '/api/customer/state');
  assert.equal(me.booking, null);
  assert.deepEqual(me.campaign.windows.map(w => w.id), [w4.id]);
  assert.ok(lastMail('berger@test.de').text.includes('Grund: Wetter'));
  // Letzter Tag: nur mit Ersatztag (nicht Sonntag, nicht Vergangenheit)
  await fails(400, 's', 'POST', `/api/sweep/windows/${w4.id}/cancel`, {});
  await fails(400, 's', 'POST', `/api/sweep/windows/${w4.id}/cancel`, { date: iso(-3) });
  await ok('k1', 'POST', '/api/customer/book', { windowId: w4.id, time: '13:00' });
  const r = await ok('s', 'POST', `/api/sweep/windows/${w4.id}/cancel`, { date: D5 });
  assert.equal(r.affected, 1);
  me = await ok('k1', 'GET', '/api/customer/state');
  assert.deepEqual([me.booking, me.campaign.windows[0].date], [null, D5]);
  // Ersatztag vor der Antwortfrist → Frist rückt auf den Vortag
  const early = iso(3);
  await ok('s', 'POST', `/api/sweep/windows/${w4.id}/cancel`, { date: early });
  assert.ok(get('SELECT deadline FROM campaigns WHERE id = ?', c.id).deadline < early);
});

test('Kaminfeger: Kundenliste mit Status und Glocke mit Absagen', async () => {
  const { customers } = await ok('s', 'GET', '/api/sweep/customers');
  assert.ok(customers.length >= 5);
  const one = customers.find(c => c.street === 'Lindenstraße' && c.nr === '1');
  assert.ok(['booked', 'done', 'missed', 'open', 'cancelled', 'moved', 'none'].includes(one.status));
  assert.ok(customers.every(c => 'line' in c && 'campaignId' in c));
  const ov = await ok('s', 'GET', '/api/sweep/overview');
  assert.ok(Array.isArray(ov.alerts));
  await fails(401, 'niemand', 'GET', '/api/sweep/customers');
});

test('Passkeys: Betreiber-Pflicht, danach kein E-Mail-Code mehr; Einrichten nur angemeldet', async () => {
  const { config } = await import('../config.js');
  await login('admin', 'admin@test.de');
  config.adminPasskeyRequired = true;
  try {
    await fails(403, 'admin', 'GET', '/api/admin/queue');
    const me = await ok('admin', 'GET', '/api/auth/me?role=admin');
    assert.equal(me.user.passkeys, 0);
    const reg = await ok('admin', 'POST', '/api/passkey/register/options', { role: 'admin' });
    assert.ok(reg.options.challenge && reg.challengeId);
    assert.equal(reg.options.authenticatorSelection.residentKey, 'required');
    await fails(401, 'niemand', 'POST', '/api/passkey/register/options', { role: 'sweep' });
    await fails(400, 'admin', 'POST', '/api/passkey/register/verify', { role: 'admin', challengeId: 'falsch', response: {} });
    // Passkey vorhanden (hier direkt eingetragen) → Bereich offen, E-Mail-Code gesperrt
    const u = get(`SELECT id FROM users WHERE email = 'admin@test.de' AND role = 'admin'`);
    run(`INSERT INTO passkeys (user_id, cred_id, public_key, name) VALUES (?, 'test-cred', x'00', 'Test')`, u.id);
    await ok('admin', 'GET', '/api/admin/queue');
    const r = await fails(400, 'x', 'POST', '/api/auth/code', { email: 'admin@test.de', role: 'admin', purpose: 'login' });
    assert.equal(r.code, 'passkey_required');
    const list = await ok('admin', 'GET', '/api/passkey/list?role=admin');
    assert.equal(list.passkeys.length, 1);
    await fails(400, 'admin', 'POST', '/api/passkey/delete', { role: 'admin', id: list.passkeys[0].id });
    // Anmelde-Optionen ohne Konto (Passkey bringt das Konto mit), unbekannter Passkey wird abgewiesen
    const lo = await ok('x', 'POST', '/api/passkey/login/options', { role: 'sweep' });
    const bad = await fails(400, 'x', 'POST', '/api/passkey/login/verify', { role: 'sweep', challengeId: lo.challengeId, response: { id: 'test-cred' } });
    assert.equal(bad.code, 'passkey_unknown');
    // Standard (Passkey freiwillig): E-Mail-Code geht trotz Passkey weiter
    config.adminPasskeyRequired = false;
    await ok('x', 'POST', '/api/auth/code', { email: 'admin@test.de', role: 'admin', purpose: 'login' });
    await login('admin', 'admin@test.de');
    await ok('admin', 'GET', '/api/admin/queue');
    run(`DELETE FROM passkeys WHERE cred_id = 'test-cred'`);
  } finally { config.adminPasskeyRequired = false; }
});

test('Fristen: am Termintag kein Buchen/Absagen mehr, keine Tage in der Vergangenheit, Antwortfrist vor dem ersten Tag', async () => {
  const { today } = await import('../util.js');
  const c = get(`SELECT * FROM campaigns WHERE street = 'Ahornweg' ORDER BY id DESC LIMIT 1`);
  const w = get('SELECT * FROM windows WHERE campaign_id = ? ORDER BY date LIMIT 1', c.id);
  // Neue Tage nicht in der Vergangenheit, nicht sonntags
  await fails(400, 's', 'POST', '/api/sweep/campaigns', { id: c.id, slotLen: 30, deadline: iso(1), windows: [{ id: w.id, date: w.date, start: w.start, end: w.end }, { date: iso(-2), start: '08:00', end: '10:00' }] });
  const sun = new Date(); sun.setDate(sun.getDate() + ((7 - sun.getDay()) % 7 || 7));
  const sunIso = `${sun.getFullYear()}-${String(sun.getMonth() + 1).padStart(2, '0')}-${String(sun.getDate()).padStart(2, '0')}`;
  await fails(400, 's', 'POST', '/api/sweep/campaigns', { id: c.id, slotLen: 30, deadline: iso(1), windows: [{ date: sunIso, start: '08:00', end: '10:00' }] });
  // Antwortfrist nach dem ersten Tag → auf den Vortag gezogen
  const first = iso(12);
  await ok('s', 'POST', '/api/sweep/campaigns', { id: c.id, slotLen: 30, deadline: iso(30), windows: [{ id: w.id, date: first, start: '08:00', end: '10:00' }] });
  assert.ok(get('SELECT deadline FROM campaigns WHERE id = ?', c.id).deadline < first);
  // Buchen, dann wird es Termintag: nicht mehr änderbar
  await ok('k1', 'POST', '/api/customer/book', { windowId: w.id, time: '08:00' });
  run('UPDATE windows SET date = ? WHERE id = ?', today(), w.id);
  let me = await ok('k1', 'GET', '/api/customer/state');
  assert.equal(me.booking.changeable, false);
  assert.equal(me.campaign.windows[0].open, false);
  assert.equal((await fails(400, 'k1', 'POST', '/api/customer/cancel', {})).code, 'closed');
  assert.equal((await fails(400, 'k1', 'POST', '/api/customer/book', { windowId: w.id, time: '09:00' })).code, 'closed');
  // Der Kaminfeger kann weiterhin absagen; danach kann an diesem Tag nicht neu gebucht werden
  await ok('s', 'POST', `/api/sweep/bookings/${get(`SELECT id FROM bookings WHERE window_id = ? AND status = 'booked'`, w.id).id}/cancel`, {});
  assert.equal((await fails(400, 'k1', 'POST', '/api/customer/book', { windowId: w.id, time: '09:00' })).code, 'closed');
  run('UPDATE windows SET date = ? WHERE id = ?', first, w.id);
});

test('Schutz: ungültige Herkunft, Einladungen begrenzt, Anfragen pro Anschluss gebremst', async () => {
  const { config } = await import('../config.js');
  await fails(403, 'k1', 'POST', '/api/customer/prefs', { eve: true }, { headers: { origin: 'null' } });
  await fails(403, 'k1', 'POST', '/api/customer/prefs', { eve: true }, { headers: { origin: '::kaputt' } });
  await fails(400, 'k1', 'POST', '/api/customer/members', { email: 'berger@test.de' });
  await ok('k1', 'POST', '/api/customer/members', { email: 'gast1@test.de' });
  await fails(400, 'k1', 'POST', '/api/customer/members', { email: 'gast1@test.de' });
  const before = config.ipCodesPerHour;
  config.ipCodesPerHour = 1;
  try { await fails(429, 'x', 'POST', '/api/auth/code', { email: 'irgendwer@test.de', role: 'customer', purpose: 'login' }); }
  finally { config.ipCodesPerHour = before; }
});

test('Straße abschließen: erst wenn alles erledigt, danach wieder ungeplant und unter „Abgeschlossen“', async () => {
  await ok('s', 'POST', KUNDEN, undefined, form('file', 'kb.csv', 'text/csv', 'strasse;hausnummer;plz;ort;eigentuemer\nBirkenweg;1;79102;Freiburg;Roth\nBirkenweg;2;79102;Freiburg;Lang\n'));
  const D = iso(8);
  const { id } = await ok('s', 'POST', '/api/sweep/campaigns', { street: 'Birkenweg', plz: '79102', slotLen: 30, deadline: iso(2), windows: [{ date: D, start: '08:00', end: '10:00' }] });
  await fails(400, 's', 'POST', '/api/sweep/campaigns', { street: 'Birkenweg', plz: '79102', slotLen: 30, deadline: iso(2), windows: [{ date: D, start: '08:00', end: '10:00' }] });
  const c = await ok('s', 'GET', `/api/sweep/campaigns/${id}`);
  const [h1, h2] = c.houses, wid = c.windows[0].id;
  await ok('s', 'POST', '/api/sweep/bookings', { campaignId: id, householdId: h1.id, windowId: wid, time: '08:00' });
  await ok('s', 'POST', '/api/sweep/bookings', { campaignId: id, householdId: h2.id, windowId: wid, time: '08:30' });
  await ok('s', 'POST', '/api/sweep/route/start', { date: D });
  const b1 = get(`SELECT id FROM bookings WHERE household_id = ? AND status = 'booked'`, h1.id).id;
  const b2 = get(`SELECT id FROM bookings WHERE household_id = ? AND status = 'booked'`, h2.id).id;
  await ok('s', 'POST', '/api/sweep/visit', { bookingId: b1, result: 'done' });
  assert.equal((await fails(400, 's', 'POST', `/api/sweep/campaigns/${id}/close`, {})).code, 'not_done');
  await ok('s', 'POST', '/api/sweep/visit', { bookingId: b2, result: 'done' });
  assert.equal((await ok('s', 'GET', `/api/sweep/campaigns/${id}`)).done, true);
  await ok('s', 'POST', `/api/sweep/campaigns/${id}/close`, {});
  const ov = await ok('s', 'GET', '/api/sweep/overview');
  assert.equal(ov.streets.find(x => x.street === 'Birkenweg').campaign, null);
  assert.ok(ov.closed.some(x => x.id === id && x.visited === 2 && x.households === 2));
  const cu = (await ok('s', 'GET', '/api/sweep/customers')).customers.find(x => x.id === h1.id);
  assert.equal(cu.status, 'none'); assert.ok(cu.line.startsWith('Zuletzt erledigt'));
  assert.equal(ov.closed.find(x => x.id === id).work, 'Kehren und Überprüfen', 'ohne Angabe gilt „Kehren und Überprüfen“');
  // Abgeschlossen = schreibgeschützt; neue Runde möglich
  await fails(400, 's', 'POST', '/api/sweep/campaigns', { id, slotLen: 30, deadline: iso(2), windows: [{ date: iso(30), start: '08:00', end: '10:00' }] });
  await fails(400, 's', 'POST', '/api/sweep/messages', { campaignId: id, rcpt: 'all', text: 'Hallo' });
  const next = await ok('s', 'POST', '/api/sweep/campaigns', { street: 'Birkenweg', plz: '79102', slotLen: 30, deadline: iso(25), windows: [{ date: iso(30), start: '08:00', end: '10:00' }] });
  assert.notEqual(next.id, id);
  assert.equal((await ok('s', 'GET', `/api/sweep/campaigns/${next.id}`)).houses.every(h => h.status === 'open'), true);
});

test('Zwei Betriebe führen dieselbe Adresse: Bewohner wählt · Konto löschen nimmt Kundenliste, Termine und Chats mit', async () => {
  const email = 'neu-kf@test.de';
  await ok('n', 'POST', '/api/auth/code', { email, role: 'sweep', purpose: 'register' });
  await ok('n', 'POST', '/api/sweep/register', { first: 'Nora', last: 'Kessler', company: 'Kessler Schornsteinfeger', bstreet: 'Hauptstr. 3', bplz: '88416', bort: 'Ochsenhausen', email, code: codeFor(email) });
  await upload('n', '/api/sweep/documents/ausweis', 'a.jpg', 'image/jpeg', 'jpg');
  await ok('n', 'POST', '/api/sweep/submit', { assure: true });
  const item = (await ok('admin', 'GET', '/api/admin/queue')).sweeps.find(s => s.name === 'Kessler Schornsteinfeger');
  await ok('admin', 'POST', `/api/admin/sweeps/${item.id}/approve`, { checks: ['bafa', 'leiter', 'id'] });
  // Gleicher Name am selben Ort fällt dem Betreiber auf
  await ok('n2', 'POST', '/api/auth/code', { email: 'zweit@test.de', role: 'sweep', purpose: 'register' });
  await ok('n2', 'POST', '/api/sweep/register', { first: 'Nora', last: 'Kessler', bstreet: 'X 1', bplz: '88416', bort: 'Ochsenhausen', email: 'zweit@test.de', code: codeFor('zweit@test.de') });
  await upload('n2', '/api/sweep/documents/ausweis', 'a.jpg', 'image/jpeg', 'jpg');
  await ok('n2', 'POST', '/api/sweep/submit', { assure: true });
  const twin = (await ok('admin', 'GET', '/api/admin/queue')).sweeps.find(s => s.name === 'Nora Kessler');
  assert.ok(twin.auto.some(a => a[0] === 'warn' && a[1].includes('Gleicher Name') && a[1].includes('Kessler Schornsteinfeger')));
  await ok('n2', 'POST', '/api/sweep/delete', { confirm: 'LÖSCHEN' });

  // Kessler führt die Lindenstraße 4 ebenfalls – dort wohnt Özdemir (k4), bisher bei Brandt
  await ok('n', 'POST', KUNDEN, undefined, form('file', 'k.csv', 'text/csv',
    'strasse;hausnummer;plz;ort;kunde;kundennummer;email\nLindenstraße;4;79102;Freiburg;Lang;KS-0004;\nTannenweg;1;88416;Ochsenhausen;Maier;KS-0001;maier@test.de\n'));
  const nid = get(`SELECT id FROM sweeps WHERE company = 'Kessler Schornsteinfeger'`).id;
  let st = await ok('k4', 'GET', '/api/customer/state');
  assert.equal(st.sweep.company, 'Kaminfeger Brandt');
  assert.deepEqual(st.options.map(o => o.company), ['Kessler Schornsteinfeger']);
  await fails(400, 'k4', 'POST', '/api/customer/choose', { householdId: 999999 });
  await fails(400, 'k4', 'POST', '/api/customer/choose', { householdId: get(`SELECT id FROM households WHERE street = 'Tannenweg'`).id });
  await fails(403, 'k6', 'POST', '/api/customer/choose', { householdId: st.options[0].id });
  await ok('k4', 'POST', '/api/customer/choose', { householdId: st.options[0].id });
  st = await ok('k4', 'GET', '/api/customer/state');
  assert.equal(st.sweep.company, 'Kessler Schornsteinfeger');
  assert.deepEqual(st.options.map(o => o.company), ['Kaminfeger Brandt']);
  // Neuer Bewohner an derselben Adresse: Die Kundennummer zeigt, zu welchem Betrieb er gehört
  const reg = await registerCustomer('k7', 'zwei@test.de', { street: 'Lindenstraße', nr: '4', plz: '79102', ort: 'Freiburg', name: 'Zweit' });
  assert.equal(reg.next, 'verify');
  await ok('k7', 'POST', '/api/customer/verify-number', { kdnr: 'ks 0004' });
  assert.equal((await ok('k7', 'GET', '/api/customer/state')).sweep.company, 'Kessler Schornsteinfeger');
  // Jeder Betrieb sieht nur seine eigene Kundenliste
  assert.ok((await ok('n', 'GET', '/api/sweep/customers')).customers.every(c => ['Lindenstraße', 'Tannenweg'].includes(c.street)));
  assert.equal((await ok('n', 'GET', '/api/sweep/customers')).customers.length, 2);
  assert.ok(!(await ok('s', 'GET', '/api/sweep/customers')).customers.some(c => c.street === 'Tannenweg'));
  const r = await call('n', 'GET', `/api/sweep/campaigns/${campaignId}`);
  assert.equal(r.status, 404, 'fremde Runde');
  // Runde mit eigener Bezeichnung, Chat – dann löscht Kessler das Konto
  const c = await ok('n', 'POST', '/api/sweep/campaigns', { street: 'Lindenstraße', plz: '79102', work: 'Abgaswegeüberprüfung', slotLen: 30, deadline: iso(3), windows: [{ date: iso(9), start: '08:00', end: '10:00' }] });
  st = await ok('k7', 'GET', '/api/customer/state');
  assert.equal(st.campaign.work, 'Abgaswegeüberprüfung');
  await ok('k7', 'POST', '/api/customer/book', { windowId: st.campaign.windows[0].id, time: '08:00' });
  await ok('k7', 'POST', '/api/customer/chat', { text: 'Bitte klingeln Sie bei Zweit.' });
  const brandtHouseholds = get(`SELECT COUNT(*) n FROM households WHERE sweep_id != ?`, nid).n;
  await ok('n', 'POST', '/api/sweep/delete', { confirm: 'LÖSCHEN' });
  await fails(401, 'n', 'GET', '/api/sweep/me');
  assert.deepEqual([get('SELECT COUNT(*) n FROM households WHERE sweep_id = ?', nid).n, get('SELECT COUNT(*) n FROM campaigns WHERE id = ?', c.id).n,
    get('SELECT COUNT(*) n FROM bookings WHERE campaign_id = ?', c.id).n, get(`SELECT COUNT(*) n FROM chat_messages WHERE text = 'Bitte klingeln Sie bei Zweit.'`).n], [0, 0, 0, 0]);
  assert.equal(get(`SELECT COUNT(*) n FROM households WHERE sweep_id != ?`, nid).n, brandtHouseholds, 'andere Kundenlisten bleiben unberührt');
  st = await ok('k7', 'GET', '/api/customer/state');
  assert.deepEqual([st.resident.status, st.listed, st.sweep, st.campaign], ['unverified', false, null, null], 'Bewohner-Konto bleibt, Zuordnung ist weg');
  assert.ok((await ok('admin', 'GET', '/api/admin/log')).log.some(l => l.what.includes('Kaminfeger-Konto gelöscht') && l.what.includes('Kessler')));
  assert.equal(get('PRAGMA foreign_key_check'), undefined);
});

test('Vorschau für den Betreiber: Beispiel-Betrieb abgeschottet, keine Mails, eigene Sitzungen', async () => {
  const r = await ok('admin', 'POST', '/api/admin/demo', { as: 'sweep' });
  assert.equal(r.url, '/kaminfeger');
  const me = await ok('admin', 'GET', '/api/sweep/me');
  assert.deepEqual([me.demo, me.status, me.company], [true, 'active', 'Kaminfeger Muster']);
  const ov = await ok('admin', 'GET', '/api/sweep/overview');
  assert.ok(ov.streets.length === 3 && ov.today.isToday && ov.today.count === 5);
  assert.equal(ov.streets.find(x => x.campaign).campaign.work, 'Kehren und Überprüfen');
  await fails(400, 'admin', 'POST', KUNDEN, undefined, form('file', 'kb.csv', 'text/csv', 'strasse;hausnummer;plz;ort;eigentuemer;email\nX;1;11111;Y;Z;echt@test.de\n'));
  // Bewohner-Sicht
  await ok('admin', 'POST', '/api/admin/demo', { as: 'customer' });
  const st = await ok('admin', 'GET', '/api/customer/state');
  assert.deepEqual([st.demo, st.resident.family, !!st.booking, st.sweep.company], [true, 'Engel', true, 'Kaminfeger Muster']);
  assert.ok(!JSON.stringify(st).includes('Feuerst'));
  await fails(400, 'admin', 'POST', '/api/customer/members', { email: 'fremd@test.de' });
  // Für echte Nutzer unsichtbar
  assert.deepEqual(await ok('x', 'POST', '/api/customer/lookup', { street: 'Lindenweg', nr: '5', plz: '00000' }), { known: false, householdFound: false });
  const q = await ok('admin', 'GET', '/api/admin/queue');
  assert.ok(!q.sweeps.some(s => s.name === 'Kaminfeger Muster' || s.person === 'Max Muster'));
  // Keine Mails an Demo-Adressen
  const before = get('SELECT COUNT(*) n FROM outbox').n;
  const bid = get(`SELECT b.id FROM bookings b JOIN households h ON h.id = b.household_id JOIN sweeps s ON s.id = h.sweep_id WHERE s.demo = 1 AND b.status = 'booked' LIMIT 1`).id;
  await ok('admin', 'POST', '/api/admin/demo', { as: 'sweep' });
  await ok('admin', 'POST', `/api/sweep/bookings/${bid}/cancel`, {});
  assert.equal(get('SELECT COUNT(*) n FROM outbox').n, before);
  // Zurücksetzen legt alles frisch an, Nicht-Betreiber dürfen nicht
  await ok('admin', 'POST', '/api/admin/demo', { as: 'sweep', reset: true });
  assert.deepEqual([get(`SELECT COUNT(*) n FROM sweeps WHERE demo = 1`).n, get(`SELECT COUNT(*) n FROM households h JOIN sweeps s ON s.id = h.sweep_id WHERE s.demo = 1`).n], [1, 20]);
  await fails(401, 'k1', 'POST', '/api/admin/demo', { as: 'sweep' });
});

test('Nirgends mehr Feuerstättenschau oder Kehrbuch in E-Mails an Nutzer', async () => {
  const bad = all('SELECT to_addr, subject, text FROM outbox').filter(m => /Feuerstättenschau|Kehrbuch|Kehrbezirk|Bezirksverzeichnis/.test(m.subject + m.text)
    && !m.text.includes('Feuerstättenschau laufen nicht über die App'));
  assert.deepEqual(bad.map(m => m.subject), []);
});
