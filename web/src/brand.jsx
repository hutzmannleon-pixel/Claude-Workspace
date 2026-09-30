// Marke „Kaminfeger Verwaltung“: Logo (Zylinder mit Kaminbesen) und Hintergrund-Illustration (Berge, Dach, Kamin im Nebel).
import { useId } from 'react';

const SPIKES = Array.from({ length: 28 }, (_, i) => (i / 28) * Math.PI * 2);

/** Logo-Symbol. tone 'light' für dunkle Flächen, 'dark' für helle. */
export function LogoMark({ size = 40, tone = 'light', title }) {
  const id = useId().replace(/:/g, '');
  const hat = tone === 'light' ? '#fbf3ee' : '#24140f';
  const hatHi = tone === 'light' ? '#ffffff' : '#4a2e26';
  const band = tone === 'light' ? 'var(--acc, #ff8a3d)' : '#a0563a';
  const brush = tone === 'light' ? '#f3e4da' : '#24140f';
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} style={{ display: 'block', flex: 'none' }}>
      {title && <title>{title}</title>}
      <defs>
        <linearGradient id={`h${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={hat} /><stop offset=".35" stopColor={hatHi} /><stop offset="1" stopColor={hat} />
        </linearGradient>
      </defs>
      {/* Besenstiel hinter dem Hut, Besenkopf rechts unten */}
      <line x1="9" y1="52" x2="49" y2="42" stroke={brush} strokeWidth="2.4" strokeLinecap="round" />
      <g transform="translate(50 42)" stroke={brush} strokeWidth="1.5" strokeLinecap="round">
        {SPIKES.map((a, i) => <line key={i} x1={Math.cos(a) * 2.5} y1={Math.sin(a) * 2.5} x2={Math.cos(a) * (i % 2 ? 9 : 11)} y2={Math.sin(a) * (i % 2 ? 9 : 11)} />)}
        <circle r="2.6" fill={brush} stroke="none" />
      </g>
      {/* Zylinder, leicht geneigt */}
      <g transform="rotate(-8 30 30)">
        <path d="M17 12.5 Q17 9.5 20 9.5 H39 Q42 9.5 42 12.5 L40.5 37 H18.5 Z" fill={`url(#h${id})`} />
        <rect x="18.2" y="30.5" width="22.6" height="5.2" fill={band} />
        <ellipse cx="29.5" cy="38.5" rx="20.5" ry="4.6" fill={hat} />
        <ellipse cx="29.5" cy="37.6" rx="11" ry="1.4" fill={tone === 'light' ? '#e6cfc2' : '#150a07'} opacity=".55" />
      </g>
    </svg>
  );
}

/** Logo mit Schriftzug */
export function Logo({ size = 36, tone = 'light', stacked = false, sub }) {
  const fg = tone === 'light' ? 'var(--color-text)' : '#24140f';
  if (stacked) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
      <LogoMark size={size} tone={tone} title="Kaminfeger Verwaltung" />
      <div style={{ fontSize: size * 0.42, fontWeight: 700, lineHeight: 1.05, letterSpacing: '-0.02em', color: fg }}>Kaminfeger<br />Verwaltung</div>
      {sub && <div style={{ fontSize: 14, color: tone === 'light' ? 'var(--color-neutral-300)' : '#5a3e34', maxWidth: 240 }}>{sub}</div>}
    </div>
  );
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <LogoMark size={size} tone={tone} />
      <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.1, color: fg }}>Kaminfeger<br />Verwaltung</div>
    </div>
  );
}

/**
 * Illustration: Morgenlicht über Bergen, Dach mit Kamin und Besen, Nebel.
 * Füllt ihren Container (unten ausgerichtet). wide = Breitbild (Desktop), simple = nur Berge und Licht (App-Kopf).
 */
export function Scenery({ style, wide = false, simple = false }) {
  const id = useId().replace(/:/g, '');
  const W = wide ? 1200 : 390, X0 = wide ? -405 : 0;
  const trees = [];
  for (let x = X0 - 4; x < X0 + W; x += 11) { const h = 10 + ((Math.abs(x) * 7) % 9); trees.push(`M${x} 232 l5 -${h} l5 ${h} Z`); }
  const tiles = wide ? [-2, -1, 0, 1, 2] : [0];
  const far = 'M0 158 L48 160 L92 182 L150 128 L204 170 L246 142 L300 172 L352 138 L390 158 V320 H0Z';
  const mid = 'M0 196 L44 206 L104 214 L168 184 L236 212 L298 190 L352 206 L390 196 V320 H0Z';
  const sunX = wide ? 520 : 281;
  return (
    <svg viewBox={`${X0} 0 ${W} 320`} preserveAspectRatio="xMidYMax slice" aria-hidden="true" style={{ display: 'block', width: '100%', height: '100%', ...style }}>
      <defs>
        <radialGradient id={`sun${id}`} cx={sunX} cy="148" r={wide ? 260 : 190} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffd08a" stopOpacity=".95" /><stop offset=".18" stopColor="#ff9f5a" stopOpacity=".5" /><stop offset="1" stopColor="#ff8a4a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`mist${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd9c4" stopOpacity="0" /><stop offset=".5" stopColor="#ffd9c4" stopOpacity=".24" /><stop offset="1" stopColor="#ffd9c4" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`roof${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5c3934" /><stop offset="1" stopColor="#2a1917" />
        </linearGradient>
        <linearGradient id={`chim${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#4a2c27" /><stop offset=".6" stopColor="#6a433a" /><stop offset="1" stopColor="#3b231f" />
        </linearGradient>
      </defs>
      <rect className="kf-breathe" x={X0} width={W} height="320" fill={`url(#sun${id})`} />
      <circle cx={sunX} cy="148" r="9" fill="#fff1d6" opacity=".95" />
      {tiles.map(t => <path key={'f' + t} d={far} transform={`translate(${t * 390} 0)`} fill="#b97c72" opacity=".55" />)}
      <rect className="kf-drift" x={X0 - 30} y="150" width={W + 60} height="70" fill={`url(#mist${id})`} />
      {tiles.map(t => <path key={'m' + t} d={mid} transform={`translate(${t * 390} 0)`} fill="#80504a" opacity=".85" />)}
      <path d={trees.join(' ')} fill="#5a3533" opacity=".9" />
      <rect className="kf-drift slow" x={X0 - 30} y="210" width={W + 60} height="50" fill={`url(#mist${id})`} />
      {!simple && <g transform={wide ? 'translate(330 40) scale(.88)' : undefined}>
        {/* Dach mit Ziegelreihen */}
        <path d="M-20 330 L52 250 L262 206 L480 330 Z" fill={`url(#roof${id})`} />
        <path d="M52 250 L262 206" stroke="#f0b894" strokeOpacity=".35" strokeWidth="1.5" />
        {[1, 2, 3, 4, 5, 6].map(i => <path key={i} d={`M${52 - i * 12} ${250 + i * 13} L${262 + i * 26} ${206 + i * 14}`} stroke="#1c0e0b" strokeOpacity=".45" strokeWidth="1" />)}
        {/* Kamin */}
        <path d="M170 158 H200 V218 L170 224 Z" fill={`url(#chim${id})`} />
        <rect x="164" y="150" width="42" height="9" rx="1.5" fill="#7a4b40" />
        <rect x="168" y="143" width="34" height="8" rx="1.5" fill="#5e392f" />
        {/* Kaminbesen am Kamin angelehnt */}
        <line x1="214" y1="222" x2="240" y2="156" stroke="#22120e" strokeWidth="3" strokeLinecap="round" />
        <g transform="translate(243 148)" stroke="#22120e" strokeWidth="1.6" strokeLinecap="round">
          {SPIKES.map((a, i) => <line key={i} x1={Math.cos(a) * 3} y1={Math.sin(a) * 3} x2={Math.cos(a) * (i % 2 ? 14 : 17)} y2={Math.sin(a) * (i % 2 ? 14 : 17)} />)}
        </g>
      </g>}
      <rect className="kf-drift" x={X0 - 30} y="262" width={W + 60} height="58" fill={`url(#mist${id})`} opacity=".7" />
    </svg>
  );
}
