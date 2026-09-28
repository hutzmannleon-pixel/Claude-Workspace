import { useEffect, useState } from 'react';
import { api } from '../lib/core.js';
import { Loading } from '../ui.jsx';
import Onboarding from './Onboarding.jsx';
import CustomerApp from './App.jsx';

export default function Customer() {
  const [mode, setMode] = useState(null); // { view: 'ob' | 'app', start, readdress }
  const invite = new URLSearchParams(location.search).get('einladung');
  useEffect(() => {
    (async () => {
      const me = await api('/api/auth/me?role=customer').catch(() => ({ user: null }));
      if (!me.user) return setMode({ view: 'ob', start: 'welcome' });
      const st = await api('/api/customer/state').catch(() => null);
      if (st?.resident.status === 'needs_verify') return setMode({ view: 'ob', start: 'verify' });
      setMode({ view: 'app' });
    })();
  }, []);
  if (!mode) return <Loading />;
  const clearInvite = () => { if (invite) history.replaceState(null, '', '/kunde' + (location.search.includes('embed') ? '?embed' : '')); };
  if (mode.view === 'ob') return <Onboarding key={mode.start + (mode.readdress ? 'r' : '')} start={mode.start} readdress={mode.readdress} invite={mode.readdress ? null : invite}
    onDone={() => { clearInvite(); setMode({ view: 'app' }); }} onCancel={() => setMode({ view: 'app' })} />;
  return <CustomerApp onLogout={() => { clearInvite(); setMode({ view: 'ob', start: 'welcome', k: Date.now() }); }}
    onReaddress={() => setMode({ view: 'ob', start: 'address', readdress: true })} />;
}
