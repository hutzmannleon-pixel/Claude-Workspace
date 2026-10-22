// Öffentliche Handy-Seite zum Hochladen von Belegen (Link aus dem QR-Code + PIN)
import { useEffect, useRef, useState } from 'react';
import { api, shrink } from './api.js';
import { Icon, Field, Toggle, ErrorBox } from './ui.jsx';

const store = {
  get: k => { try { return localStorage.getItem(k) || ''; } catch { return ''; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} }
};

export default function Upload({ token }) {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const [pin, setPin] = useState(() => { try { return sessionStorage.getItem('ljk-pin-' + token) || ''; } catch { return ''; } });
  const [f, setF] = useState({ name: store.get('ljk-name'), description: '', amount: '', advance: true });
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const camRef = useRef(), fileRef = useRef();

  useEffect(() => {
    api('GET', `/api/hochladen/${token}`).then(i => { setInfo(i); document.title = `Beleg hochladen · ${i.club}`; }).catch(e => setError(e.message));
  }, [token]);
  useEffect(() => {
    if (!file?.type.startsWith('image/')) { setPreview(''); return; }
    const u = URL.createObjectURL(file); setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const send = async e => {
    e.preventDefault();
    if (!file) return setError('Bitte zuerst einen Beleg fotografieren oder auswählen.');
    setBusy(true); setError('');
    const fd = new FormData();
    // Felder vor der Datei anhängen, damit der Server sie vor dem Speichern prüfen kann
    fd.append('pin', pin);
    if (info.kind === 'team') { fd.append('name', f.name); fd.append('description', f.description); fd.append('amount', f.amount); fd.append('advance', f.advance ? '1' : '0'); }
    fd.append('file', await shrink(file));
    try {
      await api('POST', `/api/hochladen/${token}`, fd);
      try { sessionStorage.setItem('ljk-pin-' + token, pin); } catch {}
      if (info.kind === 'team') store.set('ljk-name', f.name);
      setDone(n => n + 1); setFile(null); setF({ ...f, description: '', amount: '' });
    } catch (err) { setError(err.message); }
    setBusy(false);
  };

  if (!info) return <div className="center-screen">{error ? <div className="m-card"><Icon n="link-break" className="big" /><ErrorBox error={error} /></div> : <div className="spinner" />}</div>;

  return (
    <div className="mobile">
      <header className="m-head"><img src="/logo.svg" alt="" /><div><strong>{info.club}</strong><small>Beleg hochladen{info.kind === 'personal' && info.owner ? ` · ${info.owner}` : ''}</small></div></header>
      {done > 0 && !file && (
        <div className="m-done"><Icon n="check-circle" w="fill" /><div><strong>{done === 1 ? 'Beleg ist angekommen' : `${done} Belege sind angekommen`}</strong><small>Die Kasse prüft ihn und trägt ihn ein. Du kannst gleich den nächsten hochladen.</small></div></div>
      )}
      <form className="m-card form" onSubmit={send}>
        {!file ? (
          <div className="m-pick">
            <button type="button" className="btn btn-primary btn-lg" onClick={() => camRef.current.click()}><Icon n="camera" w="bold" />Foto aufnehmen</button>
            <button type="button" className="btn btn-lg" onClick={() => fileRef.current.click()}><Icon n="file-arrow-up" />Datei oder PDF wählen</button>
          </div>
        ) : (
          <div className="m-file">
            {preview ? <img src={preview} alt="Vorschau" /> : <div className="m-pdf"><Icon n="file-pdf" /><span>{file.name}</span></div>}
            <button type="button" className="link" onClick={() => setFile(null)}><Icon n="arrow-counter-clockwise" />Anderen Beleg wählen</button>
          </div>
        )}
        <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={e => { setFile(e.target.files[0] || null); e.target.value = ''; }} />
        <input ref={fileRef} type="file" accept="application/pdf,image/*" hidden onChange={e => { setFile(e.target.files[0] || null); e.target.value = ''; }} />

        {info.kind === 'team' && <>
          <Field label="Dein Name"><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} autoComplete="name" required /></Field>
          <Field label="Wofür war das?"><input value={f.description} onChange={e => setF({ ...f, description: e.target.value })} placeholder="z. B. Brötchen fürs Frühstück" /></Field>
          <Field label="Betrag"><div className="money"><input inputMode="decimal" value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} placeholder="0,00" /><span>€</span></div></Field>
          <Toggle checked={f.advance} onChange={advance => setF({ ...f, advance })} label="Ich habe das privat bezahlt" hint="– und bekomme das Geld zurück" />
        </>}
        <Field label="PIN" hint="Steht neben dem QR-Code bzw. hast du mit dem Link bekommen">
          <input className="pin-input" inputMode="numeric" maxLength={4} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} placeholder="••••" required />
        </Field>
        <ErrorBox error={error} />
        <button className="btn btn-primary btn-lg" disabled={busy || !file}>{busy ? <><span className="spinner sm light" />Wird hochgeladen …</> : <><Icon n="paper-plane-tilt" w="bold" />Beleg senden</>}</button>
      </form>
    </div>
  );
}
