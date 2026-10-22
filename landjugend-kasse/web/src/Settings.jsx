import { useState } from 'react';
import { api, euro } from './api.js';
import { useData } from './App.jsx';
import { Icon, Modal, Field, Toggle, ErrorBox, toast, useConfirm } from './ui.jsx';
import { AccountForm } from './Payments.jsx';

export default function Settings() {
  const { me, club, accounts, costCenters, categories, users, reload, reloadState } = useData();
  const [ask, confirm] = useConfirm();
  const [accForm, setAccForm] = useState(null);
  const [userForm, setUserForm] = useState(null);
  const [pwForm, setPwForm] = useState(false);
  const [clubName, setClubName] = useState(club);

  const run = async (fn, msg) => { try { await fn(); await reload(); if (msg) toast(msg); } catch (e) { toast(e.message, 'err'); } };
  const rename = (path, item) => {
    const name = prompt('Neuer Name', item.name);
    if (name && name.trim() !== item.name) run(() => api('PUT', `/api/kasse/${path}/${item.id}`, { ...item, name }), 'Umbenannt');
  };
  const remove = async (path, item) => { if (await ask(`„${item.name}“ löschen?`)) run(() => api('DELETE', `/api/kasse/${path}/${item.id}`), 'Gelöscht'); };
  const add = (path, label) => { const name = prompt(`Neue ${label}`); if (name?.trim()) run(() => api('POST', `/api/kasse/${path}`, { name }), 'Angelegt'); };

  return (
    <div className="page narrow">
      <header className="page-head"><h1>Einstellungen</h1></header>

      {me.isAdmin && (
        <section className="card">
          <h2>Verein</h2>
          <form className="inline-form" onSubmit={e => { e.preventDefault(); run(() => api('PUT', '/api/settings', { club: clubName }), 'Gespeichert').then(reloadState); }}>
            <Field label="Name des Vereins"><input value={clubName} onChange={e => setClubName(e.target.value)} required /></Field>
            <button className="btn" disabled={clubName === club}>Speichern</button>
          </form>
        </section>
      )}

      <section className="card">
        <div className="card-head"><h2>Konten</h2><button className="btn sm" onClick={() => setAccForm({})}><Icon n="plus" />Konto</button></div>
        <div className="list">
          {accounts.map(a => (
            <div key={a.id} className="list-row">
              <Icon n={a.kind === 'bank' ? 'bank' : 'coins'} /><span className="grow">{a.name}<small>{a.kind === 'bank' ? a.iban || 'Bankkonto' : 'Barkasse'} · Anfangsbestand {euro(a.opening)}</small></span>
              <strong>{euro(a.balance)}</strong>
              <button className="icon-btn sm" onClick={() => setAccForm(a)} aria-label="Bearbeiten"><Icon n="pencil-simple" /></button>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="card-head"><h2>Kostenstellen</h2><button className="btn sm" onClick={() => add('cost-centers', 'Kostenstelle')}><Icon n="plus" />Kostenstelle</button></div>
        <p className="muted sm">Wofür gibt der Verein Geld aus bzw. nimmt es ein – z. B. Allgemein, Maifest, Zeltlager, Theaterabend.</p>
        <div className="list">
          {costCenters.map(c => (
            <div key={c.id} className="list-row">
              <label className="color" style={{ background: c.color }} title="Farbe ändern">
                <input type="color" value={c.color} onChange={e => run(() => api('PUT', `/api/kasse/cost-centers/${c.id}`, { name: c.name, color: e.target.value }))} />
              </label>
              <span className="grow">{c.name}<small>{c.used ? `${c.used}× verwendet` : 'nicht verwendet'}</small></span>
              <button className="icon-btn sm" onClick={() => rename('cost-centers', c)} aria-label="Umbenennen"><Icon n="pencil-simple" /></button>
              <button className="icon-btn sm" onClick={() => remove('cost-centers', c)} disabled={c.used > 0} aria-label="Löschen"><Icon n="trash" /></button>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="card-head"><h2>Kategorien</h2><button className="btn sm" onClick={() => add('categories', 'Kategorie')}><Icon n="plus" />Kategorie</button></div>
        <div className="chips">
          {categories.map(c => (
            <span key={c.id} className="chip">{c.name}
              <button onClick={() => rename('categories', c)} aria-label="Umbenennen"><Icon n="pencil-simple" /></button>
              {!c.used && <button onClick={() => remove('categories', c)} aria-label="Löschen"><Icon n="x" /></button>}
            </span>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="card-head"><h2>Nutzer:innen</h2>{me.isAdmin && <button className="btn sm" onClick={() => setUserForm({})}><Icon n="user-plus" />Einladen</button>}</div>
        <p className="muted sm">Alle Nutzer:innen können Zahlungen und Belege bearbeiten. Admins verwalten außerdem Verein und Zugänge.</p>
        <div className="list">
          {users.map(u => (
            <div key={u.id} className="list-row">
              <span className="avatar">{u.name[0].toUpperCase()}</span>
              <span className="grow">{u.name}{u.id === me.id && ' (du)'}<small>{u.email}</small></span>
              {u.isAdmin && <span className="pill info">Admin</span>}
              {me.isAdmin && u.id !== me.id && <>
                <button className="icon-btn sm" onClick={() => setUserForm(u)} aria-label="Bearbeiten"><Icon n="pencil-simple" /></button>
                <button className="icon-btn sm" onClick={async () => { if (await ask(`Zugang von ${u.name} entfernen?`)) run(() => api('DELETE', `/api/users/${u.id}`), 'Zugang entfernt'); }} aria-label="Entfernen"><Icon n="trash" /></button>
              </>}
            </div>
          ))}
        </div>
        <button className="link" onClick={() => setPwForm(true)}><Icon n="key" />Mein Passwort ändern</button>
      </section>

      {accForm && <AccountForm account={accForm.id ? accForm : null} onClose={() => setAccForm(null)} />}
      {userForm && <UserForm user={userForm.id ? userForm : null} onClose={() => setUserForm(null)} />}
      {pwForm && <PasswordForm onClose={() => setPwForm(false)} />}
      {confirm}
    </div>
  );
}

function UserForm({ user, onClose }) {
  const { reload } = useData();
  const [f, setF] = useState({ name: user?.name || '', email: user?.email || '', password: '', isAdmin: !!user?.isAdmin });
  const [error, setError] = useState('');
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const save = async e => {
    e.preventDefault();
    try {
      if (user) await api('PUT', `/api/users/${user.id}`, { isAdmin: f.isAdmin, password: f.password || undefined });
      else await api('POST', '/api/users', f);
      await reload(); toast(user ? 'Gespeichert' : `${f.name} angelegt – gib E-Mail und Start-Passwort weiter`); onClose();
    } catch (err) { setError(err.message); }
  };
  return (
    <Modal title={user ? user.name : 'Person einladen'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Abbrechen</button><button className="btn btn-primary" form="user-form">Speichern</button></>}>
      <form id="user-form" className="form" onSubmit={save}>
        {!user && <Field label="Name"><input value={f.name} onChange={set('name')} required autoFocus /></Field>}
        {!user && <Field label="E-Mail"><input type="email" value={f.email} onChange={set('email')} required /></Field>}
        <Field label={user ? 'Neues Passwort (leer lassen = unverändert)' : 'Start-Passwort'} hint="Mindestens 8 Zeichen. Die Person kann es danach selbst ändern.">
          <input value={f.password} onChange={set('password')} required={!user} autoComplete="new-password" />
        </Field>
        <Toggle checked={f.isAdmin} onChange={isAdmin => setF({ ...f, isAdmin })} label="Admin" hint="– darf Verein und Zugänge verwalten" />
        <ErrorBox error={error} />
      </form>
    </Modal>
  );
}

function PasswordForm({ onClose }) {
  const [f, setF] = useState({ old: '', password: '' });
  const [error, setError] = useState('');
  const save = async e => {
    e.preventDefault();
    try { await api('POST', '/api/password', f); toast('Passwort geändert'); onClose(); }
    catch (err) { setError(err.message); }
  };
  return (
    <Modal title="Passwort ändern" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Abbrechen</button><button className="btn btn-primary" form="pw-form">Speichern</button></>}>
      <form id="pw-form" className="form" onSubmit={save}>
        <Field label="Bisheriges Passwort"><input type="password" value={f.old} onChange={e => setF({ ...f, old: e.target.value })} autoComplete="current-password" required autoFocus /></Field>
        <Field label="Neues Passwort" hint="Mindestens 8 Zeichen"><input type="password" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} autoComplete="new-password" required /></Field>
        <ErrorBox error={error} />
      </form>
    </Modal>
  );
}
