import { StrictMode, lazy, Suspense, Component } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@phosphor-icons/web/regular';
import '@phosphor-icons/web/bold';
import '@phosphor-icons/web/fill';
import './ds/nocturne.css';
import './ds/theme.css';
import './ds/liquid.css';
import './lib/liquid.js';
import './app.css';
import { Loading } from './ui.jsx';
import Landing from './Landing.jsx';

const Customer = lazy(() => import('./customer/Customer.jsx'));
const Sweep = lazy(() => import('./sweep/Sweep.jsx'));
const Admin = lazy(() => import('./admin/Admin.jsx'));
const Owner = lazy(() => import('./Owner.jsx'));
const TestPage = lazy(() => import('./TestPage.jsx'));
const Legal = lazy(() => import('./Legal.jsx'));

function route() {
  const p = location.pathname.replace(/\/+$/, '') || '/';
  // Eigene Akzentfarbe je App (siehe ds/theme.css)
  document.documentElement.dataset.app = p === '/kunde' || p.startsWith('/eigentuemer/') ? 'customer' : p === '/kaminfeger' ? 'sweep' : p === '/betreiber' ? 'admin' : 'public';
  if (p === '/kunde') return <Customer />;
  if (p === '/kaminfeger') return <Sweep />;
  if (p === '/betreiber') return <Admin />;
  if (p.startsWith('/eigentuemer/')) return <Owner token={p.split('/')[2]} />;
  if (p === '/test') return <TestPage />;
  if (p === '/impressum' || p === '/datenschutz') return <Legal page={p.slice(1)} />;
  return <Landing />;
}

// Fängt Abstürze der Oberfläche ab. Nach einem Update fehlen alte Programmteile – dann einmal automatisch neu laden.
class Guard extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err) {
    const chunk = /dynamically imported module|Importing a module script failed|Failed to fetch|error loading dynamically/i.test(String(err?.message || err));
    let last = 0; try { last = Number(sessionStorage.getItem('kf-reloaded') || 0); } catch {}
    if (chunk && Date.now() - last > 30000) {
      try { sessionStorage.setItem('kf-reloaded', String(Date.now())); } catch {}
      location.reload();
    }
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center' }}>
        <div style={{ maxWidth: 340, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 22, fontWeight: 600 }}>Da ist etwas schiefgelaufen</div>
          <div style={{ fontSize: 14, color: 'var(--color-neutral-300)' }}>Bitte laden Sie die Seite neu. Ihre Daten sind sicher gespeichert.</div>
          <button className="btn btn-primary" onClick={() => location.reload()} style={{ minHeight: 48, marginTop: 8 }}>Neu laden</button>
        </div>
      </div>
    );
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode><Guard><Suspense fallback={<Loading />}>{route()}</Suspense></Guard></StrictMode>
);

if ('serviceWorker' in navigator && location.hostname !== 'localhost' && !new URLSearchParams(location.search).has('embed')) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
