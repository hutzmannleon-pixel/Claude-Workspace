// Konten, Zahlungen, Zuordnungen, Belege, Auslagen, Kostenstellen und Kategorien
import fs from 'node:fs';
import { all, get, run, tx } from '../db.js';
import { requireUser } from '../auth.js';
import { bad, notFound, clean, cents, date } from '../util.js';
import { costCenterId, categoryId, nextSeq, saveUpload, filePath, receiptList, paymentList } from '../kasse.js';

const ALLOC_KINDS = ['beleg', 'spende', 'zuschuss', 'sonstiges'];

function positive(v, label = 'Betrag') {
  const c = cents(v);
  if (!Number.isFinite(c) || c <= 0) throw bad(`Bitte einen gültigen ${label} eingeben.`);
  if (c > 100_000_000_00) throw bad(`Der ${label} ist zu groß.`);
  return c;
}
const account = id => get('SELECT * FROM accounts WHERE id = ?', Number(id)) || (() => { throw bad('Bitte ein Konto wählen.'); })();
const payment = id => get('SELECT * FROM payments WHERE id = ?', Number(id)) || (() => { throw notFound('Zahlung nicht gefunden.'); })();
const receipt = id => get('SELECT * FROM receipts WHERE id = ?', Number(id)) || (() => { throw notFound('Beleg nicht gefunden.'); })();
const allocatedTo = (col, id) => get(`SELECT COALESCE(SUM(amount_cents), 0) s FROM allocations WHERE ${col} = ?`, id).s;

export default async function kasseRoutes(app) {
  app.addHook('onRequest', async req => { if (req.url.startsWith('/api/kasse/')) requireUser(req); });

  // ---------- Konten ----------
  app.get('/api/kasse/accounts', async () =>
    all(`SELECT a.id, a.name, a.kind, a.iban, a.opening_cents opening,
        a.opening_cents + COALESCE((SELECT SUM(amount_cents) FROM payments WHERE account_id = a.id), 0) balance,
        (SELECT COUNT(*) FROM payments WHERE account_id = a.id) payments
      FROM accounts a ORDER BY a.kind, a.id`));

  function accountBody(b) {
    const name = clean(b.name, 60);
    if (!name) throw bad('Bitte einen Namen für das Konto eingeben.');
    if (!['bank', 'cash'].includes(b.kind)) throw bad('Bitte die Kontoart wählen.');
    const opening = b.opening === '' || b.opening == null ? 0 : cents(b.opening);
    if (!Number.isFinite(opening)) throw bad('Bitte einen gültigen Anfangsbestand eingeben.');
    return [name, b.kind, b.kind === 'bank' ? clean(b.iban, 40).toUpperCase() || null : null, opening];
  }
  app.post('/api/kasse/accounts', async req => ({ id: Number(run('INSERT INTO accounts (name, kind, iban, opening_cents) VALUES (?,?,?,?)', ...accountBody(req.body || {})).lastInsertRowid) }));
  app.put('/api/kasse/accounts/:id', async req => {
    account(req.params.id);
    run('UPDATE accounts SET name = ?, kind = ?, iban = ?, opening_cents = ? WHERE id = ?', ...accountBody(req.body || {}), Number(req.params.id));
    return { ok: true };
  });
  app.delete('/api/kasse/accounts/:id', async req => {
    const id = Number(req.params.id);
    if (get('SELECT 1 FROM payments WHERE account_id = ?', id)) throw bad('Auf diesem Konto gibt es Zahlungen. Lösche zuerst die Zahlungen.');
    run('DELETE FROM accounts WHERE id = ?', id);
    return { ok: true };
  });

  // ---------- Zahlungen ----------
  app.get('/api/kasse/payments', async () => paymentList());

  function paymentBody(b) {
    const amount = positive(b.amount);
    const name = clean(b.name, 120);
    if (!name) throw bad('Bitte angeben, von wem bzw. an wen die Zahlung ging.');
    if (!['in', 'out'].includes(b.direction)) throw bad('Bitte Einnahme oder Ausgabe wählen.');
    return { accountId: account(b.accountId).id, date: date(b.date), name, purpose: clean(b.purpose, 300), amount: b.direction === 'in' ? amount : -amount };
  }
  app.post('/api/kasse/payments', async (req) => {
    const p = paymentBody(req.body || {});
    const id = Number(run('INSERT INTO payments (account_id, date, name, purpose, amount_cents, created_by) VALUES (?,?,?,?,?,?)',
      p.accountId, p.date, p.name, p.purpose, p.amount, requireUser(req).id).lastInsertRowid);
    return { id };
  });
  app.put('/api/kasse/payments/:id', async req => {
    const old = payment(req.params.id);
    const p = paymentBody(req.body || {});
    tx(() => {
      if (old.transfer_id) {
        // Umbuchung: beide Seiten gemeinsam ändern (Betrag, Datum, Text), Konto bleibt
        if (Math.sign(p.amount) !== Math.sign(old.amount_cents) || p.accountId !== old.account_id) throw bad('Bei einer Umbuchung lassen sich Konto und Richtung nicht ändern. Lösche sie und lege sie neu an.');
        run('UPDATE payments SET date = ?, name = ?, purpose = ?, amount_cents = ? WHERE id = ?', p.date, p.name, p.purpose, p.amount, old.id);
        run('UPDATE payments SET date = ?, purpose = ?, amount_cents = ? WHERE id = ?', p.date, p.purpose, -p.amount, old.transfer_id);
        return;
      }
      if (Math.sign(p.amount) !== Math.sign(old.amount_cents) && get(`SELECT 1 FROM allocations WHERE payment_id = ? AND kind = 'beleg'`, old.id))
        throw bad('Die Zahlung ist Belegen zugeordnet. Löse zuerst die Zuordnung, bevor du die Richtung änderst.');
      if (Math.abs(p.amount) < allocatedTo('payment_id', old.id)) throw bad('Der Betrag ist kleiner als das, was schon zugeordnet ist.');
      run('UPDATE payments SET account_id = ?, date = ?, name = ?, purpose = ?, amount_cents = ? WHERE id = ?', p.accountId, p.date, p.name, p.purpose, p.amount, old.id);
    });
    return { ok: true };
  });
  app.delete('/api/kasse/payments/:id', async req => {
    const p = payment(req.params.id);
    tx(() => {
      run('DELETE FROM payments WHERE id IN (?, ?)', p.id, p.transfer_id ?? -1);
    });
    return { ok: true };
  });

  // Umbuchung zwischen zwei eigenen Konten (z. B. Bargeld zur Bank bringen) – gilt automatisch als zugeordnet
  app.post('/api/kasse/transfers', async req => {
    const b = req.body || {};
    const from = account(b.fromId), to = account(b.toId);
    if (from.id === to.id) throw bad('Bitte zwei verschiedene Konten wählen.');
    const amount = positive(b.amount), d = date(b.date), purpose = clean(b.purpose, 300) || 'Umbuchung';
    const uid = requireUser(req).id;
    return tx(() => {
      const out = Number(run('INSERT INTO payments (account_id, date, name, purpose, amount_cents, created_by) VALUES (?,?,?,?,?,?)', from.id, d, to.name, purpose, -amount, uid).lastInsertRowid);
      const inn = Number(run('INSERT INTO payments (account_id, date, name, purpose, amount_cents, transfer_id, created_by) VALUES (?,?,?,?,?,?,?)', to.id, d, from.name, purpose, amount, out, uid).lastInsertRowid);
      run('UPDATE payments SET transfer_id = ? WHERE id = ?', inn, out);
      return { id: out };
    });
  });

  // Zuordnungen einer Zahlung komplett ersetzen (der Dialog speichert immer den ganzen Stand)
  app.put('/api/kasse/payments/:id/allocations', async req => {
    const p = payment(req.params.id);
    if (p.transfer_id) throw bad('Umbuchungen brauchen keine Zuordnung.');
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    tx(() => {
      run('DELETE FROM allocations WHERE payment_id = ?', p.id);
      let total = 0;
      for (const it of items) {
        if (!ALLOC_KINDS.includes(it.kind)) throw bad('Unbekannte Art der Zuordnung.');
        const amount = positive(it.amount);
        total += amount;
        if (it.kind === 'beleg') {
          const r = receipt(it.receiptId);
          if (!r.reviewed) throw bad('Der Beleg ist noch nicht geprüft.');
          if ((r.kind === 'ausgabe') !== (p.amount_cents < 0)) throw bad(r.kind === 'ausgabe' ? 'Ausgabebelege passen nur zu ausgehenden Zahlungen.' : 'Einnahmebelege passen nur zu eingehenden Zahlungen.');
          if (allocatedTo('receipt_id', r.id) + amount > r.amount_cents) throw bad(`Beleg ${r.year}-${r.seq} ist damit mehr als vollständig bezahlt.`);
          run(`INSERT INTO allocations (payment_id, receipt_id, kind, amount_cents) VALUES (?,?,'beleg',?)`, p.id, r.id, amount);
        } else {
          run('INSERT INTO allocations (payment_id, kind, cost_center_id, category_id, note, amount_cents) VALUES (?,?,?,?,?,?)',
            p.id, it.kind, costCenterId(it.costCenter), categoryId(it.category), clean(it.note, 200) || null, amount);
        }
      }
      if (total > Math.abs(p.amount_cents)) throw bad('Es ist mehr zugeordnet, als die Zahlung beträgt.');
    });
    return { ok: true };
  });

  // ---------- Belege ----------
  app.get('/api/kasse/receipts', async () => receiptList());

  // Hochladen (Datei) oder Eigenbeleg ohne Datei (JSON)
  app.post('/api/kasse/receipts', async req => {
    const me = requireUser(req);
    if (!req.isMultipart()) {
      return { id: Number(run('INSERT INTO receipts (uploaded_by) VALUES (?)', me.id).lastInsertRowid) };
    }
    const part = await req.file();
    if (!part) throw bad('Keine Datei empfangen.');
    const f = await saveUpload(part);
    return { id: Number(run('INSERT INTO receipts (file, file_name, mime, size, uploaded_by) VALUES (?,?,?,?,?)', f.file, f.file_name, f.mime, f.size, me.id).lastInsertRowid) };
  });

  // Speichern = prüfen: Angaben vollständig, Aufteilung stimmt, Belegnummer wird vergeben
  app.put('/api/kasse/receipts/:id', async req => {
    const r = receipt(req.params.id);
    const b = req.body || {};
    if (!['ausgabe', 'einnahme'].includes(b.kind)) throw bad('Bitte Ausgabe- oder Einnahmebeleg wählen.');
    const description = clean(b.description, 200);
    if (!description) throw bad('Bitte eine Beschreibung eingeben.');
    const amount = positive(b.amount), d = date(b.date, 'Belegdatum');
    const advance = b.kind === 'ausgabe' && b.advance ? clean(b.advanceName, 80) : null;
    if (b.kind === 'ausgabe' && b.advance && !advance) throw bad('Bitte angeben, wer die Ausgabe ausgelegt hat.');
    const splits = Array.isArray(b.splits) && b.splits.length ? b.splits : [];
    if (!splits.length) throw bad('Bitte mindestens eine Kostenstelle angeben.');
    const parsed = splits.map(s => ({ ...s, amount: splits.length === 1 && (s.amount === '' || s.amount == null) ? amount : positive(s.amount, 'Betrag der Aufteilung') }));
    const sum = parsed.reduce((a, s) => a + s.amount, 0);
    if (sum !== amount) throw bad(`Die Aufteilung (${(sum / 100).toFixed(2).replace('.', ',')} €) passt nicht zum Betrag des Belegs.`);
    tx(() => {
      const used = all('SELECT a.amount_cents, p.amount_cents pay FROM allocations a JOIN payments p ON p.id = a.payment_id WHERE a.receipt_id = ?', r.id);
      if (used.length) {
        if (used.some(u => (u.pay < 0) !== (b.kind === 'ausgabe'))) throw bad('Der Beleg ist schon einer Zahlung zugeordnet – die Art lässt sich nicht mehr ändern.');
        if (amount < used.reduce((a, u) => a + u.amount_cents, 0)) throw bad('Der Betrag ist kleiner als das, was schon bezahlt bzw. zugeordnet ist.');
      }
      const year = Number(d.slice(0, 4));
      const seq = r.year === year ? r.seq : nextSeq(year);
      run('UPDATE receipts SET kind = ?, description = ?, amount_cents = ?, date = ?, advance_name = ?, reviewed = 1, year = ?, seq = ? WHERE id = ?',
        b.kind, description, amount, d, advance, year, seq, r.id);
      run('DELETE FROM receipt_splits WHERE receipt_id = ?', r.id);
      for (const s of parsed)
        run('INSERT INTO receipt_splits (receipt_id, cost_center_id, category_id, amount_cents) VALUES (?,?,?,?)', r.id, costCenterId(s.costCenter), categoryId(s.category), s.amount);
    });
    return { ok: true, receipt: receiptList('r.id = ?', r.id)[0] };
  });

  app.delete('/api/kasse/receipts/:id', async req => {
    const r = receipt(req.params.id);
    if (get('SELECT 1 FROM allocations WHERE receipt_id = ?', r.id)) throw bad('Der Beleg ist einer Zahlung zugeordnet. Löse zuerst die Zuordnung.');
    run('DELETE FROM receipts WHERE id = ?', r.id);
    if (r.file) fs.rmSync(filePath(r.file), { force: true });
    return { ok: true };
  });

  app.get('/api/kasse/receipts/:id/file', async (req, reply) => {
    const r = receipt(req.params.id);
    if (!r.file || !fs.existsSync(filePath(r.file))) throw notFound('Zu diesem Beleg gibt es keine Datei.');
    const download = req.query.download === '1';
    return reply.type(r.mime).header('Cache-Control', 'private, max-age=86400')
      .header('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(r.file_name || 'beleg')}`)
      .send(fs.createReadStream(filePath(r.file)));
  });

  // Offene Auslagen einer Person mit einer Zahlung erstatten (bar oder per Überweisung)
  app.post('/api/kasse/reimburse', async req => {
    const b = req.body || {};
    const acc = account(b.accountId), d = date(b.date);
    const ids = [...new Set((b.receiptIds || []).map(Number))];
    if (!ids.length) throw bad('Bitte mindestens einen Beleg auswählen.');
    return tx(() => {
      const rs = ids.map(receipt);
      const person = rs[0].advance_name;
      if (rs.some(r => r.kind !== 'ausgabe' || !r.reviewed || !r.advance_name || r.advance_name !== person)) throw bad('Bitte nur geprüfte Auslagen derselben Person auswählen.');
      const open = rs.map(r => ({ r, rest: r.amount_cents - allocatedTo('receipt_id', r.id) })).filter(x => x.rest > 0);
      if (!open.length) throw bad('Diese Auslagen sind schon erstattet.');
      const total = open.reduce((a, x) => a + x.rest, 0);
      const pid = Number(run('INSERT INTO payments (account_id, date, name, purpose, amount_cents, created_by) VALUES (?,?,?,?,?,?)',
        acc.id, d, person, 'Auslagenerstattung ' + open.map(x => `Beleg ${x.r.year}-${x.r.seq}`).join(', '), -total, requireUser(req).id).lastInsertRowid);
      for (const x of open) run(`INSERT INTO allocations (payment_id, receipt_id, kind, amount_cents) VALUES (?,?,'beleg',?)`, pid, x.r.id, x.rest);
      return { id: pid };
    });
  });

  // ---------- Kostenstellen & Kategorien ----------
  app.get('/api/kasse/lists', async () => ({
    costCenters: all(`SELECT c.id, c.name, c.color,
      (SELECT COUNT(*) FROM receipt_splits WHERE cost_center_id = c.id) + (SELECT COUNT(*) FROM allocations WHERE cost_center_id = c.id) used
      FROM cost_centers c ORDER BY c.name = 'Allgemein' DESC, c.name`),
    categories: all(`SELECT k.id, k.name,
      (SELECT COUNT(*) FROM receipt_splits WHERE category_id = k.id) + (SELECT COUNT(*) FROM allocations WHERE category_id = k.id) used
      FROM categories k ORDER BY k.name`)
  }));

  for (const [path, table, ref] of [['cost-centers', 'cost_centers', 'cost_center_id'], ['categories', 'categories', 'category_id']]) {
    app.post(`/api/kasse/${path}`, async req => ({ id: table === 'cost_centers' ? costCenterId(req.body?.name) : categoryId(req.body?.name) }));
    app.put(`/api/kasse/${path}/:id`, async req => {
      const name = clean(req.body?.name, 60);
      if (!name) throw bad('Bitte einen Namen eingeben.');
      const dup = get(`SELECT id FROM ${table} WHERE name = ? AND id <> ?`, name, Number(req.params.id));
      if (dup) throw bad('Diesen Namen gibt es schon.');
      run(`UPDATE ${table} SET name = ? WHERE id = ?`, name, Number(req.params.id));
      if (table === 'cost_centers' && /^#[0-9a-f]{6}$/i.test(req.body?.color || '')) run('UPDATE cost_centers SET color = ? WHERE id = ?', req.body.color, Number(req.params.id));
      return { ok: true };
    });
    app.delete(`/api/kasse/${path}/:id`, async req => {
      const id = Number(req.params.id);
      if (get(`SELECT 1 FROM receipt_splits WHERE ${ref} = ? UNION SELECT 1 FROM allocations WHERE ${ref} = ?`, id, id)) throw bad('Wird noch verwendet und kann nicht gelöscht werden.');
      run(`DELETE FROM ${table} WHERE id = ?`, id);
      return { ok: true };
    });
  }
}
