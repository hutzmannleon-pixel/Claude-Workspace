import { useEffect, useMemo, useRef, useState } from 'react';
import { api, euro, fmtDate, today, toInput, shrink } from './api.js';
import { useData } from './App.jsx';
import { Icon, Modal, Field, Toggle, Segmented, Thumb, CostDot, StatusDot, Empty, ErrorBox, toast } from './ui.jsx';
import ReceiptDialog from './ReceiptDialog.jsx';

const TYPES = [
  { value: '', label: 'Alle Belege' },
  { value: 'ausgabe', label: 'Ausgabebelege' },
  { value: 'einnahme', label: 'Einnahmebelege' },
  { value: 'advance', label: 'Auslagen' }
];

/** Offene Auslagen je Person (geprüft, Ausgabe, noch nicht vollständig bezahlt) */
export function openAdvances(receipts) {
  const by = new Map();
  for (const r of receipts) {
    if (!r.reviewed || r.kind !== 'ausgabe' || !r.advanceName || r.allocated >= r.amount) continue;
    if (!by.has(r.advanceName)) by.set(r.advanceName, []);
    by.get(r.advanceName).push(r);
  }
  return [...by].map(([name, list]) => ({ name, list, total: list.reduce((a, r) => a + r.amount - r.allocated, 0) }));
}

export default function Receipts() {
  const { receipts, costCenters, reload } = useData();
  const [q, setQ] = useState('');
  const [cc, setCc] = useState('');
  const [type, setType] = useState('');
  const [hideDone, setHideDone] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(true);
  const [edit, setEdit] = useState(null);
  const [scan, setScan] = useState(false);
  const [reimburse, setReimburse] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef();

  const inbox = receipts.filter(r => !r.reviewed);
  const advances = openAdvances(receipts);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return receipts.filter(r => r.reviewed)
      .filter(r => !type || (type === 'advance' ? !!r.advanceName : r.kind === type))
      .filter(r => !cc || r.splits.some(x => x.costCenter === cc))
      .filter(r => !hideDone || r.status !== 'done')
      .filter(r => !s || [r.description, r.number, r.advanceName, toInput(r.amount), ...r.splits.map(x => `${x.costCenter} ${x.category || ''}`)].join(' ').toLowerCase().includes(s));
  }, [receipts, q, cc, type, hideDone]);

  const upload = async files => {
    files = [...files];
    if (!files.length) return;
    setUploading(n => n + files.length);
    let ok = 0;
    for (const file of files) {
      const fd = new FormData(); fd.append('file', await shrink(file));
      try { await api('POST', '/api/kasse/receipts', fd); ok++; }
      catch (err) { toast(`${file.name}: ${err.message}`, 'err'); }
      setUploading(n => n - 1);
    }
    await reload();
    if (ok) { toast(ok === 1 ? 'Beleg hochgeladen – bitte prüfen' : `${ok} Belege hochgeladen – bitte prüfen`); setInboxOpen(true); }
  };
  const ownReceipt = async () => { const { id } = await api('POST', '/api/kasse/receipts', {}); await reload(); setEdit(id); };

  // Dateien irgendwo auf die Seite ziehen
  useEffect(() => {
    let depth = 0;
    const enter = e => { if (e.dataTransfer?.types.includes('Files')) { depth++; setDrag(true); } };
    const leave = () => { depth = Math.max(0, depth - 1); if (!depth) setDrag(false); };
    const over = e => e.preventDefault();
    const drop = e => { e.preventDefault(); depth = 0; setDrag(false); if (!document.querySelector('.modal')) upload(e.dataTransfer.files); };
    window.addEventListener('dragenter', enter); window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over); window.addEventListener('drop', drop);
    return () => { window.removeEventListener('dragenter', enter); window.removeEventListener('dragleave', leave); window.removeEventListener('dragover', over); window.removeEventListener('drop', drop); };
  });

  return (
    <div className="page">
      <header className="page-head">
        <h1>Belege</h1>
        <div className="actions">
          <button className="btn" onClick={ownReceipt} title="Beleg ohne Datei, z. B. wenn es keine Quittung gibt"><Icon n="note-pencil" /><span className="hide-sm">Eigenbeleg</span></button>
          <button className="btn" onClick={() => setScan(true)}><Icon n="qr-code" /><span className="hide-sm">Mit dem Handy</span></button>
          <button className="btn btn-primary" onClick={() => fileRef.current.click()}><Icon n="upload-simple" w="bold" />Hochladen</button>
          <input ref={fileRef} type="file" accept="application/pdf,image/*" multiple hidden onChange={e => { upload(e.target.files); e.target.value = ''; }} />
        </div>
      </header>

      <section className="inbox">
        <button className="inbox-head" onClick={() => setInboxOpen(o => !o)} aria-expanded={inboxOpen}>
          <Icon n={inboxOpen ? 'caret-down' : 'caret-right'} w="bold" />Ungeprüfte Belege
          {inbox.length > 0 && <span className="badge">{inbox.length}</span>}
          {uploading > 0 && <span className="muted sm"><span className="spinner sm" /> {uploading} wird hochgeladen …</span>}
        </button>
        {inboxOpen && (inbox.length ? (
          <div className="rows compact">
            {inbox.map(r => (
              <button key={r.id} className="row" onClick={() => setEdit(r.id)}>
                <Thumb r={r} size={30} />
                <span className="row-main"><strong>{r.description || r.fileName || 'Eigenbeleg'}</strong>
                  <small>{r.uploadedName ? `Von ${r.uploadedName}` : 'Hochgeladen'} am {fmtDate(r.createdAt)}{r.advanceName ? ' · Auslage' : ''}</small></span>
                <span className="row-amount">{r.amount ? euro(r.amount) : <span className="muted">Kein Betrag</span>}</span>
                <span className="btn sm">Prüfen <Icon n="arrow-right" /></span>
              </button>
            ))}
          </div>
        ) : (
          <div className="dropzone" onClick={() => fileRef.current.click()}>
            <Icon n="tray" />
            <strong>Keine ungeprüften Belege</strong>
            <span className="muted">Belege erscheinen hier, nachdem du oder dein Team sie hochgeladen haben. Vervollständige die Angaben, dann wandern sie in die Belegliste.</span>
            <span className="btn sm">Belege hierher ziehen oder klicken</span>
          </div>
        ))}
      </section>

      <div className="toolbar">
        <div className="search"><Icon n="magnifying-glass" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Beschreibung, Name, Betrag oder Nr. suchen" /></div>
        <select value={cc} onChange={e => setCc(e.target.value)} aria-label="Kostenstelle"><option value="">Alle Kostenstellen</option>{costCenters.map(c => <option key={c.id}>{c.name}</option>)}</select>
        <select value={type} onChange={e => setType(e.target.value)} aria-label="Belegart">{TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
        <Toggle checked={hideDone} onChange={setHideDone} label="Zugeordnete ausblenden" />
      </div>

      {advances.length > 0 && (
        <div className="banner warn">
          <Icon n="warning" w="fill" />
          <span>Ihr müsst noch {advances.reduce((a, p) => a + p.list.length, 0) === 1 ? 'eine Auslage' : `${advances.reduce((a, p) => a + p.list.length, 0)} Auslagen`} in Höhe von <strong>{euro(advances.reduce((a, p) => a + p.total, 0))}</strong> an {advances.length === 1 ? advances[0].name : `${advances.length} Personen`} erstatten.</span>
          <button className="link" onClick={() => setReimburse(true)}>Auslagen erstatten <Icon n="arrow-right" /></button>
        </div>
      )}

      {list.length ? (
        <div className="rows">
          {list.map(r => (
            <button key={r.id} className="row" onClick={() => setEdit(r.id)}>
              <Thumb r={r} />
              <span className="row-main"><strong>{r.description}</strong><small>Beleg Nr. {r.number}{r.advanceName ? ` · Ausgelegt von ${r.advanceName}` : ''}</small></span>
              <span className="row-cc">{r.splits[0] && <CostDot color={r.splits[0].color} name={r.splits[0].costCenter} />}{r.splits.length > 1 && <small className="muted"> +{r.splits.length - 1}</small>}</span>
              <span className="row-date">{fmtDate(r.date)}</span>
              <span className={`row-amount ${r.kind === 'einnahme' ? 'pos' : ''}`}>{euro(r.kind === 'ausgabe' ? -r.amount : r.amount)}</span>
              <StatusDot status={r.status} />
            </button>
          ))}
          <div className="rows-end">Das ist alles!</div>
        </div>
      ) : receipts.some(r => r.reviewed) ? (
        <Empty icon="funnel" title="Keine passenden Belege">Ändere die Suche oder die Filter.</Empty>
      ) : (
        <Empty icon="receipt" title="Noch keine geprüften Belege">Lade Quittungen und Rechnungen hoch – als PDF oder Foto. Mit dem Handy geht das auch direkt über den QR-Code.</Empty>
      )}

      {drag && <div className="drop-overlay"><Icon n="upload-simple" /><strong>Loslassen zum Hochladen</strong></div>}
      {edit && <ReceiptDialog id={edit} onClose={() => setEdit(null)} />}
      {scan && <ScanDialog onClose={() => { setScan(false); reload(); }} />}
      {reimburse && <ReimburseDialog onClose={() => setReimburse(false)} />}
    </div>
  );
}

function ScanDialog({ onClose }) {
  const [tab, setTab] = useState('personal');
  const [links, setLinks] = useState(null);
  const [error, setError] = useState('');
  const load = () => api('GET', '/api/kasse/upload-links').then(setLinks).catch(e => setError(e.message));
  useEffect(() => { load(); }, []);
  const l = links?.[tab];
  const act = async (fn, msg) => { try { await fn(); await load(); toast(msg); } catch (e) { setError(e.message); } };
  const copy = async () => { try { await navigator.clipboard.writeText(`${l.url}\nPIN: ${l.pin}`); toast('Link und PIN kopiert'); } catch { setError('Kopieren nicht möglich – bitte den Link markieren.'); } };

  return (
    <Modal title="Belege mit dem Handy hochladen" className="scan-modal" onClose={onClose} footer={<button className="btn btn-primary" onClick={onClose}>Fertig</button>}>
      <Segmented value={tab} onChange={setTab} options={[{ value: 'personal', label: 'Für mich', icon: 'user' }, { value: 'team', label: 'Für mein Team', icon: 'users-three' }]} />
      {!l ? <div className="center-pad"><div className="spinner" /></div> : (
        <div className="scan">
          <div className="scan-text">
            {tab === 'personal'
              ? <p>Scanne den Code mit der Handy-Kamera und fotografiere deine Belege direkt ab. Sie landen bei den <strong>ungeprüften Belegen</strong>.</p>
              : <>
                  <p>Gib den Link mit PIN an Leute weiter, die etwas für den Verein bezahlt haben. Sie laden den Beleg mit Name, Betrag und Beschreibung hoch – die Kasse prüft ihn danach.</p>
                  <Toggle checked={l.active} onChange={active => act(() => api('PUT', '/api/kasse/upload-links/team', { active }), active ? 'Team-Link eingeschaltet' : 'Team-Link ausgeschaltet')} label="Team-Link aktiv" />
                </>}
            <div className="pin">PIN <strong>{l.pin}</strong>
              <button className="icon-btn sm" onClick={() => act(() => api('POST', `/api/kasse/upload-links/${tab}/pin`), 'Neue PIN erzeugt')} title="Neue PIN" aria-label="Neue PIN"><Icon n="arrows-clockwise" /></button>
            </div>
            {tab === 'team' && <div className="copy-row"><input readOnly value={l.url} onFocus={e => e.target.select()} aria-label="Link" /><button className="btn sm" onClick={copy}><Icon n="copy" />Kopieren</button></div>}
            <button className="link sm" onClick={() => act(() => api('POST', `/api/kasse/upload-links/${tab}/renew`), 'Neuer Link erzeugt – der alte gilt nicht mehr')}>Neuen Link erzeugen (alter wird ungültig)</button>
          </div>
          <div className={`qr ${tab === 'team' && !l.active ? 'off' : ''}`} dangerouslySetInnerHTML={{ __html: l.qr }} />
        </div>
      )}
      <ErrorBox error={error} />
    </Modal>
  );
}

function ReimburseDialog({ onClose }) {
  const { receipts, accounts, reload } = useData();
  const groups = openAdvances(receipts);
  const [person, setPerson] = useState(groups[0]?.name);
  const g = groups.find(x => x.name === person) || groups[0];
  const [sel, setSel] = useState(() => new Set(g?.list.map(r => r.id)));
  const [accountId, setAccountId] = useState(accounts.find(a => a.kind === 'cash')?.id || accounts[0]?.id);
  const [date, setDate] = useState(today());
  const [error, setError] = useState('');
  useEffect(() => { if (!g) onClose(); }, [g, onClose]);
  if (!g) return null;
  const pick = name => { setPerson(name); setSel(new Set(groups.find(x => x.name === name).list.map(r => r.id))); };
  const sum = g.list.filter(r => sel.has(r.id)).reduce((a, r) => a + r.amount - r.allocated, 0);
  const save = async () => {
    try {
      await api('POST', '/api/kasse/reimburse', { receiptIds: [...sel], accountId, date });
      await reload(); toast(`${euro(sum)} an ${g.name} als erstattet gebucht`);
      if (groups.length === 1) onClose(); else pick(groups.find(x => x.name !== g.name).name);
    } catch (e) { setError(e.message); }
  };
  return (
    <Modal title="Auslagen erstatten" onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Schließen</button>
      <button className="btn btn-primary" onClick={save} disabled={!sel.size}>{euro(sum)} an {g.name} erstattet</button>
    </>}>
      <div className="people">
        {groups.map(x => <button key={x.name} className={`person ${x.name === g.name ? 'on' : ''}`} onClick={() => pick(x.name)}><span className="avatar">{x.name[0]}</span>{x.name}<strong>{euro(x.total)}</strong></button>)}
      </div>
      <div className="rows compact">
        {g.list.map(r => (
          <label key={r.id} className="row static check">
            <input type="checkbox" checked={sel.has(r.id)} onChange={e => { const s = new Set(sel); e.target.checked ? s.add(r.id) : s.delete(r.id); setSel(s); }} />
            <span className="row-main"><strong>{r.description}</strong><small>Beleg {r.number} · {fmtDate(r.date)}</small></span>
            <span className="row-amount">{euro(r.amount - r.allocated)}</span>
          </label>
        ))}
      </div>
      <div className="grid2">
        <Field label="Ausgezahlt von"><select value={accountId} onChange={e => setAccountId(Number(e.target.value))}>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
        <Field label="Datum"><input type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
      </div>
      <p className="muted sm">Dabei wird automatisch eine Zahlung auf dem gewählten Konto erfasst und den Belegen zugeordnet.</p>
      <ErrorBox error={error} />
    </Modal>
  );
}
