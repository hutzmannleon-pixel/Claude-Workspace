import { sx } from './lib/core.js';
import { Shell, GLOW, Icon } from './ui.jsx';

export default function Landing() {
  const go = p => () => { location.href = p; };
  return (
    <Shell glow={GLOW.customer} bottom={
      <div style={sx('flex:none;padding:10px 16px 2px;position:relative;z-index:2;display:flex;flex-direction:column;gap:8px')}>
        <button className="btn btn-primary" onClick={go('/kunde')} style={sx('width:100%;min-height:50px;font-size:15px')}><Icon n="ph-house-line" />Ich bin Bewohner</button>
        <button className="btn btn-secondary" onClick={go('/kaminfeger')} style={sx('width:100%;min-height:50px;font-size:15px')}><Icon n="ph-path" />Ich bin Kaminfeger</button>
        <button className="btn btn-ghost" onClick={go('/betreiber')} style={sx('min-height:44px;color:var(--color-neutral-400)')}>Betreiber-Zugang</button>
      </div>
    }>
      <div style={sx('padding:64px 26px 0;display:flex;flex-direction:column;gap:14px')}>
        <span className="card-kicker">Kaminfeger-Termine</span>
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
