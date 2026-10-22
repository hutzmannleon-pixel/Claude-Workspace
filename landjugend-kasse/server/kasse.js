// Gemeinsame Logik der Kasse: Kostenstellen/Kategorien nach Name, Belegnummern, Uploads, Listen mit Zuordnungsstatus
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { all, get, run, uploadDir } from './db.js';
import { bad, clean, randomToken } from './util.js';

const COLORS = ['#0ea5e9', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16'];

/** Kostenstelle nach Name finden oder neu anlegen (wie im Auswahlfeld „Eintippen, um anzulegen“). */
export function costCenterId(name) {
  name = clean(name, 60);
  if (!name) throw bad('Bitte eine Kostenstelle angeben.');
  const row = get('SELECT id FROM cost_centers WHERE name = ?', name);
  if (row) return row.id;
  const n = get('SELECT COUNT(*) n FROM cost_centers').n;
  return Number(run('INSERT INTO cost_centers (name, color) VALUES (?,?)', name, COLORS[n % COLORS.length]).lastInsertRowid);
}
export function categoryId(name) {
  name = clean(name, 60);
  if (!name) return null;
  const row = get('SELECT id FROM categories WHERE name = ?', name);
  return row ? row.id : Number(run('INSERT INTO categories (name) VALUES (?)', name).lastInsertRowid);
}

/** Fortlaufende Belegnummer je Jahr (2026-1, 2026-2, …). */
export function nextSeq(year) {
  return (get('SELECT MAX(seq) m FROM receipts WHERE year = ?', year).m || 0) + 1;
}

// Nur Dateien, die der Browser gefahrlos anzeigen kann – erkannt am Inhalt, nicht am Dateinamen
const MAGIC = [
  ['application/pdf', b => b.subarray(0, 4).toString('latin1') === '%PDF'],
  ['image/jpeg', b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ['image/png', b => b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))],
  ['image/webp', b => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP'],
  ['image/heic', b => b.subarray(4, 8).toString('latin1') === 'ftyp' && /^(heic|heix|mif1|msf1)/.test(b.subarray(8, 12).toString('latin1'))]
];

/** Speichert die hochgeladene Datei (aus req.file()) und liefert die Angaben für die Tabelle receipts. */
export async function saveUpload(part) {
  const stored = randomToken(16);
  const p = path.join(uploadDir, stored);
  await pipeline(part.file, fs.createWriteStream(p));
  if (part.file.truncated) { fs.rmSync(p, { force: true }); throw bad('Die Datei ist zu groß.'); }
  const fd = fs.openSync(p, 'r'); const head = Buffer.alloc(16);
  fs.readSync(fd, head, 0, 16, 0); fs.closeSync(fd);
  const mime = MAGIC.find(([, test]) => test(head))?.[0];
  if (!mime) { fs.rmSync(p, { force: true }); throw bad('Bitte ein PDF oder ein Foto (JPG, PNG) hochladen.'); }
  return { file: stored, file_name: clean(part.filename, 120) || 'Beleg', mime, size: fs.statSync(p).size };
}
export const filePath = stored => path.join(uploadDir, path.basename(stored));

const status = (allocated, total) => (!total ? 'open' : allocated >= total ? 'done' : allocated > 0 ? 'partial' : 'open');

export function receiptList(where = '1', ...params) {
  const rows = all(`SELECT r.*, COALESCE((SELECT SUM(amount_cents) FROM allocations WHERE receipt_id = r.id), 0) allocated
    FROM receipts r WHERE ${where} ORDER BY r.reviewed, r.date DESC, r.id DESC`, ...params);
  const splits = all(`SELECT s.receipt_id, s.amount_cents amount, c.name costCenter, c.color, k.name category
    FROM receipt_splits s JOIN cost_centers c ON c.id = s.cost_center_id LEFT JOIN categories k ON k.id = s.category_id ORDER BY s.id`);
  const links = all(`SELECT a.receipt_id, a.amount_cents amount, p.id paymentId, p.date, p.name, ac.name account
    FROM allocations a JOIN payments p ON p.id = a.payment_id JOIN accounts ac ON ac.id = p.account_id WHERE a.receipt_id IS NOT NULL`);
  return rows.map(r => ({
    id: r.id, number: r.year ? `${r.year}-${r.seq}` : null, kind: r.kind, description: r.description,
    amount: r.amount_cents, date: r.date, advanceName: r.advance_name, reviewed: !!r.reviewed,
    hasFile: !!r.file, fileName: r.file_name, mime: r.mime, uploadedName: r.uploaded_name, createdAt: r.created_at,
    allocated: r.allocated, status: r.reviewed ? status(r.allocated, r.amount_cents) : 'unreviewed',
    splits: splits.filter(s => s.receipt_id === r.id).map(({ receipt_id, ...s }) => s),
    payments: links.filter(l => l.receipt_id === r.id).map(({ receipt_id, ...l }) => l)
  }));
}

export function paymentList(where = '1', ...params) {
  const rows = all(`SELECT p.*, COALESCE((SELECT SUM(amount_cents) FROM allocations WHERE payment_id = p.id), 0) allocated,
      t.account_id transfer_account
    FROM payments p LEFT JOIN payments t ON t.id = p.transfer_id WHERE ${where} ORDER BY p.date DESC, p.id DESC`, ...params);
  const allocs = all(`SELECT a.id, a.payment_id, a.kind, a.amount_cents amount, a.note, a.receipt_id receiptId,
      r.year || '-' || r.seq number, r.description, c.name costCenter, c.color, k.name category
    FROM allocations a LEFT JOIN receipts r ON r.id = a.receipt_id
    LEFT JOIN cost_centers c ON c.id = a.cost_center_id LEFT JOIN categories k ON k.id = a.category_id ORDER BY a.id`);
  return rows.map(p => ({
    id: p.id, accountId: p.account_id, date: p.date, name: p.name, purpose: p.purpose, amount: p.amount_cents,
    transferId: p.transfer_id, transferAccountId: p.transfer_account, allocated: p.allocated,
    status: p.transfer_id ? 'transfer' : status(p.allocated, Math.abs(p.amount_cents)),
    allocations: allocs.filter(a => a.payment_id === p.id).map(({ payment_id, ...a }) => a)
  }));
}
