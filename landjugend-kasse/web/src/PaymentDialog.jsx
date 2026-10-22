import { useMemo, useRef, useState } from 'react';
import { api, euro, signed, fmtDate, toInput, toCents, shrink } from './api.js';
import { useData } from './App.jsx';
import { Icon, Modal, Menu, Toggle, StatusPill, Thumb, CostDot, ErrorBox, toast, useConfirm } from './ui.jsx';
import ReceiptDialog from './ReceiptDialog.jsx';

const BOOKING = {
  spende: { label: 'Spende', icon: 'hand-heart', category: 'Spenden' },
  zuschuss: { label: 'Zuschuss', icon: 'hand-coins', category: 'Zuschüsse' },
  sonstiges: { label: 'Etwas anderes', icon: 'tag', category: '' }
};
let seq = 0;
const key = () => ++seq;

export default function PaymentDialog({ payment: p, onClose, onEdit }) {
  const { receipts, costCenters, categories, accounts, reload } = useData();
  const [ask, confirm] = useConfirm();
  const out = p.amount < 0, total = Math.abs(p.amount);
  const [items, setItems] = useState(() => p.allocations.map(a => ({ ...a, key: key(), amount: toInput(a.amount) })));
  const [q, setQ] = useState('');
  const [cc, setCc] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState(null);       // Beleg im Bearbeitungsdialog { id, prefill }
  const fileRef = useRef();

  const sum = items.reduce((a, it) => a + (toCents(it.amount) || 0), 0);
  const remaining = total - sum;
  const saved = id => p.allocations.filter(a => a.receiptId === id).reduce((a, x) => a + x.amount, 0);
  const drafted = id => items.filter(it => it.receiptId === id).reduce((a, x) => a + (toCents(x.amount) || 0), 0);
  const restOf = r => r.amount - r.allocated + saved(r.id) - drafted(r.id);

  const candidates = useMemo(() => {
    const s = q.trim().toLowerCase();
    return receipts.filter(r => r.reviewed && r.kind === (out ? 'ausgabe' : 'einnahme'))
      .filter(r => showAll || restOf(r) > 0 || items.some(it => it.receiptId === r.id))
      .filter(r => !cc || r.splits.some(x => x.costCenter === cc))
      .filter(r => !s || [r.description, r.number, r.advanceName, toInput(r.amount)].join(' ').toLowerCase().includes(s))
      // Passender Betrag zuerst, dann nach Datum
      .sort((a, b) => (restOf(b) === remaining) - (restOf(a) === remaining) || (b.date || '').localeCompare(a.date || ''));
  }, [receipts, items, q, cc, showAll]);

  const addReceipt = (r, amount) => {
    const a = amount ?? Math.min(restOf(r), remaining);
    if (a <= 0) return setError(remaining <= 0 ? 'Die Zahlung ist schon vollständig zugeordnet.' : 'Dieser Beleg ist schon vollständig bezahlt.');
    setError('');
    setItems(list => [...list, { key: key(), kind: 'beleg', receiptId: r.id, number: r.number, description: r.description, amount: toInput(a) }]);
  };
  const addBooking = kind => setItems(list => [...list, { key: key(), kind, costCenter: costCenters[0]?.name || 'Allgemein', category: BOOKING[kind].category, note: '', amount: toInput(Math.max(remaining, 0) || '') }]);
  const upd = (k, patch) => setItems(list => list.map(it => (it.key === k ? { ...it, ...patch } : it)));
  const del = k => setItems(list => list.filter(it => it.key !== k));

  const upload = async file => {
    if (!file) return;
    const fd = new FormData(); fd.append('file', await shrink(file));
    try { const { id } = await api('POST', '/api/kasse/receipts', fd); await reload(); openNew(id); }
    catch (err) { setError(err.message); }
  };
  const ownReceipt = async () => { const { id } = await api('POST', '/api/kasse/receipts', {}); await reload(); openNew(id); };
  const openNew = id => setEdit({ id, prefill: { kind: out ? 'ausgabe' : 'einnahme', amount: toInput(Math.max(remaining, 0)), date: p.date, description: p.purpose || p.name } });

  const save = async () => {
    setBusy(true); setError('');
    try {
      await api('PUT', `/api/kasse/payments/${p.id}/allocations`, { items: items.map(({ kind, receiptId, costCenter, category, note, amount }) => ({ kind, receiptId, costCenter, category, note, amount })) });
      await reload(); toast('Zuordnung gespeichert'); onClose();
    } catch (err) { setError(err.message); setBusy(false); }
  };
  const remove = async () => {
    if (!await ask(p.transferId ? 'Die Umbuchung wird auf beiden Konten gelöscht.' : 'Die Zahlung und ihre Zuordnungen werden gelöscht. Die Belege bleiben erhalten.')) return;
    try { await api('DELETE', `/api/kasse/payments/${p.id}`); await reload(); toast('Gelöscht'); onClose(); }
    catch (err) { setError(err.message); }
  };

  const head = (
    <div className="pay-head">
      <span className={`dir ${out ? 'out' : 'in'}`}><Icon n={out ? 'arrow-up-right' : 'arrow-down-left'} w="bold" /></span>
      <span className="row-main"><strong>{p.name}</strong><small>{[p.purpose, accounts.find(a => a.id === p.accountId)?.name].filter(Boolean).join(' · ')}</small></span>
      <span className="row-date">{fmtDate(p.date)}</span>
      <span className={`row-amount ${out ? '' : 'pos'}`}>{signed(p.amount)}</span>
      <Menu button={t => <button className="icon-btn" onClick={t} aria-label="Weitere Aktionen"><Icon n="dots-three-vertical" w="bold" /></button>}
        items={[{ label: 'Bearbeiten', icon: 'pencil-simple', onClick: onEdit }, { label: 'Löschen', icon: 'trash', danger: true, onClick: remove }]} />
      <button className="icon-btn" onClick={onClose} aria-label="Schließen"><Icon n="x" /></button>
    </div>
  );

  if (p.transferId) return (
    <Modal onClose={onClose} wide className="pay-modal">
      {head}
      <div className="transfer-info"><Icon n="arrows-left-right" />
        <span>Umbuchung {out ? 'nach' : 'von'} <strong>{accounts.find(a => a.id === p.transferAccountId)?.name}</strong>. Umbuchungen zwischen euren eigenen Konten brauchen keinen Beleg.</span>
      </div>
      <ErrorBox error={error} />
      {confirm}
    </Modal>
  );

  return (
    <Modal onClose={onClose} wide className="pay-modal" footer={<>
      <span className={`remaining push-left ${remaining < 0 ? 'neg' : remaining === 0 ? 'ok' : ''}`}>
        {remaining === 0 ? <><Icon n="check-circle" w="fill" />Vollständig zugeordnet</> : remaining > 0 ? <>Noch offen: <strong>{euro(remaining)}</strong></> : <>Zu viel zugeordnet: <strong>{euro(-remaining)}</strong></>}
      </span>
      <button className="btn" onClick={onClose}>Abbrechen</button>
      <button className="btn btn-primary" onClick={save} disabled={busy}>Speichern</button>
    </>}>
      {head}
      <div className="alloc-area">
        {items.map(it => it.kind === 'beleg' ? (
          <div key={it.key} className="alloc-card">
            <Thumb r={receipts.find(r => r.id === it.receiptId) || {}} size={34} />
            <div className="alloc-main">
              <button className="link strong" onClick={() => setEdit({ id: it.receiptId })}>{it.description}</button>
              <small>Beleg {it.number}</small>
            </div>
            <div className="money sm"><input inputMode="decimal" value={it.amount} onChange={e => upd(it.key, { amount: e.target.value })} aria-label="Betrag" /><span>€</span></div>
            <button className="icon-btn sm" onClick={() => del(it.key)} aria-label="Entfernen"><Icon n="x" /></button>
          </div>
        ) : (
          <div key={it.key} className="alloc-card booking">
            <span className="alloc-icon"><Icon n={BOOKING[it.kind].icon} /></span>
            <div className="alloc-fields">
              <strong>{BOOKING[it.kind].label}</strong>
              <input list="dl-cc" value={it.costCenter || ''} onChange={e => upd(it.key, { costCenter: e.target.value })} placeholder="Kostenstelle" aria-label="Kostenstelle" />
              <input list="dl-cat" value={it.category || ''} onChange={e => upd(it.key, { category: e.target.value })} placeholder="Kategorie" aria-label="Kategorie" />
              <input value={it.note || ''} onChange={e => upd(it.key, { note: e.target.value })} placeholder="Notiz (optional)" aria-label="Notiz" />
            </div>
            <div className="money sm"><input inputMode="decimal" value={it.amount} onChange={e => upd(it.key, { amount: e.target.value })} aria-label="Betrag" /><span>€</span></div>
            <button className="icon-btn sm" onClick={() => del(it.key)} aria-label="Entfernen"><Icon n="x" /></button>
          </div>
        ))}
        <Menu align="left" button={t => (
          <button className="alloc-add" onClick={t}><Icon n="plus" w="bold" /><span>{items.length ? 'Weitere Zuordnung' : 'Klicke auf das Plus, um die Zahlung zuzuordnen – oder wähle unten einen Beleg.'}</span></button>
        )} items={[
          { label: 'Beleg hochladen', icon: 'upload-simple', onClick: () => fileRef.current.click() },
          { label: 'Eigenbeleg ohne Datei', icon: 'note-pencil', onClick: ownReceipt },
          ...Object.entries(BOOKING).map(([k, b]) => ({ label: b.label, icon: b.icon, onClick: () => addBooking(k) }))
        ]} />
        <input ref={fileRef} type="file" accept="application/pdf,image/*" hidden onChange={e => { upload(e.target.files[0]); e.target.value = ''; }} />
      </div>
      <ErrorBox error={error} />

      <div className="cand-head">
        <strong>{out ? 'Ausgabebelege' : 'Einnahmebelege'}</strong>
        <div className="search sm"><Icon n="magnifying-glass" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Nach Beschreibung, Nummer oder Betrag suchen" /></div>
        <select value={cc} onChange={e => setCc(e.target.value)} aria-label="Kostenstelle"><option value="">Alle Kostenstellen</option>{costCenters.map(c => <option key={c.id}>{c.name}</option>)}</select>
        <Toggle checked={showAll} onChange={setShowAll} label="Alle anzeigen" />
      </div>
      <div className="rows compact">
        {candidates.map(r => {
          const rest = restOf(r), added = items.some(it => it.receiptId === r.id);
          return (
            <div key={r.id} className="row static">
              <Thumb r={r} size={30} />
              <span className="row-main"><strong>{r.description}</strong><small>Beleg {r.number}{r.advanceName ? ` · Ausgelegt von ${r.advanceName}` : ''}</small></span>
              <span className="row-cc">{r.splits[0] && <CostDot color={r.splits[0].color} name={r.splits[0].costCenter} />}</span>
              <span className="row-date">{fmtDate(r.date)}</span>
              <span className="row-amount">{euro(r.amount)}{rest !== r.amount && rest > 0 && <small>offen {euro(rest)}</small>}</span>
              <button className={`btn sm ${added ? 'btn-ok' : ''}`} onClick={() => addReceipt(r)} disabled={rest <= 0}>
                <Icon n={added ? 'check' : 'plus'} w="bold" />{added ? 'Zugeordnet' : 'Zuordnen'}
              </button>
            </div>
          );
        })}
        {!candidates.length && <div className="rows-end">Keine passenden {out ? 'Ausgabebelege' : 'Einnahmebelege'}. Lade über das Plus einen neuen hoch.</div>}
      </div>

      <datalist id="dl-cc">{costCenters.map(c => <option key={c.id} value={c.name} />)}</datalist>
      <datalist id="dl-cat">{categories.map(c => <option key={c.id} value={c.name} />)}</datalist>
      {edit && <ReceiptDialog id={edit.id} prefill={edit.prefill} onClose={() => setEdit(null)}
        onSaved={r => { setEdit(null); if (edit.prefill && r.kind === (out ? 'ausgabe' : 'einnahme')) addReceipt(r, Math.min(r.amount, Math.max(remaining, 0))); }} />}
      {confirm}
    </Modal>
  );
}
