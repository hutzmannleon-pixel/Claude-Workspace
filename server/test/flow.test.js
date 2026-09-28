// Integrationstest: spielt alle Abläufe über die echte API durch – mit eigener, temporärer Datenbank.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kf-test-'));
Object.assign(process.env, { DATA_DIR: dir, TEST_MODE: '1', ADMIN_EMAILS: 'admin@test.de', BASE_URL: 'http://localhost:3000', APP_SECRET: 'test' });

const { build } = await import('../index.js');
const { get, all, run } = await import('../db.js');
const { sendReminders } = await import('../jobs.js');
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
const iso = n => { const d = new Date(); d.setDate(d.getDate() + n); while (d.getDay() === 0) d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); };
async function login(role, email, jar = role) {
  await ok(jar, 'POST', '/api/auth/code', { email, role, purpose: 'login' });
  await ok(jar, 'POST', '/api/auth/login', { email, role, code: codeFor(email) });
}
async function registerCustomer(jar, email, addr) {
  await ok(jar, 'POST', '/api/auth/code', { email, role: 'customer', purpose: 'register' });
  return ok(jar, 'POST', '/api/customer/register', { email, code: codeFor(email), ...addr });
}
const D1 = iso(10), D2 = iso(11);

// ---------- Tests ----------
test('Betreiber: nur freigeschaltete Admins, Verzeichnis per CSV', async () => {
  await ok('x', 'POST', '/api/auth/code', { email: 'fremd@test.de', role: 'admin', purpose: 'login' });
  assert.equal(lastMail('fremd@test.de'), undefined, 'kein Code an Nicht-Admins');
  await fails(400, 'x', 'POST', '/api/auth/login', { email: 'fremd@test.de', role: 'admin', code: '123456' });
  await login('admin', 'admin@test.de');
  await fails(401, 'nobody', 'GET', '/api/admin/queue');
  const csv = 'bundesland;kreis;bezirk;name;email;betriebsadresse;bestellt_bis\n' +
    'Baden-Württemberg;Freiburg im Breisgau;14;Markus Brandt;amt-brandt@test.de;Talstraße 12, 79102 Freiburg;2031-12-31\n' +
    'Baden-Württemberg;Freiburg im Breisgau;15;Erika Muster;amt-muster@test.de;Hauptstr. 1, 79100 Freiburg;2030-12-31\n' +
    'Baden-Württemberg;;16;;;\n';
  const r = await upload('admin', '/api/admin/directory', 'v.csv', 'text/csv', csv);
  assert.equal(r.status, 200);
  assert.deepEqual([r.json.added, r.json.errorCount], [2, 1]);
  const opts = await ok('x', 'GET', '/api/directory/options');
  assert.deepEqual(opts.kreise['Baden-Württemberg'], ['Freiburg im Breisgau']);
});

test('Login-Codes: falsch, abgelaufen nach 5 Versuchen, nur einmal gültig', async () => {
  await ok('s', 'POST', '/api/auth/code', { email: 'mb@test.de', role: 'sweep', purpose: 'register' });
  const code = codeFor('mb@test.de');
  assert.match(code, /^\d{6}$/);
  const wrong = code === '000000' ? '111111' : '000000';
  await fails(400, 's', 'POST', '/api/sweep/register', { first: 'Markus', last: 'Brandt', bstreet: 'Talstraße 12', bplz: '79102', bort: 'Freiburg', email: 'mb@test.de', code: wrong });
  await ok('s', 'POST', '/api/sweep/register', { first: 'Markus', last: 'Brandt', bstreet: 'Talstraße 12', bplz: '79102', bort: 'Freiburg', email: 'mb@test.de', code, phone: '0761 1234' });
  await fails(400, 's2', 'POST', '/api/sweep/register', { first: 'X', last: 'Y', bstreet: 'a', bplz: '79102', bort: 'b', email: 'mb@test.de', code });
  // Brute-Force: nach 5 Fehlversuchen ist der Code verbraucht
  await ok('k', 'POST', '/api/auth/code', { email: 'bf@test.de', role: 'customer', purpose: 'register' });
  const good = codeFor('bf@test.de');
  for (let i = 0; i < 5; i++) await fails(400, 'k', 'POST', '/api/customer/register', { email: 'bf@test.de', code: good === '000000' ? '999999' : '000000', street: 'Lindenstraße', nr: '1', plz: '79102', ort: 'Freiburg', name: 'X' });
  await fails(400, 'k', 'POST', '/api/customer/register', { email: 'bf@test.de', code: good, street: 'Lindenstraße', nr: '1', plz: '79102', ort: 'Freiburg', name: 'X' });
});

test('Kaminfeger: Bezirksabgleich, Unterlagen, Einreichen', async () => {
  assert.equal((await ok('s', 'POST', '/api/sweep/district', { land: 'Baden-Württemberg', kreis: 'Freiburg im Breisgau', bez: '15' })).result, 'other');
  assert.equal((await ok('s', 'POST', '/api/sweep/district', { land: 'Baden-Württemberg', kreis: 'Freiburg im Breisgau', bez: '99' })).result, 'unknown');
  assert.equal((await ok('s', 'POST', '/api/sweep/district', { land: 'Baden-Württemberg', kreis: 'Freiburg im Breisgau', bez: '014' })).result, 'ok');
  await fails(400, 's', 'POST', '/api/sweep/submit', { assure: true });
  assert.equal((await upload('s', '/api/sweep/documents/urkunde', 'x.exe', 'application/x-msdownload', 'MZ')).status, 400);
  assert.equal((await upload('s', '/api/sweep/documents/urkunde', 'urkunde.pdf', 'application/pdf', '%PDF-1.4 test')).status, 200);
  assert.equal((await upload('s', '/api/sweep/documents/ausweis', 'ausweis.jpg', 'image/jpeg', 'jpgdata')).status, 200);
  await fails(400, 's', 'POST', '/api/sweep/submit', { assure: false });
  await ok('s', 'POST', '/api/sweep/submit', { assure: true });
  assert.equal((await ok('s', 'GET', '/api/sweep/me')).status, 'pending');
  await fails(403, 's', 'GET', '/api/sweep/overview');
  assert.ok(lastMail('admin@test.de').subject.includes('Neue Prüfung'));
});

test('Betreiber: Dokumente ansehen, freigeben, Dokumente gelöscht, Freischaltlink an Verzeichnis-Adresse', async () => {
  const q = await ok('admin', 'GET', '/api/admin/queue');
  const item = q.sweeps.find(s => s.name === 'Markus Brandt');
  assert.equal(item.status, 'pending');
  const d = await ok('admin', 'GET', `/api/admin/sweeps/${item.id}`);
  assert.equal(d.docs.length, 2);
  const doc = await call('admin', 'GET', `/api/admin/documents/${d.docs[0].id}`);
  assert.equal(doc.status, 200);
  assert.equal(doc.res.headers['cache-control'], 'no-store, private');
  await fails(401, 's', 'GET', `/api/admin/documents/${d.docs[0].id}`);
  await fails(400, 'admin', 'POST', `/api/admin/sweeps/${item.id}/approve`, { checks: ['name', 'nr'] });
  await ok('admin', 'POST', `/api/admin/sweeps/${item.id}/approve`, { checks: ['name', 'nr', 'valid', 'id'] });
  assert.equal(get('SELECT COUNT(*) n FROM documents').n, 0);
  assert.equal(fs.readdirSync(path.join(dir, 'uploads')).length, 0, 'Dateien gelöscht');
  const mail = lastMail('amt-brandt@test.de');
  assert.ok(mail.link.includes('/aktivieren/'));
  assert.equal((await ok('s', 'GET', '/api/sweep/me')).status, 'approved');
  const token = mail.link.split('/aktivieren/')[1];
  const r = await call('x', 'GET', `/aktivieren/${token}`);
  assert.equal(r.res.headers.location, '/kaminfeger?aktiviert=1');
  assert.equal((await ok('s', 'GET', '/api/sweep/me')).status, 'active');
  assert.equal((await call('x', 'GET', `/aktivieren/${token}`)).res.headers.location, '/kaminfeger?link=ungueltig', 'Link nur einmal gültig');
  const log = await ok('admin', 'GET', '/api/admin/log');
  assert.ok(log.log[0].what.includes('freigegeben'));
});

test('Betreiber: Ablehnen mit Grund, Kaminfeger reicht neu ein, Rückfrage', async () => {
  await ok('s2', 'POST', '/api/auth/code', { email: 'em@test.de', role: 'sweep', purpose: 'register' });
  await ok('s2', 'POST', '/api/sweep/register', { first: 'Erika', last: 'Muster', bstreet: 'Hauptstr. 1', bplz: '79100', bort: 'Freiburg', email: 'em@test.de', code: codeFor('em@test.de') });
  assert.equal((await ok('s2', 'POST', '/api/sweep/district', { land: 'Baden-Württemberg', kreis: 'Freiburg im Breisgau', bez: '14' })).result, 'taken');
  await ok('s2', 'POST', '/api/sweep/district', { land: 'Baden-Württemberg', kreis: 'Freiburg im Breisgau', bez: '15' });
  await upload('s2', '/api/sweep/documents/urkunde', 'u.pdf', 'application/pdf', '%PDF');
  await upload('s2', '/api/sweep/documents/ausweis', 'a.png', 'image/png', 'png');
  await ok('s2', 'POST', '/api/sweep/submit', { assure: true });
  const id = (await ok('admin', 'GET', '/api/admin/queue')).sweeps.find(s => s.name === 'Erika Muster').id;
  await ok('admin', 'POST', `/api/admin/sweeps/${id}/query`, { to: 'behoerde' });
  assert.equal((await ok('s2', 'GET', '/api/sweep/me')).status, 'query');
  await fails(400, 'admin', 'POST', `/api/admin/sweeps/${id}/reject`, { reason: 'Einfach so' });
  await ok('admin', 'POST', `/api/admin/sweeps/${id}/reject`, { reason: 'Urkunde unleserlich – bitte neu hochladen' });
  const me = await ok('s2', 'GET', '/api/sweep/me');
  assert.equal(me.status, 'rejected');
  assert.equal(me.rejectReason, 'Urkunde unleserlich – bitte neu hochladen');
  assert.equal(me.docs.urkunde, null);
  await upload('s2', '/api/sweep/documents/urkunde', 'u2.pdf', 'application/pdf', '%PDF');
  await upload('s2', '/api/sweep/documents/ausweis', 'a2.png', 'image/png', 'png');
  await ok('s2', 'POST', '/api/sweep/submit', { assure: true });
  assert.equal((await ok('admin', 'GET', `/api/admin/sweeps/${id}`)).status, 'pending');
});

let campaignId;
test('Kaminfeger: Kehrbuch importieren und Zeitfenster senden (mit Einladung per E-Mail)', async () => {
  const csv = 'Straße;Hausnummer;PLZ;Ort;Eigentümer;Kundennummer;E-Mail;Telefon\n' +
    'Lindenstraße;1;79102;Freiburg;Berger;KF-14-0001;;0761 1\n' +
    'Lindenstraße;2;79102;Freiburg;Yilmaz;KF-14-0002;;0761 2\n' +
    'Lindenstraße;3;79102;Freiburg;Keller;KF-14-0003;keller@test.de;0761 3\n' +
    'Lindenstraße;4;79102;Freiburg;Fam. Lang;;;0761 4\n' +
    'Ahornweg;1;79102;Freiburg;Vogel;KF-14-1001;;\n' +
    ';;;;;\n';
  const r = await upload('s', '/api/sweep/kehrbuch', 'kb.csv', 'text/csv', csv);
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.deepEqual([r.json.added, r.json.errorCount], [5, 0]);
  const again = await upload('s', '/api/sweep/kehrbuch', 'kb.csv', 'text/csv', csv);
  assert.equal(again.json.updated, 5, 'Import ist wiederholbar');
  const ov = await ok('s', 'GET', '/api/sweep/overview');
  assert.deepEqual(ov.streets.map(s => [s.street, s.households, s.campaign]), [['Ahornweg', 1, null], ['Lindenstraße', 4, null]]);
  await fails(400, 's', 'POST', '/api/sweep/campaigns', { street: 'Lindenstraße', plz: '79102', slotLen: 30, deadline: iso(5), windows: [{ date: D1, start: '08:00', end: '08:10' }] });
  await fails(400, 's', 'POST', '/api/sweep/campaigns', { street: 'Lindenstraße', plz: '79102', slotLen: 30, deadline: iso(5), windows: [{ date: D1, start: '08:00', end: '10:00' }, { date: D1, start: '13:00', end: '15:00' }] });
  const c = await ok('s', 'POST', '/api/sweep/campaigns', { street: 'Lindenstraße', plz: '79102', slotLen: 30, deadline: iso(5),
    windows: [{ date: D1, start: '08:00', end: '10:00' }, { date: D2, start: '13:00', end: '14:00' }] });
  campaignId = c.id;
  assert.equal(c.households, 4);
  const inv = lastMail('keller@test.de');
  assert.ok(inv.link.includes('/kunde?einladung='), 'Einladung an E-Mail aus dem Kehrbuch');
});

test('Bewohner: Adresse finden, E-Mail-Code, Kundennummer prüfen, buchen', async () => {
  assert.equal((await ok('k1', 'POST', '/api/customer/lookup', { street: 'Lindenstrasse', nr: '1', plz: '79102', ort: 'Freiburg' })).district.sweep, 'Markus Brandt');
  assert.equal((await ok('k1', 'POST', '/api/customer/lookup', { street: 'Unter den Linden', nr: '1', plz: '10117', ort: 'Berlin' })).district, null);
  const reg = await registerCustomer('k1', 'berger@test.de', { street: 'Lindenstraße', nr: '1', plz: '79102', ort: 'Freiburg', name: 'Berger' });
  assert.equal(reg.next, 'verify');
  await fails(403, 'k1', 'POST', '/api/customer/book', { windowId: 1, time: '08:00' });
  await fails(400, 'k1', 'POST', '/api/customer/verify-number', { kdnr: 'KF-14-9999' });
  await ok('k1', 'POST', '/api/customer/verify-number', { kdnr: 'kf 14 0001' });
  const st = await ok('k1', 'GET', '/api/customer/state');
  assert.equal(st.resident.status, 'verified');
  assert.equal(st.campaign.windows.length, 2);
  assert.equal(st.messages.length, 1, 'Nachricht zu den Zeitfenstern');
  const w1 = st.campaign.windows[0];
  assert.deepEqual(w1.slots.map(s => s.t), ['08:00', '08:30', '09:00', '09:30']);
  await fails(400, 'k1', 'POST', '/api/customer/book', { windowId: w1.id, time: '08:15' });
  await ok('k1', 'POST', '/api/customer/book', { windowId: w1.id, time: '08:00', key: 'Fam. Yilmaz, Nr. 2' });
  assert.ok(lastMail('berger@test.de').subject.startsWith('Termin bestätigt'));
  const st2 = await ok('k1', 'GET', '/api/customer/state');
  assert.equal(st2.booking.t, '08:00');
  assert.equal(st2.booking.key, 'Fam. Yilmaz, Nr. 2');
  const ics = await call('k1', 'GET', '/api/customer/calendar.ics');
  assert.ok(ics.res.body.includes('BEGIN:VEVENT'));
});

test('Einladungslink: Wohnsitz sofort bestätigt · vergebene Slots gesperrt', async () => {
  const token = new URL(lastMail('keller@test.de').link).searchParams.get('einladung');
  const info = await ok('x', 'GET', `/api/customer/invite/${token}`);
  assert.equal(info.family, 'Keller');
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
  await ok('s', 'POST', '/api/sweep/kehrbuch', undefined, form('file', 'kb.csv', 'text/csv', 'strasse;hausnummer;plz;ort;eigentuemer;kundennummer\nAhornweg;2;79102;Freiburg;Seitz;KF-14-1002\n'));
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
  assert.deepEqual([reg.next, reg.status, reg.inDistrict], ['done', 'unverified', false]);
  const st = await ok('k6', 'GET', '/api/customer/state');
  assert.equal(st.campaign, null);
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
