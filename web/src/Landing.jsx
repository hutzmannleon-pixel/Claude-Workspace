import { useEffect, useState } from 'react';
import { sx, api, useWide } from './lib/core.js';
import { Shell, GLOW, Icon } from './ui.jsx';
import { FeedbackButton } from './Feedback.jsx';
import { Logo, Scenery } from './brand.jsx';

export default function Landing() {
  const go = p => () => { location.href = p; };
  const [cfg, setCfg] = useState(null);
  useEffect(() => { api('/api/config').then(setCfg).catch(() => {}); }, []);
  const wide = useWide();
  if (wide) return <Desktop cfg={cfg} go={go} />;
  return (
    <Shell glow={GLOW.customer} scenery={false} backdrop={
      <div aria-hidden="true" style={sx('position:absolute;left:0;right:0;bottom:0;height:58%;pointer-events:none;-webkit-mask-image:linear-gradient(to bottom, transparent, #000 26%);mask-image:linear-gradient(to bottom, transparent, #000 26%)')}>
        <Scenery />
        <div style={sx('position:absolute;inset:0;background:linear-gradient(to bottom, transparent 45%, rgba(39,25,23,0.7))')} />
      </div>
    } bottom={
      <div style={sx('flex:none;padding:10px 20px 2px;position:relative;z-index:2;display:flex;flex-direction:column;gap:10px')}>
        <button className="btn btn-primary" onClick={go('/kunde')} style={sx('width:100%;min-height:54px;font-size:16px;border-radius:20px')}><Icon n="ph-house-line" />Ich bin Bewohner<Icon n="ph-arrow-right" style={sx('margin-left:auto')} /></button>
        <button className="btn btn-secondary" onClick={go('/kaminfeger')} style={sx('width:100%;min-height:54px;font-size:16px;border-radius:20px')}><Icon n="ph-path" />Ich bin Kaminfeger<Icon n="ph-arrow-right" style={sx('margin-left:auto')} /></button>
        <button className="btn btn-ghost" onClick={go('/betreiber')} style={sx('min-height:44px;color:var(--color-neutral-300)')}>Betreiber-Zugang</button>
        <div style={sx('display:flex;justify-content:center;gap:18px;font-size:12px;padding-bottom:4px')}><a href="/impressum" style={sx('color:var(--color-neutral-400)')}>Impressum</a><a href="/datenschutz" style={sx('color:var(--color-neutral-400)')}>Datenschutz</a></div>
      </div>
    }>
      <div style={sx('position:relative;min-height:100%;display:flex;flex-direction:column')}>
        <div style={sx('position:relative;padding:36px 26px 0;display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center')}>
          <Logo size={92} stacked sub="Für Kaminfeger und Bewohner des Bezirks" />
          {cfg?.restricted && <span className="tag tag-outline">Testbetrieb · nur für eingeladene Personen</span>}
          <div style={sx('font-size:15px;color:var(--color-neutral-200);text-wrap:pretty;max-width:320px;margin-top:6px')}>Der Kaminfeger kommt, wenn Sie zu Hause sind: Sie wählen die halbe Stunde, die passt.</div>
        </div>
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
    <div style={sx('min-height:100dvh;display:flex;flex-direction:column;font-family:var(--font-body);color:var(--color-text);font-size:15px;line-height:1.45;background:radial-gradient(60% 50% at 78% 18%, color-mix(in srgb, var(--acc) 30%, transparent), transparent 70%), var(--app-bg);position:relative;overflow:hidden')}>
      <div aria-hidden="true" style={sx('position:absolute;left:0;right:0;bottom:0;height:max(46vh, 380px);pointer-events:none;-webkit-mask-image:linear-gradient(to bottom, transparent, #000 30%);mask-image:linear-gradient(to bottom, transparent, #000 30%)')}><Scenery wide /></div>
      <header style={sx('position:relative;display:flex;align-items:center;gap:14px;padding:24px 48px')}>
        <Logo size={44} />
        {cfg?.restricted && <span className="tag tag-outline" style={sx('margin-left:8px')}>Testbetrieb · nur für eingeladene Personen</span>}
      </header>
      <main style={sx('position:relative;flex:1;display:grid;grid-template-columns:minmax(0, 1.1fr) minmax(0, 1fr);gap:64px;align-items:center;max-width:1180px;width:100%;margin:0 auto;padding:24px 48px 48px')}>
        <div style={sx('display:flex;flex-direction:column;gap:18px;text-shadow:0 2px 18px rgba(30,10,4,0.45)')}>
          <span className="card-kicker">Feuerstättenschau ohne verschlossene Türen</span>
          <h1 style={sx('margin:0;font-size:54px;font-weight:700;letter-spacing:-0.03em;line-height:1.04;text-wrap:balance')}>Der Kaminfeger kommt, wenn Sie zu Hause sind.</h1>
          <p style={sx('margin:0;font-size:18px;color:var(--color-neutral-200);max-width:34em;text-wrap:pretty')}>Ihr Kaminfeger gibt Zeitfenster für Ihre Straße frei – Sie wählen die halbe Stunde, die passt. Weniger verschlossene Türen, weniger Nachtermine.</p>
          <div style={sx('display:flex;flex-direction:column;gap:14px;padding-top:18px;font-size:15px')}>
            {FEATURES.map(f => <div key={f[1]} style={sx('display:flex;gap:12px;align-items:center')}><Icon n={f[0]} style={sx('font-size:22px;color:var(--color-accent-300)')} />{f[1]}</div>)}
          </div>
        </div>
        <div style={sx('display:flex;flex-direction:column;gap:12px')}>
          {ENTRIES.map((e, i) => (
            <button key={e[0]} className="glass" onClick={go(e[0])} style={sx(`text-align:left;display:flex;gap:16px;align-items:center;padding:20px 22px;border-radius:24px;border:0;cursor:pointer;font:inherit;color:inherit;${i === 0 ? 'box-shadow:0 0 0 1px color-mix(in srgb, var(--acc) 55%, transparent), 0 14px 34px color-mix(in srgb, var(--acc) 25%, rgba(20,6,2,0.4))' : ''}`)}>
              <div style={sx(`width:50px;height:50px;border-radius:50%;display:grid;place-items:center;flex:none;background:${i === 0 ? 'linear-gradient(180deg, var(--color-accent-300), var(--acc))' : 'color-mix(in srgb, var(--acc) 18%, transparent)'};color:${i === 0 ? '#2a120a' : 'var(--color-accent-200)'}`)}><Icon n={e[1]} style={sx('font-size:24px')} /></div>
              <div style={sx('flex:1')}><div style={sx('font-size:17px;font-weight:600')}>{e[2]}</div><div style={sx('font-size:13px;color:var(--color-neutral-300);text-wrap:pretty')}>{e[3]}</div></div>
              <Icon n="ph-caret-right" style={sx('font-size:18px;color:var(--color-neutral-300)')} />
            </button>
          ))}
        </div>
      </main>
      <FeedbackButton variant="fixed" where="Start" />
      <footer style={sx('position:relative;display:flex;justify-content:center;gap:22px;font-size:12px;padding:0 0 22px')}><a href="/impressum" style={sx('color:var(--color-neutral-300)')}>Impressum</a><a href="/datenschutz" style={sx('color:var(--color-neutral-300)')}>Datenschutz</a></footer>
    </div>
  );
}
