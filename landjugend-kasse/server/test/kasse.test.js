// Durchlauf aller Abläufe gegen eine frische Datenbank: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ljk-'));
const { build } = await import('../index.js');
const app = await build({ logger: false });

let cookie = '';
async function api(method, url, body, headers = {}) {
  const res = await app.inject({ method, url, payload: body, headers: { cookie, ...headers } });
  const set = res.headers['set-cookie'];
  if (set) cookie = [].concat(set).map(c => c.split(';')[0]).join('; ');
  const data = res.headers['content-type']?.includes('json') ? res.json() : res.body;
  return { status: res.statusCode, data };
}
const ok = async (...a) => { const r = await api(...a); assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data; };
const fails = async (msg, ...a) => { const r = await api(...a); assert.equal(r.status, 400, JSON.stringify(r.data)); assert.match(r.data.error, msg); };

function multipart(fields, file) {
  const b = '----ljk' + Math.random().toString(16).slice(2);
  const parts = Object.entries(fields).map(([k, v]) => `--${b}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`);
  const body = Buffer.concat([
    Buffer.from(parts.join('')),
    Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
    file.data, Buffer.from(`\r\n--${b}--\r\n`)
  ]);
  return { body, headers: { 'content-type': `multipart/form-data; boundary=${b}` } };
}
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');

test('Einrichtung und Anmeldung', async () => {
  assert.equal((await ok('GET', '/api/state')).setUp, false);
  await fails(/mindestens 8/, 'POST', '/api/setup', { club: 'Landjugend Musterdorf', name: 'Anna', email: 'anna@example.org', password: 'kurz' });
  await ok('POST', '/api/setup', { club: 'Landjugend Musterdorf', name: 'Anna Kassier', email: 'anna@example.org', password: 'geheim123' });
  await fails(/bereits eingerichtet/, 'POST', '/api/setup', { club: 'X', name: 'B', email: 'b@example.org', password: 'geheim123' });
  const s = await ok('GET', '/api/state');
  assert.equal(s.club, 'Landjugend Musterdorf');
  assert.equal(s.user.isAdmin, true);
  await ok('POST', '/api/logout');
  assert.equal((await api('GET', '/api/kasse/accounts')).status, 401);
  await fails(/falsch/, 'POST', '/api/login', { email: 'anna@example.org', password: 'falsch123' });
  await ok('POST', '/api/login', { email: 'ANNA@example.org', password: 'geheim123' });
  await ok('POST', '/api/users', { name: 'Ben', email: 'ben@example.org', password: 'passwort1' });
  assert.equal((await ok('GET', '/api/users')).length, 2);
});

let bank, cash;
test('Konten und Zahlungen', async () => {
  cash = (await ok('GET', '/api/kasse/accounts'))[0];
  assert.equal(cash.kind, 'cash');
  bank = (await ok('POST', '/api/kasse/accounts', { name: 'Sparkasse', kind: 'bank', iban: 'de12 3456', opening: '1.000,00' })).id;
  await ok('POST', '/api/kasse/payments', { accountId: bank, date: '2026-10-01', name: 'Max Spender', purpose: 'Spende', amount: '120,00', direction: 'in' });
  await fails(/gültigen Betrag/, 'POST', '/api/kasse/payments', { accountId: bank, date: '2026-10-01', name: 'X', amount: 'abc', direction: 'in' });
  await ok('POST', '/api/kasse/transfers', { fromId: cash.id, toId: bank, date: '2026-10-02', amount: '50' });
  const accs = await ok('GET', '/api/kasse/accounts');
  assert.equal(accs.find(a => a.id === bank).balance, 100000 + 12000 + 5000);
  assert.equal(accs.find(a => a.id === cash.id).balance, -5000);
  const pays = await ok('GET', '/api/kasse/payments');
  assert.equal(pays.filter(p => p.status === 'transfer').length, 2);
  assert.equal(pays.find(p => p.name === 'Max Spender').status, 'open');
});

let receiptId;
test('Beleg hochladen, prüfen und zuordnen', async () => {
  const bad = multipart({}, { name: 'boese.html', data: Buffer.from('<script>alert(1)</script>') });
  assert.equal((await api('POST', '/api/kasse/receipts', bad.body, bad.headers)).status, 400);
  const mp = multipart({}, { name: 'Baumarkt.pdf', data: PDF });
  receiptId = (await ok('POST', '/api/kasse/receipts', mp.body, mp.headers)).id;
  let r = (await ok('GET', '/api/kasse/receipts')).find(x => x.id === receiptId);
  assert.equal(r.status, 'unreviewed');
  const file = await api('GET', `/api/kasse/receipts/${receiptId}/file`);
  assert.equal(file.status, 200);

  const body = { kind: 'ausgabe', description: 'Material vom Baumarkt', amount: '54,89', date: '2026-10-05', advance: true, advanceName: 'Mara',
    splits: [{ costCenter: 'Maibaum', category: 'Material', amount: '40' }, { costCenter: 'Allgemein', category: 'Werkzeug', amount: '10' }] };
  await fails(/Aufteilung/, 'PUT', `/api/kasse/receipts/${receiptId}`, body);
  body.splits[1].amount = '14,89';
  assert.equal((await import('../util.js')).cents('1.100'), 110000);
  r = (await ok('PUT', `/api/kasse/receipts/${receiptId}`, body)).receipt;
  assert.equal(r.number, '2026-1');
  assert.equal(r.status, 'open');
  assert.equal(r.splits.length, 2);
  const lists = await ok('GET', '/api/kasse/lists');
  assert.ok(lists.costCenters.some(c => c.name === 'Maibaum'));
  assert.ok(lists.categories.some(c => c.name === 'Werkzeug'));

  // Zweiter Beleg ohne Datei (Eigenbeleg) bekommt die nächste Nummer
  const own = (await ok('POST', '/api/kasse/receipts', {})).id;
  const r2 = (await ok('PUT', `/api/kasse/receipts/${own}`, { kind: 'einnahme', description: 'Kuchenverkauf', amount: '80', date: '2026-10-06', splits: [{ costCenter: 'Allgemein', category: 'Verkauf' }] })).receipt;
  assert.equal(r2.number, '2026-2');

  // Einnahmebeleg passt nicht zu einer Ausgabe
  const out = (await ok('POST', '/api/kasse/payments', { accountId: bank, date: '2026-10-07', name: 'Baumarkt', amount: '30', direction: 'out' })).id;
  await fails(/Einnahmebelege/, 'PUT', `/api/kasse/payments/${out}/allocations`, { items: [{ kind: 'beleg', receiptId: own, amount: '30' }] });
  await fails(/mehr zugeordnet/, 'PUT', `/api/kasse/payments/${out}/allocations`, { items: [{ kind: 'beleg', receiptId, amount: '40' }] });
  await ok('PUT', `/api/kasse/payments/${out}/allocations`, { items: [{ kind: 'beleg', receiptId, amount: '30' }] });
  r = (await ok('GET', '/api/kasse/receipts')).find(x => x.id === receiptId);
  assert.equal(r.status, 'partial');
  assert.equal((await ok('GET', '/api/kasse/payments')).find(p => p.id === out).status, 'done');
  await fails(/zugeordnet/, 'DELETE', `/api/kasse/receipts/${receiptId}`);

  // Spende direkt buchen
  const spende = (await ok('GET', '/api/kasse/payments')).find(p => p.name === 'Max Spender');
  await ok('PUT', `/api/kasse/payments/${spende.id}/allocations`, { items: [{ kind: 'spende', costCenter: 'Allgemein', category: 'Spenden', amount: '120' }] });
  assert.equal((await ok('GET', '/api/kasse/payments')).find(p => p.id === spende.id).status, 'done');
});

test('Auslage erstatten', async () => {
  await fails(/Barkasse|Konto/, 'POST', '/api/kasse/reimburse', { accountId: 999, date: '2026-10-08', receiptIds: [receiptId] });
  await ok('POST', '/api/kasse/reimburse', { accountId: cash.id, date: '2026-10-08', receiptIds: [receiptId] });
  const r = (await ok('GET', '/api/kasse/receipts')).find(x => x.id === receiptId);
  assert.equal(r.status, 'done');
  assert.equal(r.payments.length, 2);
  const p = (await ok('GET', '/api/kasse/payments')).find(x => x.name === 'Mara');
  assert.equal(p.amount, -2489);
  await fails(/schon erstattet/, 'POST', '/api/kasse/reimburse', { accountId: cash.id, date: '2026-10-08', receiptIds: [receiptId] });
});

test('Hochladen per Handy mit PIN', async () => {
  const links = await ok('GET', '/api/kasse/upload-links');
  assert.match(links.personal.qr, /<svg/);
  assert.equal(links.team.active, false);
  const token = links.team.url.split('/').pop();
  assert.equal((await api('GET', `/api/hochladen/${token}`)).status, 404);
  await ok('PUT', '/api/kasse/upload-links/team', { active: true });
  const info = await ok('GET', `/api/hochladen/${token}`);
  assert.equal(info.kind, 'team');
  const saved = cookie; cookie = '';
  let mp = multipart({ pin: '0000x', name: 'Tim' }, { name: 'bon.pdf', data: PDF });
  await fails(/PIN/, 'POST', `/api/hochladen/${token}`, mp.body, mp.headers);
  mp = multipart({ pin: links.team.pin, name: 'Tim', description: 'Brötchen', amount: '12,50', advance: '1' }, { name: 'bon.pdf', data: PDF });
  await ok('POST', `/api/hochladen/${token}`, mp.body, mp.headers);
  cookie = saved;
  const r = (await ok('GET', '/api/kasse/receipts')).find(x => x.uploadedName === 'Tim');
  assert.equal(r.status, 'unreviewed');
  assert.equal(r.amount, 1250);
  assert.equal(r.advanceName, 'Tim');
  // Neuer Link: alter funktioniert nicht mehr
  await ok('POST', '/api/kasse/upload-links/team/renew');
  assert.equal((await api('GET', `/api/hochladen/${token}`)).status, 404);
});

test('Umbuchung löschen entfernt beide Seiten', async () => {
  const t = (await ok('GET', '/api/kasse/payments')).find(p => p.status === 'transfer');
  await ok('DELETE', `/api/kasse/payments/${t.id}`);
  assert.equal((await ok('GET', '/api/kasse/payments')).filter(p => p.status === 'transfer').length, 0);
  await fails(/Zahlungen/, 'DELETE', `/api/kasse/accounts/${bank}`);
});
