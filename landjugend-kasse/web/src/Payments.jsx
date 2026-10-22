import { useMemo, useState } from 'react';
import { api, euro, signed, fmtDate, today, toInput } from './api.js';
import { useData } from './App.jsx';
import { Icon, Modal, Field, Toggle, Segmented, StatusPill, Empty, ErrorBox, toast, useConfirm } from './ui.jsx';
import PaymentDialog from './PaymentDialog.jsx';

const RANGES = [
  { value: 'all', label: 'Gesamte Zeit' },
  { value: 'month', label: 'Dieser Monat' },
  { value: 'year', label: 'Dieses Jahr' },
  { value: 'lastyear', label: 'Letztes Jahr' }
];
function inRange(d, range) {
  const now = new Date(), y = now.getFullYear();
  if (range === 'month') return d.startsWith(`${y}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  if (range === 'year') return d.startsWith(String(y));
  if (range === 'lastyear') return d.startsWith(String(y - 1));
  return true;
}

export default function Payments() {
  const { accounts, payments } = useData();
  const [accountId, setAccountId] = useState(null);
  const [q, setQ] = useState('');
  const [range, setRange] = useState('all');
  const [hideDone, setHideDone] = useState(false);
  const [open, setOpen] = useState(null);       // Zahlung im Zuordnungsdialog
  const [form, setForm] = useState(null);        // { payment? } neue/zu bearbeitende Zahlung
  const [transfer, setTransfer] = useState(false);
  const [accForm, setAccForm] = useState(null);

  const accName = id => accounts.find(a => a.id === id)?.name;
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return payments.filter(p =>
      (!accountId || p.accountId === accountId) && inRange(p.date, range) &&
      (!hideDone || !['done', 'transfer'].includes(p.status)) &&
      (!s || [p.name, p.purpose, toInput(Math.abs(p.amount)), ...p.allocations.map(a => a.number || a.costCenter)].join(' ').toLowerCase().includes(s)));
  }, [payments, accountId, q, range, hideDone]);
  const openCount = payments.filter(p => p.status === 'open' || p.status === 'partial').length;
  const current = open && payments.find(p => p.id === open);

  return (
    <div className="page">
      <header className="page-head">
        <h1>Zahlungen</h1>
        <div className="actions">
          <button className="btn" onClick={() => setTransfer(true)} disabled={accounts.length < 2} title={accounts.length < 2 ? 'Dafür braucht es mindestens zwei Konten' : ''}>
            <Icon n="arrows-left-right" /><span className="hide-sm">Umbuchung</span>
          </button>
          <button className="btn btn-primary" onClick={() => setForm({})}><Icon n="plus" w="bold" />Zahlung erfassen</button>
        </div>
      </header>

      <div className="accounts">
        {accounts.map(a => (
          <div key={a.id} role="button" tabIndex={0} className={`account ${accountId === a.id ? 'on' : ''}`}
            onClick={() => setAccountId(accountId === a.id ? null : a.id)} onKeyDown={e => e.key === 'Enter' && setAccountId(accountId === a.id ? null : a.id)}>
            <div className="account-top">
              <span className={`account-icon ${a.kind}`}><Icon n={a.kind === 'bank' ? 'bank' : 'coins'} w="fill" /></span>
              <span className="account-name">{a.name}</span>
              <button className="icon-btn sm" onClick={e => { e.stopPropagation(); setAccForm(a); }} aria-label="Konto bearbeiten"><Icon n="gear-six" /></button>
            </div>
            <div className={`account-balance ${a.balance < 0 ? 'neg' : ''}`}>{euro(a.balance)}</div>
            <div className="account-sub">{a.kind === 'bank' ? a.iban || 'Bankkonto' : 'Barkasse'}</div>
          </div>
        ))}
        <button className="account add" onClick={() => setAccForm({})} aria-label="Konto hinzufügen"><Icon n="plus" /></button>
      </div>

      <div className="toolbar">
        <div className="search"><Icon n="magnifying-glass" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Nach Name, Verwendungszweck oder Betrag suchen" /></div>
        <select value={range} onChange={e => setRange(e.target.value)} aria-label="Zeitraum">{RANGES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}</select>
        <Toggle checked={hideDone} onChange={setHideDone} label="Zugeordnete ausblenden" />
      </div>

      {openCount > 0 && !hideDone && (
        <div className="banner info"><Icon n="info" w="fill" /><span>{openCount === 1 ? 'Eine Zahlung ist' : `${openCount} Zahlungen sind`} noch nicht vollständig zugeordnet.</span>
          <button className="link" onClick={() => setHideDone(true)}>Nur offene zeigen <Icon n="arrow-right" /></button></div>
      )}

      {list.length ? (
        <div className="rows">
          {list.map(p => (
            <button key={p.id} className="row" onClick={() => setOpen(p.id)}>
              <span className={`dir ${p.amount > 0 ? 'in' : 'out'}`}><Icon n={p.amount > 0 ? 'arrow-down-left' : 'arrow-up-right'} w="bold" /></span>
              <span className="row-main"><strong>{p.name}</strong><small>{[p.purpose, !accountId && accName(p.accountId)].filter(Boolean).join(' · ')}</small></span>
              <span className="row-date">{fmtDate(p.date)}</span>
              <span className={`row-amount ${p.amount > 0 ? 'pos' : ''}`}>{signed(p.amount)}</span>
              <span className="row-status"><StatusPill status={p.status} /></span>
            </button>
          ))}
          <div className="rows-end">Das ist alles!</div>
        </div>
      ) : payments.length ? (
        <Empty icon="funnel" title="Keine passenden Zahlungen">Ändere die Suche oder die Filter.</Empty>
      ) : (
        <Empty icon="arrows-down-up" title="Noch keine Zahlungen">Erfasse Ein- und Ausgänge von Bankkonto und Barkasse. Danach ordnest du sie Belegen oder Kostenstellen zu.</Empty>
      )}

      {current && <PaymentDialog payment={current} onClose={() => setOpen(null)} onEdit={() => setForm({ payment: current })} />}
      {form && <PaymentForm payment={form.payment} defaultAccount={accountId} onClose={() => setForm(null)} onSaved={id => { setForm(null); if (!form.payment) setOpen(id); }} />}
      {transfer && <TransferForm onClose={() => setTransfer(false)} />}
      {accForm && <AccountForm account={accForm.id ? accForm : null} onClose={() => setAccForm(null)} />}
    </div>
  );
}

export function PaymentForm({ payment, defaultAccount, onClose, onSaved }) {
  const { accounts, reload } = useData();
  const [f, setF] = useState(() => payment
    ? { accountId: payment.accountId, direction: payment.amount > 0 ? 'in' : 'out', amount: toInput(Math.abs(payment.amount)), date: payment.date, name: payment.name, purpose: payment.purpose }
    : { accountId: defaultAccount || accounts.find(a => a.kind === 'cash')?.id || accounts[0]?.id, direction: 'out', amount: '', date: today(), name: '', purpose: '' });
  const [error, setError] = useState('');
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const isTransfer = !!payment?.transferId;
  const save = async e => {
    e.preventDefault();
    try {
      const r = payment ? await api('PUT', `/api/kasse/payments/${payment.id}`, f) : await api('POST', '/api/kasse/payments', f);
      await reload();
      toast(payment ? 'Zahlung gespeichert' : 'Zahlung erfasst');
      onSaved?.(r.id || payment.id);
    } catch (err) { setError(err.message); }
  };
  return (
    <Modal title={payment ? (isTransfer ? 'Umbuchung bearbeiten' : 'Zahlung bearbeiten') : 'Zahlung erfassen'} onClose={onClose}
      footer={<><button className="btn" type="button" onClick={onClose}>Abbrechen</button><button className="btn btn-primary" form="payment-form">Speichern</button></>}>
      <form id="payment-form" className="form" onSubmit={save}>
        {!isTransfer && <Segmented value={f.direction} onChange={direction => setF({ ...f, direction })} options={[
          { value: 'out', label: 'Ausgabe', icon: 'arrow-up-right' }, { value: 'in', label: 'Einnahme', icon: 'arrow-down-left' }]} />}
        <div className="grid2">
          <Field label="Betrag"><div className="money"><input inputMode="decimal" value={f.amount} onChange={set('amount')} placeholder="0,00" required autoFocus /><span>€</span></div></Field>
          <Field label="Datum"><input type="date" value={f.date} onChange={set('date')} required /></Field>
        </div>
        {!isTransfer && <Field label="Konto">
          <select value={f.accountId} onChange={e => setF({ ...f, accountId: Number(e.target.value) })}>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        </Field>}
        <Field label={f.direction === 'in' ? 'Von wem?' : 'An wen?'}><input value={f.name} onChange={set('name')} placeholder={f.direction === 'in' ? 'z. B. Max Mustermann' : 'z. B. Getränkemarkt'} required /></Field>
        <Field label="Verwendungszweck"><input value={f.purpose} onChange={set('purpose')} placeholder="optional" /></Field>
        <ErrorBox error={error} />
      </form>
    </Modal>
  );
}

function TransferForm({ onClose }) {
  const { accounts, reload } = useData();
  const cash = accounts.find(a => a.kind === 'cash'), bank = accounts.find(a => a.kind === 'bank');
  const [f, setF] = useState({ fromId: (cash || accounts[0]).id, toId: (bank && bank !== cash ? bank : accounts[1]).id, amount: '', date: today(), purpose: '' });
  const [error, setError] = useState('');
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const save = async e => {
    e.preventDefault();
    try { await api('POST', '/api/kasse/transfers', f); await reload(); toast('Umbuchung erfasst'); onClose(); }
    catch (err) { setError(err.message); }
  };
  const sel = k => <select value={f[k]} onChange={e => setF({ ...f, [k]: Number(e.target.value) })}>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>;
  return (
    <Modal title="Umbuchung" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Abbrechen</button><button className="btn btn-primary" form="transfer-form">Speichern</button></>}>
      <form id="transfer-form" className="form" onSubmit={save}>
        <p className="muted">Geld zwischen euren eigenen Konten verschieben, z. B. Bargeld zur Bank bringen oder am Automaten abheben. Umbuchungen brauchen keinen Beleg.</p>
        <div className="grid2"><Field label="Von">{sel('fromId')}</Field><Field label="Nach">{sel('toId')}</Field></div>
        <div className="grid2">
          <Field label="Betrag"><div className="money"><input inputMode="decimal" value={f.amount} onChange={set('amount')} placeholder="0,00" required autoFocus /><span>€</span></div></Field>
          <Field label="Datum"><input type="date" value={f.date} onChange={set('date')} required /></Field>
        </div>
        <Field label="Notiz"><input value={f.purpose} onChange={set('purpose')} placeholder="z. B. Bareinzahlung nach dem Maifest" /></Field>
        <ErrorBox error={error} />
      </form>
    </Modal>
  );
}

export function AccountForm({ account, onClose }) {
  const { reload } = useData();
  const [ask, confirm] = useConfirm();
  const [f, setF] = useState(account ? { ...account, opening: toInput(account.opening) } : { name: '', kind: 'bank', iban: '', opening: '' });
  const [error, setError] = useState('');
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const save = async e => {
    e.preventDefault();
    try {
      await (account ? api('PUT', `/api/kasse/accounts/${account.id}`, f) : api('POST', '/api/kasse/accounts', f));
      await reload(); toast('Konto gespeichert'); onClose();
    } catch (err) { setError(err.message); }
  };
  const remove = async () => {
    if (!await ask(`Konto „${account.name}“ löschen?`)) return;
    try { await api('DELETE', `/api/kasse/accounts/${account.id}`); await reload(); toast('Konto gelöscht'); onClose(); }
    catch (err) { setError(err.message); }
  };
  return (
    <Modal title={account ? 'Konto bearbeiten' : 'Konto hinzufügen'} onClose={onClose} footer={<>
      {account && <button className="btn btn-ghost danger push-left" type="button" onClick={remove}><Icon n="trash" />Löschen</button>}
      <button className="btn" type="button" onClick={onClose}>Abbrechen</button><button className="btn btn-primary" form="account-form">Speichern</button>
    </>}>
      <form id="account-form" className="form" onSubmit={save}>
        <Segmented value={f.kind} onChange={kind => setF({ ...f, kind })} options={[{ value: 'bank', label: 'Bankkonto', icon: 'bank' }, { value: 'cash', label: 'Barkasse', icon: 'coins' }]} />
        <Field label="Name"><input value={f.name} onChange={set('name')} placeholder={f.kind === 'bank' ? 'z. B. Sparkasse Girokonto' : 'z. B. Barkasse Maifest'} required autoFocus /></Field>
        {f.kind === 'bank' && <Field label="IBAN"><input value={f.iban || ''} onChange={set('iban')} placeholder="optional" /></Field>}
        <Field label="Anfangsbestand" hint="Kontostand, bevor ihr mit dieser Kasse angefangen habt">
          <div className="money"><input inputMode="decimal" value={f.opening} onChange={set('opening')} placeholder="0,00" /><span>€</span></div>
        </Field>
        <ErrorBox error={error} />
      </form>
      {confirm}
    </Modal>
  );
}
