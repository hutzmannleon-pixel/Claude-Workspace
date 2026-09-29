import { useEffect, useState } from 'react';
import { sx, api, useWide } from './lib/core.js';
import { Shell, GLOW, Icon } from './ui.jsx';
import { FeedbackButton } from './Feedback.jsx';

export default function Landing() {
  const go = p => () => { location.href = p; };
  const [cfg, setCfg] = useState(null);
  useEffect(() => { api('/api/config').then(setCfg).catch(() => {}); }, []);
  const wide = useWide();
  if (wide) return <Desktop cfg={cfg} go={go} />;
  return (
    <Shell glow={GLOW.customer} bottom={
      <div style={sx('flex:none;padding:10px 16px 2px;position:relative;z-index:2;display:flex;flex-direction:column;gap:8px')}>
        <button className="btn btn-primary" onClick={go('/kunde')} style={sx('width:100%;min-height:50px;font-size:15px')}><Icon n="ph-house-line" />Ich bin Bewohner</button>
        <button className="btn btn-secondary" onClick={go('/kaminfeger')} style={sx('width:100%;min-height:50px;font-size:15px')}><Icon n="ph-path" />Ich bin Kaminfeger</button>
        <button className="btn btn-ghost" onClick={go('/betreiber')} style={sx('min-height:44px;color:var(--color-neutral-400)')}>Betreiber-Zugang</button>
        <div style={sx('display:flex;justify-content:center;gap:18px;font-size:12px;padding-bottom:4px')}><a href="/impressum" style={sx('color:var(--color-neutral-500)')}>Impressum</a><a href="/datenschutz" style={sx('color:var(--color-neutral-500)')}>Datenschutz</a></div>
      </div>
    }>
      <div style={sx('padding:64px 26px 0;display:flex;flex-direction:column;gap:14px')}>
        <span className="card-kicker">Kaminfeger-Termine</span>
        {cfg?.restricted && <span className="tag tag-outline" style={sx('align-self:flex-start')}>Testbetrieb · nur für eingeladene Personen</span>}
        <div style={sx('font-size:34px;font-weight:500;letter-spacing:-0.025em;line-height:1.1;text-wrap:pretty')}>Der Kaminfeger kommt, wenn Sie zu Hause sind.</div>
        <div style={sx('font-size:15px;color:var(--color-neutral-400);text-wrap:pretty')}>Ihr Kaminfeger gibt Zeitfenster für Ihre Straße frei – Sie wählen die halbe Stunde, die passt. Weniger verschlossene Türen, weniger Nachtermine.</div>
      </div>
      <div style={sx('display:flex;flex-direction:column;gap:14px;padding:40px 26px 20px;font-size:14px')}>
        <div style={sx('display:flex;gap:12px;align-items:center')}><Icon n="ph-calendar-check" style={sx('font-size:20px;color:var(--color-accent)')} />Zeit selbst wählen</div>
        <div style={sx('display:flex;gap:12px;align-items:center')}><Icon n="ph-map-pin-line" style={sx('font-size:20px;color:var(--color-accent)')} />Live sehen, wie weit er noch weg ist</div>
        <div style={sx('display:flex;gap:12px;align-items:center')}><Icon n="ph-shield-check" style={sx('font-size:20px;color:var(--color-accent)')} />Nur verifizierte Bewohner und Kaminfeger</div>
      </div>
    </Shell>
  );
}

const FEATURES = [['ph-calendar-check', 'Zeit selbst wählen'], ['ph-map-pin-line', 'Live sehen, wie weit er noch weg ist'], ['ph-shield-check', 'Nur verifizierte Bewohner und Kaminfeger']];
const ENTRIES = [
  ['/kunde', 'ph-house-line', 'Ich bin Bewohner', 'Termin für die Feuerstättenschau wählen, verschieben oder absagen.'],
  ['/kaminfeger', 'ph-path', 'Ich bin Kaminfeger', 'Kehrbuch importieren, Zeitfenster pro Straße freigeben, Tagesroute.'],
  ['/betreiber', 'ph-seal-check', 'Betreiber-Zugang', 'Kaminfeger und Bewohner prüfen, Bezirksverzeichnis pflegen.']
];

/** Startseite ab 1024 px: Text links, Einstiege rechts. */
function Desktop({ cfg, go }) {
  return (
    <div style={sx('min-height:100dvh;display:flex;flex-direction:column;font-family:var(--font-body);color:var(--color-text);font-size:15px;line-height:1.45;background:radial-gradient(70% 60% at 0% 0%, color-mix(in srgb, var(--color-accent) 11%, transparent), transparent 70%), var(--color-bg)')}>
      <header style={sx('display:flex;align-items:center;gap:10px;padding:24px 48px')}>
        <div style={sx('width:34px;height:34px;border-radius:10px;background:var(--color-accent);color:var(--color-bg);display:grid;place-items:center')}><Icon w="ph-fill" n="ph-flame" style={sx('font-size:19px')} /></div>
        <span style={sx('font-size:16px;font-weight:500')}>Kaminfeger-Termine</span>
        {cfg?.restricted && <span className="tag tag-outline" style={sx('margin-left:8px')}>Testbetrieb · nur für eingeladene Personen</span>}
      </header>
      <main style={sx('flex:1;display:grid;grid-template-columns:minmax(0, 1.1fr) minmax(0, 1fr);gap:64px;align-items:center;max-width:1180px;width:100%;margin:0 auto;padding:24px 48px 48px')}>
        <div style={sx('display:flex;flex-direction:column;gap:18px')}>
          <span className="card-kicker">Feuerstättenschau ohne verschlossene Türen</span>
          <h1 style={sx('margin:0;font-size:52px;font-weight:500;letter-spacing:-0.03em;line-height:1.05;text-wrap:balance')}>Der Kaminfeger kommt, wenn Sie zu Hause sind.</h1>
          <p style={sx('margin:0;font-size:18px;color:var(--color-neutral-400);max-width:34em;text-wrap:pretty')}>Ihr Kaminfeger gibt Zeitfenster für Ihre Straße frei – Sie wählen die halbe Stunde, die passt. Weniger verschlossene Türen, weniger Nachtermine.</p>
          <div style={sx('display:flex;flex-direction:column;gap:14px;padding-top:18px;font-size:15px')}>
            {FEATURES.map(f => <div key={f[1]} style={sx('display:flex;gap:12px;align-items:center')}><Icon n={f[0]} style={sx('font-size:22px;color:var(--color-accent)')} />{f[1]}</div>)}
          </div>
        </div>
        <div style={sx('display:flex;flex-direction:column;gap:12px')}>
          {ENTRIES.map((e, i) => (
            <button key={e[0]} onClick={go(e[0])} style={sx(`text-align:left;display:flex;gap:16px;align-items:center;padding:20px 22px;border-radius:var(--radius-lg);border:0;cursor:pointer;font:inherit;color:inherit;background:var(--color-surface);box-shadow:${i === 0 ? '0 0 0 1px var(--color-accent)' : '0 0 0 1px var(--color-divider)'}`)}>
              <div style={sx(`width:48px;height:48px;border-radius:14px;display:grid;place-items:center;flex:none;background:${i === 0 ? 'var(--color-accent)' : 'var(--color-neutral-800)'};color:${i === 0 ? 'var(--color-bg)' : 'var(--color-accent)'}`)}><Icon n={e[1]} style={sx('font-size:24px')} /></div>
              <div style={sx('flex:1')}><div style={sx('font-size:17px;font-weight:500')}>{e[2]}</div><div style={sx('font-size:13px;color:var(--color-neutral-400);text-wrap:pretty')}>{e[3]}</div></div>
              <Icon n="ph-caret-right" style={sx('font-size:18px;color:var(--color-neutral-500)')} />
            </button>
          ))}
        </div>
      </main>
      <FeedbackButton variant="fixed" where="Start" />
      <footer style={sx('display:flex;justify-content:center;gap:22px;font-size:12px;padding:0 0 22px')}><a href="/impressum" style={sx('color:var(--color-neutral-500)')}>Impressum</a><a href="/datenschutz" style={sx('color:var(--color-neutral-500)')}>Datenschutz</a></footer>
    </div>
  );
}
