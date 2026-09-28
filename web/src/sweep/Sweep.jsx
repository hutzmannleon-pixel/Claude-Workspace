import { useEffect, useState } from 'react';
import { api } from '../lib/core.js';
import { Loading } from '../ui.jsx';
import SweepOnboarding from './Onboarding.jsx';
import SweepApp from './App.jsx';

export default function Sweep() {
  const [mode, setMode] = useState(null);
  const q = new URLSearchParams(location.search);
  const notice = q.get('link') === 'ungueltig' ? 'Der Freischaltlink ist ungültig oder abgelaufen. Bitte melden Sie sich an – bei Bedarf schickt der Betreiber einen neuen Link.' : null;
  useEffect(() => {
    (async () => {
      const me = await api('/api/auth/me?role=sweep').catch(() => ({ user: null }));
      if (!me.user) return setMode({ view: 'ob', start: 'welcome' });
      const s = await api('/api/sweep/me').catch(() => null);
      if (!s) return setMode({ view: 'ob', start: 'welcome' });
      if (s.status === 'active') return setMode(q.get('aktiviert') ? { view: 'ob', start: 'done' } : { view: 'app' });
      if (s.status === 'draft') return setMode({ view: 'ob', start: s.district ? 'proof' : 'district' });
      setMode({ view: 'ob', start: 'pending' });
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!mode) return <Loading />;
  const clean = () => { if (q.has('aktiviert') || q.has('link')) history.replaceState(null, '', '/kaminfeger' + (q.has('embed') ? '?embed' : '')); };
  if (mode.view === 'ob') return <SweepOnboarding key={mode.start + (mode.k || '')} start={mode.start} notice={mode.start === 'welcome' ? notice : null} onDone={() => { clean(); setMode({ view: 'app' }); }} />;
  return <SweepApp onLogout={() => { clean(); setMode({ view: 'ob', start: 'welcome', k: Date.now() }); }} />;
}
