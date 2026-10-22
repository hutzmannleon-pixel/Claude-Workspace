import { useState } from 'react';
import { api, euro, fmtDate, toInput, toCents, today, fileUrl } from './api.js';
import { useData } from './App.jsx';
import { Icon, Modal, Field, Toggle, Segmented, ErrorBox, toast, useConfirm } from './ui.jsx';

export default function ReceiptDialog({ id, prefill, onClose, onSaved }) {
  const { receipts, costCenters, categories, users, reload } = useData();
  const r = receipts.find(x => x.id === id);
  const [ask, confirm] = useConfirm();
  const [f, setF] = useState(() => {
    const base = {
      kind: r?.kind || 'ausgabe', description: r?.description || '', amount: toInput(r?.amount), date: r?.date || '',
      advance: !!r?.advanceName, advanceName: r?.advanceName || '',
      splits: r?.splits.length ? r.splits.map(s => ({ costCenter: s.costCenter, category: s.category || '', amount: toInput(s.amount) }))
        : [{ costCenter: costCenters[0]?.name || 'Allgemein', category: '', amount: '' }]
    };
    if (!r?.reviewed && prefill) Object.assign(base, Object.fromEntries(Object.entries(prefill).filter(([k, v]) => v && !base[k])), { kind: prefill.kind });
    return base;
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (!r) return null;

  const set = k => e => setF({ ...f, [k]: e.target.value });
  const setSplit = (i, patch) => setF({ ...f, splits: f.splits.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const multi = f.splits.length > 1;
  const splitSum = f.splits.reduce((a, s) => a + (toCents(s.amount) || 0), 0);
  const total = toCents(f.amount);
  const people = [...new Set([...users.map(u => u.name), ...receipts.map(x => x.advanceName).filter(Boolean)])];

  const addSplit = () => {
    // Beim Aufteilen bekommt die erste Zeile den ganzen Betrag, die neue den Rest
    const splits = f.splits.map(s => ({ ...s, amount: !multi && !s.amount && Number.isFinite(total) ? toInput(total) : s.amount }));
    const rest = Number.isFinite(total) ? total - splits.reduce((a, s) => a + (toCents(s.amount) || 0), 0) : 0;
    setF({ ...f, splits: [...splits, { costCenter: splits[0].costCenter, category: '', amount: rest > 0 ? toInput(rest) : '' }] });
  };

  const save = async e => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const splits = multi ? f.splits : [{ ...f.splits[0], amount: f.amount }];
      const res = await api('PUT', `/api/kasse/receipts/${r.id}`, { ...f, date: f.date || today(), splits });
      await reload();
      toast(r.reviewed ? 'Beleg gespeichert' : `Beleg ${res.receipt.number} gespeichert`);
      onSaved ? onSaved(res.receipt) : onClose();
    } catch (err) { setError(err.message); setBusy(false); }
  };
  const remove = async () => {
    if (!await ask('Der Beleg und die Datei werden endgültig gelöscht.')) return;
    try { await api('DELETE', `/api/kasse/receipts/${r.id}`); await reload(); toast('Beleg gelöscht'); onClose(); }
    catch (err) { setError(err.message); }
  };

  const isImage = r.mime?.startsWith('image/') && r.mime !== 'image/heic';
  return (
    <Modal onClose={onClose} wide className="receipt-modal" footer={<>
      <span className="file-info push-left">
        {r.hasFile ? <strong><span className="ellipsis">{r.fileName}</span><a href={`${fileUrl(r)}?download=1`} title="Herunterladen" aria-label="Herunterladen"><Icon n="download-simple" /></a></strong> : <strong>Eigenbeleg</strong>}
        <small>{r.uploadedName ? `Hochgeladen von ${r.uploadedName} · ` : ''}{fmtDate(r.createdAt)}</small>
      </span>
      <button className="icon-btn danger" onClick={remove} title="Beleg löschen" aria-label="Beleg löschen"><Icon n="trash" /></button>
      <button className="btn" onClick={onClose}>Abbrechen</button>
      <button className="btn btn-primary" form="receipt-form" disabled={busy}>Speichern</button>
    </>}>
      <div className="receipt-layout">
        <div className="preview">
          {!r.hasFile ? <div className="preview-empty"><Icon n="note-pencil" /><span>Eigenbeleg ohne Datei</span><small>Für Ausgaben ohne Quittung. Beschreibe genau, wofür das Geld war.</small></div>
            : isImage ? <a href={fileUrl(r)} target="_blank" rel="noreferrer"><img src={fileUrl(r)} alt={r.fileName} /></a>
            : r.mime === 'application/pdf' ? <iframe src={fileUrl(r)} title={r.fileName} />
            : <div className="preview-empty"><Icon n="file" /><a href={`${fileUrl(r)}?download=1`}>Datei herunterladen</a></div>}
        </div>
        <form id="receipt-form" className="form" onSubmit={save}>
          <Segmented value={f.kind} onChange={kind => setF({ ...f, kind })} options={[
            { value: 'ausgabe', label: 'Ausgabebeleg', icon: 'arrow-up-right' }, { value: 'einnahme', label: 'Einnahmebeleg', icon: 'arrow-down-left' }]} />
          <Field label="Beschreibung"><input value={f.description} onChange={set('description')} placeholder="z. B. Getränke fürs Maifest" required autoFocus /></Field>
          <div className="grid2">
            <Field label="Betrag"><div className="money"><input inputMode="decimal" value={f.amount} onChange={set('amount')} placeholder="0,00" required /><span>€</span></div></Field>
            <Field label="Belegdatum"><input type="date" value={f.date} onChange={set('date')} required /></Field>
          </div>
          {f.kind === 'ausgabe' && <>
            <Toggle checked={f.advance} onChange={advance => setF({ ...f, advance })} label="Auslage" hint="– jemand hat privat bezahlt und bekommt das Geld zurück" />
            {f.advance && <input list="dl-people" value={f.advanceName} onChange={set('advanceName')} placeholder="Wer hat die Ausgabe ausgelegt?" aria-label="Ausgelegt von" required />}
          </>}

          <div className="label-row"><span className="label">Kostenstellen & Kategorien</span></div>
          {f.splits.map((s, i) => (
            <div key={i} className={`split ${multi ? 'multi' : ''}`}>
              <input list="dl-cc" value={s.costCenter} onChange={e => setSplit(i, { costCenter: e.target.value })} placeholder="Kostenstelle" aria-label="Kostenstelle" required />
              <input list="dl-cat" value={s.category} onChange={e => setSplit(i, { category: e.target.value })} placeholder="Kategorie" aria-label="Kategorie" />
              {multi && <div className="money sm"><input inputMode="decimal" value={s.amount} onChange={e => setSplit(i, { amount: e.target.value })} placeholder="0,00" aria-label="Betrag" required /><span>€</span></div>}
              {multi && <button type="button" className="icon-btn sm" onClick={() => setF({ ...f, splits: f.splits.filter((_, j) => j !== i) })} aria-label="Zeile entfernen"><Icon n="x" /></button>}
            </div>
          ))}
          <div className="split-foot">
            <button type="button" className="link" onClick={addSplit}><Icon n="plus" />Auf mehrere aufteilen</button>
            {multi && Number.isFinite(total) && splitSum !== total && <span className="warn-text">Aufgeteilt: {euro(splitSum)} von {euro(total)}</span>}
          </div>
          <small className="muted">Neue Kostenstellen oder Kategorien einfach eintippen – sie werden beim Speichern angelegt.</small>

          {r.payments.length > 0 && (
            <div className="linked">
              <span className="label">Bezahlt mit</span>
              {r.payments.map(pm => <div key={pm.paymentId} className="linked-row"><Icon n="link" />{fmtDate(pm.date)} · {pm.name} · {pm.account}<strong>{euro(pm.amount)}</strong></div>)}
            </div>
          )}
          <ErrorBox error={error} />
        </form>
      </div>
      <datalist id="dl-cc">{costCenters.map(c => <option key={c.id} value={c.name} />)}</datalist>
      <datalist id="dl-cat">{categories.map(c => <option key={c.id} value={c.name} />)}</datalist>
      <datalist id="dl-people">{people.map(n => <option key={n} value={n} />)}</datalist>
      {confirm}
    </Modal>
  );
}
