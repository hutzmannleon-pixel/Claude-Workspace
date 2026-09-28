// Eigentümer bestätigt per E-Mail-Link, dass ein Mieter dort wohnt.
import { useEffect, useState } from 'react';
import { sx, api, useAction } from './lib/core.js';
import { Shell, GLOW, Icon, Hero, ErrorLine, Loading } from './ui.jsx';

export default function Owner({ token }) {
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState(null);
  const [done, setDone] = useState(null);
  const act = useAction();
  useEffect(() => { api(`/api/owner/${token}`).then(setInfo).catch(e => setErr(e.message)); }, [token]);
  const answer = a => act.run(async () => { await api(`/api/owner/${token}`, { body: { answer: a } }); setDone(a); });

  if (!info && !err) return <Loading />;
  if (err || done) return (
    <Shell glow={GLOW.customer}>
      {err ? <Hero icon="ph-link-break" muted title="Link nicht mehr gültig" sub={err} />
        : <Hero icon={done === 'yes' ? 'ph-check' : 'ph-x'} muted={done !== 'yes'} title="Danke für Ihre Antwort"
          sub={done === 'yes' ? `${info.resident} kann jetzt Termine buchen.` : 'Wir haben die Anfrage abgelehnt und die Person informiert.'} />}
    </Shell>
  );
  return (
    <Shell glow={GLOW.customer} bottom={
      <div style={sx('flex:none;padding:10px 16px 2px;position:relative;z-index:2;display:flex;flex-direction:column;gap:8px')}>
        {act.error && <ErrorLine text={act.error} />}
        <button className="btn btn-primary" disabled={act.busy} onClick={() => answer('yes')} style={sx('min-height:50px;font-size:15px')}><Icon n="ph-check" />Ja, wohnt dort</button>
        <button className="btn btn-secondary" disabled={act.busy} onClick={() => answer('no')} style={sx('min-height:48px')}>Nein / weiß ich nicht</button>
      </div>
    }>
      <div style={sx('padding:64px 26px 0;display:flex;flex-direction:column;gap:12px')}>
        <span className="card-kicker">Bewohner bestätigen</span>
        <div style={sx('font-size:28px;font-weight:500;letter-spacing:-0.02em;line-height:1.15;text-wrap:pretty')}>Wohnt {info.resident} in der {info.address}?</div>
        <div style={sx('font-size:14px;color:var(--color-neutral-400);text-wrap:pretty')}>Guten Tag {info.owner}, die Person möchte über Kaminfeger-Termine die Feuerstättenschau buchen. Laut Kehrbuch Ihres Kaminfegers sind Sie Eigentümer. Bitte bestätigen Sie nur, wenn Sie es sicher wissen.</div>
      </div>
    </Shell>
  );
}
