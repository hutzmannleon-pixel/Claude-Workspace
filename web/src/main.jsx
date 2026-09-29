import { StrictMode, lazy, Suspense } from 'react';
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
  if (p === '/kunde') return <Customer />;
  if (p === '/kaminfeger') return <Sweep />;
  if (p === '/betreiber') return <Admin />;
  if (p.startsWith('/eigentuemer/')) return <Owner token={p.split('/')[2]} />;
  if (p === '/test') return <TestPage />;
  if (p === '/impressum' || p === '/datenschutz') return <Legal page={p.slice(1)} />;
  return <Landing />;
}

createRoot(document.getElementById('root')).render(
  <StrictMode><Suspense fallback={<Loading />}>{route()}</Suspense></StrictMode>
);

if ('serviceWorker' in navigator && location.hostname !== 'localhost' && !new URLSearchParams(location.search).has('embed')) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
