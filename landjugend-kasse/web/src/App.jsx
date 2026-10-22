import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.js';
import { Icon, Toasts, ErrorBox, Field } from './ui.jsx';
import Payments from './Payments.jsx';
import Receipts from './Receipts.jsx';
import Settings from './Settings.jsx';

const Data = createContext(null);
export const useData = () => useContext(Data);

const PAGES = [
  { path: '/zahlungen', label: 'Zahlungen', icon: 'arrows-down-up', el: <Payments /> },
  { path: '/belege', label: 'Belege', icon: 'receipt', el: <Receipts /> },
  { path: '/einstellungen', label: 'Einstellungen', icon: 'gear-six', el: <Settings /> }
];

export function navigate(path) {
  history.pushState(null, '', path);
  window.dispatchEvent(new Event('popstate'));
}

export default function App() {
  const [state, setState] = useState(null);
  const loadState = useCallback(() => api('GET', '/api/state').then(setState).catch(() => setState({ error: true })), []);
  useEffect(() => {
    loadState();
    const h = () => loadState();
    window.addEventListener('ljk-auth', h);
    return () => window.removeEventListener('ljk-auth', h);
  }, [loadState]);

  if (!state) return <div className="center-screen"><div className="spinner" /></div>;
  if (state.error) return <div className="center-screen"><ErrorBox error="Der Server ist nicht erreichbar. Bitte später neu laden." /></div>;
  if (!state.setUp || !state.user) return <><Login setup={!state.setUp} club={state.club} onDone={loadState} /><Toasts /></>;
  return <Shell state={state} reloadState={loadState} />;
}

function Shell({ state, reloadState }) {
  const [path, setPath] = useState(location.pathname);
  const [data, setData] = useState(null);
  useEffect(() => {
    const h = () => setPath(location.pathname);
    window.addEventListener('popstate', h);
    return () => window.removeEventListener('popstate', h);
  }, []);

  const reload = useCallback(async () => {
    const [accounts, payments, receipts, lists, users] = await Promise.all([
      api('GET', '/api/kasse/accounts'), api('GET', '/api/kasse/payments'), api('GET', '/api/kasse/receipts'),
      api('GET', '/api/kasse/lists'), api('GET', '/api/users')
    ]);
    setData({ accounts, payments, receipts, ...lists, users });
  }, []);
  useEffect(() => { reload().catch(() => {}); }, [reload]);

  const page = PAGES.find(p => path.startsWith(p.path)) || PAGES[0];
  useEffect(() => { document.title = `${page.label} · ${state.club}`; }, [page, state.club]);
  const logout = async () => { await api('POST', '/api/logout'); reloadState(); };
  const unreviewed = data?.receipts.filter(r => !r.reviewed).length || 0;

  const link = p => (
    <a key={p.path} href={p.path} className={page === p ? 'active' : ''} onClick={e => { e.preventDefault(); navigate(p.path); }}>
      <Icon n={p.icon} w={page === p ? 'fill' : 'regular'} /><span>{p.label}</span>
      {p.path === '/belege' && unreviewed > 0 && <span className="badge">{unreviewed}</span>}
    </a>
  );

  return (
    <Data.Provider value={{ ...data, reload, me: state.user, club: state.club, reloadState }}>
      <div className="shell">
        <aside className="side">
          <div className="brand"><img src="/logo.svg" alt="" /><span>{state.club}</span></div>
          <div className="nav-group">Kasse</div>
          <nav>{PAGES.slice(0, 2).map(link)}</nav>
          <div className="side-bottom">
            <nav>{link(PAGES[2])}</nav>
            <div className="me">
              <span className="avatar">{state.user.name.slice(0, 1).toUpperCase()}</span>
              <span className="me-name">{state.user.name}<small>{state.user.email}</small></span>
              <button className="icon-btn" onClick={logout} title="Abmelden" aria-label="Abmelden"><Icon n="sign-out" /></button>
            </div>
          </div>
        </aside>
        <main className="main">{data ? page.el : <div className="center-screen"><div className="spinner" /></div>}</main>
        <nav className="tabbar">{PAGES.map(link)}</nav>
      </div>
      <Toasts />
    </Data.Provider>
  );
}

function Login({ setup, club, onDone }) {
  const [f, setF] = useState({ club: '', name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const submit = async e => {
    e.preventDefault();
    setBusy(true); setError('');
    try { await api('POST', setup ? '/api/setup' : '/api/login', f); onDone(); }
    catch (err) { setError(err.message); setBusy(false); }
  };
  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <img src="/logo.svg" alt="" className="login-logo" />
        <h1>{setup ? 'Kasse einrichten' : club || 'Kasse'}</h1>
        <p className="muted">{setup ? 'Lege den Namen eures Vereins und dein Konto als Admin an. Weitere Leute lädst du danach in den Einstellungen ein.' : 'Melde dich an, um die Kasse zu öffnen.'}</p>
        {setup && <Field label="Name des Vereins"><input value={f.club} onChange={set('club')} placeholder="z. B. Landjugend Musterdorf" required autoFocus /></Field>}
        {setup && <Field label="Dein Name"><input value={f.name} onChange={set('name')} autoComplete="name" required /></Field>}
        <Field label="E-Mail"><input type="email" value={f.email} onChange={set('email')} autoComplete="email" required autoFocus={!setup} /></Field>
        <Field label="Passwort" hint={setup ? 'Mindestens 8 Zeichen' : undefined}>
          <input type="password" value={f.password} onChange={set('password')} autoComplete={setup ? 'new-password' : 'current-password'} required />
        </Field>
        <ErrorBox error={error} />
        <button className="btn btn-primary btn-lg" disabled={busy}>{setup ? 'Kasse einrichten' : 'Anmelden'}</button>
      </form>
    </div>
  );
}
