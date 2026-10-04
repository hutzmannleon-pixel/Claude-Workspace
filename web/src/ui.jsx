// Gemeinsame Bausteine – Styles 1:1 aus den Claude-Design-Prototypen (Nocturne).
import { createContext, useContext, useEffect, useId, useRef, useState } from 'react';
import { sx, api, EMBED, useWide, useData, useAction, parseDate, isoDate, dayLabel } from './lib/core.js';
import { passkeySupported, addPasskey, takePasskeyOffer, passkeyDeclined, declinePasskey, syncPasskeys } from './lib/passkey.js';
import { FeedbackButton } from './Feedback.jsx';
import { LogoMark, Scenery } from './brand.jsx';

export const GLOW = {
  sweep: 'var(--app-glow)',
  customer: 'var(--app-glow)',
  admin: 'var(--app-glow)'
};
/** Illustration dezent hinter dem Kopfbereich, nach unten ausgeblendet */
const HeaderScenery = ({ o = 0.6, wide }) => (
  <div aria-hidden="true" style={sx(`position:absolute;left:0;right:0;bottom:0;height:${wide ? '100%' : '64%'};pointer-events:none;opacity:${o};-webkit-mask-image:linear-gradient(to bottom, transparent, #000 18%);mask-image:linear-gradient(to bottom, transparent, #000 18%)`)}><Scenery wide={wide} /></div>
);
/** Farbige Symbol-Blase: Glas mit Farbverlauf in der jeweiligen Farbe */
export const bubble = c => `background:radial-gradient(circle at 35% 25%, color-mix(in srgb, ${c} 75%, #fff), ${c} 55%, color-mix(in srgb, ${c} 70%, #000));color:#fff;box-shadow:inset 0 1px 0 rgba(255,255,255,0.5), 0 6px 16px color-mix(in srgb, ${c} 40%, transparent);text-shadow:0 1px 2px rgba(0,0,0,0.25)`;
/** Kachelfarben: eigener Akzent zuerst, dann Türkis, Violett, Gold */
const TILE_COLORS = ['var(--acc)', '#2fc9b0', '#a77bff', '#ffb23f'];
const BADGE = 'background:#e5484d;color:#fff;box-shadow:0 2px 8px rgba(229,72,77,0.4)';
export const DIV_BOTTOM = 'linear-gradient(to right, transparent, var(--color-divider) 32px, var(--color-divider) calc(100% - 32px), transparent) no-repeat bottom / 100% 1px';
export const DIV_TOP_48 = 'linear-gradient(to right, transparent, var(--color-divider) 48px, var(--color-divider) calc(100% - 48px), transparent) no-repeat top / 100% 1px';

const WideCtx = createContext(false);
export const useIsWide = () => useContext(WideCtx);

/**
 * Bildschirm-Hülle einer App. Auf dem Handy Vollbild mit Leiste unten (nav.tabs),
 * am Desktop (ab 1024 px, siehe useWide) Seitenleiste links, optional eine Liste (aside) und rechts der Inhalt.
 */
/** Hinweis oben in der Vorschau des Betreibers (Demo-Bezirk) */
export function DemoBadge({ lift = 0 }) {
  return (
    <div role="status" style={{ position: 'fixed', bottom: `calc(env(safe-area-inset-bottom) + ${96 + lift}px)`, left: '50%', transform: 'translateX(-50%)', zIndex: 60, pointerEvents: 'none',
      padding: '5px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, letterSpacing: '0.02em', color: '#2a120a', background: 'linear-gradient(180deg, #ffe08a, #ffc145)', boxShadow: '0 6px 18px rgba(24,8,4,0.4)', whiteSpace: 'nowrap' }}>
      Vorschau · Beispieldaten
    </div>
  );
}

export function Shell({ glow, top, bottom, overlay, children, scrollKey, nav, aside, asideKey, feedback = { role: 'public' }, scenery = true, backdrop, flush = false }) {
  const ref = useRef(null), asideRef = useRef(null);
  const isWide = useWide();
  const wide = isWide && !!nav;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = 0;
    // Seitenwechsel: Inhalt gleitet weich aus dem Glas
    if (el.animate && !matchMedia('(prefers-reduced-motion: reduce)').matches)
      // Nur Bewegung: Transparenz oder Unschärfe auf dem ganzen Bereich würde das Glas darin kurz abschalten (grau → blau)
      el.animate([{ transform: 'translateY(22px) scale(.98)' }, { transform: 'none' }],
        { duration: 520, easing: 'cubic-bezier(.3,1.3,.5,1)' });
  }, [scrollKey]);
  useEffect(() => { if (asideRef.current) asideRef.current.scrollTop = 0; }, [asideKey]);
  if (wide) return (
    <WideCtx.Provider value={true}>
      <div style={sx('height:100dvh;font-family:var(--font-body);color:var(--color-text);font-size:15px;line-height:1.45;background:var(--app-bg);position:relative;overflow:hidden;display:flex')}>
        <div style={sx(`position:absolute;inset:0;pointer-events:none;background:${glow}`)} />
        <HeaderScenery o={0.55} wide />
        <nav aria-label="Hauptnavigation" style={sx('flex:none;width:232px;display:flex;flex-direction:column;gap:4px;padding:24px 14px;position:relative;z-index:2;box-shadow:inset -1px 0 0 var(--color-divider);background:rgba(40,16,10,0.18);-webkit-backdrop-filter:blur(14px) saturate(120%);backdrop-filter:blur(14px) saturate(120%)')}>
          <div style={sx('display:flex;gap:10px;align-items:center;padding:0 10px 20px')}>
            <LogoMark size={40} title="Kaminfeger Verwaltung" />
            <div style={sx('min-width:0')}><div style={sx('font-size:15px;font-weight:500;line-height:1.2')}>{nav.title}</div>{nav.sub && <div style={sx('font-size:12px;color:var(--color-neutral-500);overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{nav.sub}</div>}</div>
          </div>
          <div style={sx('position:relative;display:flex;flex-direction:column;gap:4px')}>
          <LiquidPill index={(nav.side || nav.tabs).findIndex(t => t.on)} style={{ left: 0, right: 0, top: 0, height: 44, borderRadius: 14, transform: `translateY(${Math.max(0, (nav.side || nav.tabs).findIndex(t => t.on)) * 48}px)` }} />
          {(nav.side || nav.tabs).map(t => (
            <button key={t.label} onClick={t.onClick} aria-current={t.on ? 'page' : undefined} style={sx(`display:flex;align-items:center;gap:12px;min-height:44px;padding:0 12px;border-radius:14px;border:0;cursor:pointer;font:inherit;font-size:14px;text-align:left;background:none;position:relative;z-index:1;color:${t.on ? 'var(--color-text)' : 'var(--color-neutral-400)'}`)}>
              <Icon w={t.on ? 'ph-fill' : 'ph'} n={t.icon} style={sx(`font-size:20px;color:${t.on ? 'var(--color-accent)' : 'inherit'}`)} /><span style={sx('flex:1')}>{t.label}</span>
              {!!t.badge && <span style={sx(`min-width:20px;height:20px;padding:0 6px;border-radius:10px;${BADGE};font-size:11px;font-weight:600;display:grid;place-items:center`)}>{t.badge}</span>}
            </button>
          ))}
          </div>
          <div style={sx('flex:1')} />
          {feedback && <FeedbackButton variant="side" {...feedback} />}
          {nav.footer}
        </nav>
        {aside && <div ref={asideRef} style={sx('flex:none;width:400px;overflow-y:auto;position:relative;z-index:1;padding:14px 0 10px;box-shadow:inset -1px 0 0 var(--color-divider)')}>{aside}</div>}
        <div style={sx('flex:1;min-width:0;display:flex;flex-direction:column;position:relative;z-index:1')}>
          {top}
          <div ref={ref} style={sx('flex:1;overflow-y:auto;padding-top:14px')}><div style={sx('max-width:760px;margin:0 auto')}>{children}</div></div>
          {bottom && <div style={sx('width:100%;max-width:760px;margin:0 auto;padding-bottom:12px')}>{bottom}</div>}
        </div>
        {overlay}
      </div>
    </WideCtx.Provider>
  );
  // Schmale Ansichten (Anmeldung, Bewohner) stehen am Desktop als Karte mittig auf der Seite
  const card = isWide && !nav;
  return (
    <div style={sx(card ? 'min-height:100dvh;display:grid;place-items:center;padding:24px;background:var(--app-glow), var(--app-bg);font-family:var(--font-body);color:var(--color-text);font-size:15px;line-height:1.45'
      : 'width:100%;max-width:520px;margin:0 auto;height:100dvh;font-family:var(--font-body);color:var(--color-text);font-size:15px;line-height:1.45')}>
      <div style={sx(`position:relative;width:100%;${card ? 'max-width:460px;height:min(880px, calc(100dvh - 48px));border-radius:32px;box-shadow:var(--shadow-lg)' : 'height:100%'};overflow:hidden;background:var(--app-bg);display:flex;flex-direction:column`)}>
        <div style={sx(`position:absolute;inset:0;pointer-events:none;background:${glow}`)} />
        {scenery && <HeaderScenery />}
        {backdrop}
        {!EMBED && <div style={sx('height:max(10px, env(safe-area-inset-top));flex:none')} />}
        {top}
        <div style={sx('flex:1;min-height:0;position:relative;display:flex;flex-direction:column')}>
          <div ref={ref} style={sx('flex:1;overflow-y:auto;position:relative;z-index:1;scrollbar-width:none')}>{aside}{children}{feedback && <div aria-hidden="true" style={sx('height:52px')} />}</div>
          {feedback && <FeedbackButton {...feedback} />}
        </div>
        {bottom}
        {/* Leiste reicht bis zum unteren Rand (inkl. Home-Balken), damit die Glas-Pille nicht angeschnitten wirkt */}
        {nav && nav.bar !== false ? <TabBar tabs={nav.tabs} padBottom={EMBED ? '8px' : 'max(8px, env(safe-area-inset-bottom))'} />
          : !EMBED && !flush && <div style={sx('height:max(8px, env(safe-area-inset-bottom));flex:none')} />}
        {overlay}
      </div>
    </div>
  );
}

/** Platzhalter rechts am Desktop, solange links nichts ausgewählt ist. */
export function EmptyPane({ icon, text }) {
  return (
    <div style={sx('min-height:60vh;display:grid;place-items:center;padding:40px')}>
      <div style={sx('display:flex;flex-direction:column;align-items:center;gap:10px;color:var(--color-neutral-500);font-size:14px;text-align:center')}>
        <Icon n={icon} style={sx('font-size:36px;color:var(--color-neutral-600)')} />{text}
      </div>
    </div>
  );
}

/** Glas-Pille, die flüssig zum gewählten Eintrag gleitet (Reiter, Filter, Seitenleiste) */
function LiquidPill({ index, style }) {
  const ref = useRef(null), prev = useRef(index);
  useEffect(() => {
    const el = ref.current;
    if (!el || prev.current === index) return;
    prev.current = index;
    el.classList.remove('moving'); void el.offsetWidth; el.classList.add('moving');
  }, [index]);
  return <div ref={ref} aria-hidden="true" className="liquid-pill" onAnimationEnd={e => e.currentTarget.classList.remove('moving')} style={{ ...style, opacity: index < 0 ? 0 : 1 }} />;
}

export const Icon = ({ n, w = 'ph', style }) => <i className={`${w} ${n}`} style={style} aria-hidden="true" />;

export function StepsBar({ onBack, stepNo, total }) {
  return (
    <div style={sx('flex:none;display:flex;align-items:center;gap:8px;padding:4px 20px 0 12px;position:relative;z-index:2')}>
      <button className="btn btn-icon" onClick={onBack} style={sx('width:44px;height:44px')} aria-label="Zurück"><Icon n="ph-caret-left" style={sx('font-size:22px')} /></button>
      <div style={sx('flex:1;display:flex;gap:4px')}>
        {Array.from({ length: total }, (_, i) => <div key={i} style={sx(`flex:1;height:3px;border-radius:2px;background:${i < stepNo ? 'var(--color-accent)' : 'var(--color-neutral-800)'}`)} />)}
      </div>
      <span style={sx('font-size:12px;color:var(--color-neutral-500);font-variant-numeric:tabular-nums;min-width:28px;text-align:right')}>{stepNo}/{total}</span>
    </div>
  );
}

export function BackHeader({ onBack, title, sub, right }) {
  return (
    <div style={sx('display:flex;align-items:center;gap:6px;padding:4px 12px 0')}>
      <button className="btn btn-icon" onClick={onBack} style={sx('width:44px;height:44px')} aria-label="Zurück"><Icon n="ph-caret-left" style={sx('font-size:22px')} /></button>
      <div style={sx('flex:1;min-width:0')}><div style={sx('font-size:17px;font-weight:500')}>{title}</div>{sub && <div style={sx('font-size:12px;color:var(--color-neutral-500)')}>{sub}</div>}</div>
      {right}
    </div>
  );
}

export function Title({ title, sub, pad = '18px 22px 0' }) {
  return (
    <div style={sx(`padding:${pad}`)}>
      <div style={sx('font-size:26px;font-weight:500;letter-spacing:-0.02em;line-height:1.15;text-wrap:pretty')}>{title}</div>
      {sub && <div style={sx('font-size:14px;color:var(--color-neutral-400);margin-top:4px;text-wrap:pretty')}>{sub}</div>}
    </div>
  );
}

export const PageTitle = ({ title, sub, pad = '10px 22px 4px' }) => (
  <div style={sx(`padding:${pad}`)}>
    <div style={sx('font-size:23px;font-weight:500;letter-spacing:-0.015em')}>{title}</div>
    {sub && <div style={sx('font-size:12px;color:var(--color-neutral-500)')}>{sub}</div>}
  </div>
);

export const SectionLabel = ({ children, right, pad = '22px 22px 6px' }) => (
  <div style={sx(`padding:${pad};display:flex;justify-content:space-between;align-items:baseline`)}>
    <span style={sx('font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:var(--color-neutral-500)')}>{children}</span>
    {right}
  </div>
);

/** Hauptknopf unten (+ optionaler Zweitknopf) */
export function Cta({ label, onClick, disabled, busy, alt, error, glow }) {
  return (
    <div style={sx('flex:none;padding:10px 16px 2px;position:relative;z-index:2;display:flex;flex-direction:column;gap:2px')}>
      {error && <div style={sx('padding:0 4px 8px')}><ErrorLine text={error} /></div>}
      <button className="btn btn-primary" onClick={onClick} disabled={disabled || busy}
        style={sx(`width:100%;min-height:50px;font-size:15px${glow ? ';box-shadow:0 0 28px color-mix(in srgb, var(--color-accent) 22%, transparent)' : ''}`)}>{busy ? 'Bitte warten …' : label}</button>
      {alt && <button className="btn btn-ghost" onClick={alt.onClick} style={sx('min-height:44px;color:var(--color-neutral-400)')}>{alt.label}</button>}
    </div>
  );
}

export const ErrorLine = ({ text }) => text ? (
  <div role="alert" style={sx('display:flex;gap:8px;align-items:center;font-size:12px;color:var(--color-accent-300)')}><Icon n="ph-warning" style={sx('font-size:15px;flex:none')} /><span style={sx('text-wrap:pretty')}>{text}</span></div>
) : null;

export function Toast({ text, icon = 'ph-check-circle' }) {
  if (!text) return null;
  return (
    <div style={sx('margin:12px 16px 0;padding:12px 14px;border-radius:var(--radius-lg);box-shadow:0 0 0 1px var(--color-accent-700);display:flex;gap:10px;align-items:center;font-size:13px')}>
      <Icon n={icon} style={sx('font-size:18px;color:var(--color-accent)')} /><span style={sx('flex:1;text-wrap:pretty')}>{text}</span>
    </div>
  );
}

/** 6-stelliger Code mit unsichtbarem Eingabefeld darüber */
/** Nach erfolgreicher Prüfung aufrufen: spielt in der Code-Eingabe die Erfolgs-Animation und wartet, bis sie zu sehen war. */
export function codeSuccess() {
  window.dispatchEvent(new Event('kf-code-ok'));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  return new Promise(r => setTimeout(r, reduced ? 250 : 1350));
}

const SPARKS = Array.from({ length: 14 }, (_, i) => {
  const a = (i / 14) * Math.PI * 2 + (i % 2) * 0.2, d = 46 + (i % 3) * 16;
  return { x: Math.cos(a) * d, y: Math.sin(a) * d, s: 3 + (i % 3), delay: (i % 4) * 40 };
});

/**
 * 6-stellige Code-Eingabe. Sind alle Ziffern da, fliegen die Kästchen auf einen Ring und drehen sich
 * (bei busy schneller). Nach codeSuccess() werden sie grün, laufen in der Mitte zusammen und werden zum Haken.
 * Bei einem Fehler wackeln sie rot und gehen zurück in die Reihe. onComplete wird kurz nach der 6. Ziffer aufgerufen.
 */
export function CodeInput({ email, value, onChange, onResend, label = 'Bestätigungscode', busy = false, error = null, onComplete }) {
  const box = useRef(null);
  const [w, setW] = useState(320);
  const [phase, setPhase] = useState('row'); // row | ring | ok | done | bad
  const [badVal, setBadVal] = useState(null);
  const full = value.length === 6;
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth)); ro.observe(el); setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  // Reihe ↔ Ring je nach Eingabe
  useEffect(() => {
    if (phase === 'ok' || phase === 'done') return;
    setPhase(full && value !== badVal ? 'ring' : 'row');
    if (full && value !== badVal && onComplete && !busy) { const t = setTimeout(onComplete, 650); return () => clearTimeout(t); }
  }, [value, badVal]); // eslint-disable-line react-hooks/exhaustive-deps
  // Fehler: rot wackeln, dann zurück in die Reihe
  useEffect(() => {
    if (!error || !full || phase === 'ok') return;
    setPhase('bad');
    const t = setTimeout(() => { setBadVal(value); setPhase('row'); }, 520);
    return () => clearTimeout(t);
  }, [error]); // eslint-disable-line react-hooks/exhaustive-deps
  // Erfolg
  useEffect(() => {
    const on = () => { if (value.length !== 6) return; setPhase('ok'); setTimeout(() => setPhase('done'), 520); };
    window.addEventListener('kf-code-ok', on);
    return () => window.removeEventListener('kf-code-ok', on);
  }, [value]);

  const ring = phase !== 'row', ok = phase === 'ok' || phase === 'done', done = phase === 'done', bad = phase === 'bad';
  const H = ring ? 168 : 54, gap = 6, bw = (w - gap * 5) / 6, R = 60, S = 44;
  const color = ok ? 'var(--color-ok)' : bad ? '#ff6b6b' : null;
  const pos = i => {
    if (!ring) return { left: i * (bw + gap), top: 0, width: bw, height: 54, opacity: 1 };
    const a = -Math.PI / 2 + i * (Math.PI / 3), r = done ? 0 : R, s = done ? 8 : S;
    return { left: w / 2 + Math.cos(a) * r - s / 2, top: H / 2 + Math.sin(a) * r - s / 2, width: s, height: s, opacity: done ? 0 : 1 };
  };
  return (
    <div style={sx('display:flex;flex-direction:column;gap:10px')}>
      <div style={sx('font-size:13px;color:var(--color-neutral-400);display:flex;gap:8px;align-items:center;padding:0 6px')}><Icon n="ph-envelope-simple-open" style={sx('font-size:18px;color:var(--color-accent)')} /><span>Code an {email} gesendet</span></div>
      <div ref={box} className={bad ? 'kf-otp-shake' : ''} style={sx(`position:relative;height:${H}px;transition:height .55s var(--spring-soft)`)}>
        <div className={ring && !done ? (busy || ok ? 'kf-otp-spin fast' : 'kf-otp-spin') : ''} style={sx('position:absolute;inset:0')}>
          {ring && <div aria-hidden="true" style={sx(`position:absolute;left:${w / 2 - R}px;top:${H / 2 - R}px;width:${R * 2}px;height:${R * 2}px;border-radius:50%;border:1px dashed ${color || 'color-mix(in srgb, var(--acc) 45%, transparent)'};opacity:${done ? 0 : 0.8};transition:opacity .3s, border-color .3s`)} />}
          {[0, 1, 2, 3, 4, 5].map(i => {
            const p = pos(i);
            return (
              <div key={i} style={{ position: 'absolute', ...p, borderRadius: ring ? 14 : 'var(--radius-md)', display: 'grid', placeItems: 'center',
                fontSize: ring ? 18 : 22, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                border: `1px solid ${color || (!ring && i === value.length ? 'var(--color-accent)' : ring ? 'color-mix(in srgb, var(--acc) 60%, transparent)' : 'var(--color-neutral-700)')}`,
                background: ok ? 'color-mix(in srgb, var(--color-ok) 18%, transparent)' : bad ? 'rgba(255,107,107,0.14)' : 'var(--color-surface)',
                color: color || 'inherit', boxShadow: color ? `0 0 16px ${ok ? 'color-mix(in srgb, var(--color-ok) 45%, transparent)' : 'rgba(255,107,107,0.4)'}` : ring ? '0 0 14px color-mix(in srgb, var(--acc) 25%, transparent)' : 'none',
                transition: `left .6s var(--spring-soft) ${i * 35}ms, top .6s var(--spring-soft) ${i * 35}ms, width .5s var(--spring-soft), height .5s var(--spring-soft), opacity .3s ${done ? '.15s' : '0s'}, border-color .25s, background .25s, color .25s, box-shadow .25s, border-radius .4s, font-size .4s` }}>
                {done ? '' : value[i] || ''}
              </div>
            );
          })}
        </div>
        {ring && !done && <div aria-hidden="true" style={sx(`position:absolute;left:${w / 2 - 3}px;top:${H / 2 - 3}px;width:6px;height:6px;border-radius:50%;background:${color || 'var(--acc)'};box-shadow:0 0 10px ${color || 'var(--acc)'}`)} />}
        {done && <div aria-hidden="true" style={sx(`position:absolute;left:${w / 2}px;top:${H / 2}px`)}>
          {SPARKS.map((k, i) => <span key={i} className="kf-otp-spark" style={{ '--dx': k.x + 'px', '--dy': k.y + 'px', width: k.s, height: k.s, animationDelay: k.delay + 'ms' }} />)}
          <div className="kf-otp-check"><Icon w="ph-bold" n="ph-check" style={sx('font-size:30px')} /></div>
        </div>}
        <input value={value} onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" maxLength={6} autoComplete="one-time-code" aria-label={label} disabled={ok}
          style={sx('position:absolute;inset:0;opacity:0;font-size:16px;cursor:text;width:100%')} autoFocus />
      </div>
      <div aria-live="polite" style={sx(`min-height:18px;text-align:center;font-size:13px;font-weight:500;color:${ok ? 'var(--color-ok)' : 'var(--color-neutral-400)'};opacity:${ring ? 1 : 0};transition:opacity .3s`)}>
        {ok ? 'Bestätigt' : bad ? '' : busy ? 'Wird geprüft …' : ring ? 'Code vollständig' : ''}
      </div>
      {onResend && !ok && <button className="btn btn-ghost" onClick={onResend} style={sx('align-self:flex-start;min-height:40px;padding-inline:6px')}>Code erneut senden</button>}
    </div>
  );
}

/**
 * Messenger: Sprechblasen einer Unterhaltung. items: { key, mine, text, at, label? }.
 * Eigene Nachrichten rechts in der App-Farbe, fremde links im Glas. Springt bei neuen Nachrichten nach unten.
 */
export function ChatThread({ items, ini = 'KF', empty }) {
  const end = useRef(null);
  const last = items.length ? items[items.length - 1].key : null;
  useEffect(() => { end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [last]);
  if (!items.length) return <div style={sx('padding:28px 22px;font-size:14px;color:var(--color-neutral-400);text-align:center;text-wrap:pretty')}>{empty}</div>;
  let prevDay = null;
  return (
    <div role="log" aria-live="polite" style={sx('display:flex;flex-direction:column;gap:6px;padding:12px 14px 16px')}>
      {items.map((m, i) => {
        const day = fmtDay(m.at), showDay = day !== prevDay; prevDay = day;
        const next = items[i + 1], tail = !next || next.mine !== m.mine || fmtDay(next.at) !== day;
        return (
          <div key={m.key} style={sx('display:flex;flex-direction:column')}>
            {showDay && <div style={sx('align-self:center;margin:10px 0 6px;padding:3px 10px;border-radius:999px;font-size:11px;color:var(--color-neutral-300);background:rgba(255,255,255,0.07)')}>{day}</div>}
            <div style={sx(`display:flex;gap:8px;align-items:flex-end;${m.mine ? 'justify-content:flex-end' : ''}`)}>
              {!m.mine && <div style={sx(`width:28px;flex:none;${tail ? '' : 'visibility:hidden'}`)}><Avatar ini={ini} size={28} fs={11} accent /></div>}
              <div className="kf-bubble" style={sx(`max-width:78%;padding:9px 12px 7px;font-size:15px;line-height:1.4;white-space:pre-wrap;overflow-wrap:anywhere;text-shadow:none;${m.mine
                ? `color:#fff;background:linear-gradient(180deg, color-mix(in srgb, var(--acc) 82%, #fff 4%), var(--color-accent-700));border-radius:18px 18px ${tail ? '6px' : '18px'} 18px;box-shadow:0 4px 14px color-mix(in srgb, var(--acc) 28%, transparent)`
                : `background:var(--color-surface);border-radius:18px 18px 18px ${tail ? '6px' : '18px'};box-shadow:var(--shadow-sm)`}`)}>
                {m.label && <div style={sx('font-size:11px;font-weight:600;color:var(--color-accent-300);margin-bottom:2px;display:flex;gap:4px;align-items:center')}><Icon n="ph-megaphone-simple" />{m.label}</div>}
                {m.text}
                <div style={sx(`font-size:10.5px;margin-top:2px;text-align:right;${m.mine ? 'color:rgba(255,255,255,0.75)' : 'color:var(--color-neutral-500)'}`)}>
                  {fmtTime(m.at)}{m.mine && m.read != null && <Icon w="ph-bold" n={m.read ? 'ph-checks' : 'ph-check'} style={sx('margin-left:4px;font-size:12px')} />}
                </div>
              </div>
            </div>
          </div>
        );
      })}
      {/* Platz für den Feedback-Knopf unten rechts, damit die letzte Nachricht frei bleibt */}
      <div ref={end} style={sx('height:44px;flex:none')} />
    </div>
  );
}
const toDate = ts => new Date(/Z|[+-]\d\d:?\d\d$/.test(ts) ? ts : ts.replace(' ', 'T') + 'Z');
const fmtTime = ts => toDate(ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
function fmtDay(ts) {
  const d = toDate(ts), t = new Date(), y = new Date(); y.setDate(t.getDate() - 1);
  if (d.toDateString() === t.toDateString()) return 'Heute';
  if (d.toDateString() === y.toDateString()) return 'Gestern';
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long' });
}

/** Eingabezeile unten im Messenger: wächst mit, Enter sendet (Umschalt+Enter = neue Zeile) */
export function ChatComposer({ onSend, busy, error, placeholder = 'Nachricht schreiben …' }) {
  const [text, setText] = useState('');
  const ref = useRef(null);
  useEffect(() => { const el = ref.current; if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 140) + 'px'; } }, [text]);
  const send = async () => {
    const t = text.trim(); if (!t || busy) return;
    if (await onSend(t) !== false) setText('');
  };
  return (
    <div style={sx('flex:none;padding:8px 12px 8px;position:relative;z-index:2;display:flex;flex-direction:column;gap:6px')}>
      {error && <div style={sx('padding:0 6px')}><ErrorLine text={error} /></div>}
      <div className="glass" style={sx('display:flex;align-items:flex-end;gap:8px;padding:6px 6px 6px 14px;border-radius:24px')}>
        <textarea ref={ref} value={text} rows={1} maxLength={1000} onChange={e => setText(e.target.value)} placeholder={placeholder} aria-label="Nachricht"
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
          style={sx('flex:1;min-height:24px;max-height:140px;resize:none;border:0;outline:0;background:none;color:var(--color-text);font:inherit;font-size:16px;line-height:1.4;padding:8px 0;scrollbar-width:none')} />
        <button className="btn btn-primary btn-icon" onClick={send} disabled={!text.trim() || busy} aria-label="Senden" style={sx('width:40px;height:40px;border-radius:50%;flex:none;padding:0')}>
          <Icon w="ph-fill" n="ph-paper-plane-right" style={sx('font-size:18px')} />
        </button>
      </div>
    </div>
  );
}

export const tog = on => ({ bd: on ? 'var(--color-accent)' : 'var(--color-neutral-700)', bg: on ? 'var(--color-accent-800)' : 'transparent', x: on ? '23px' : '4px', knob: on ? 'var(--color-accent-300)' : 'var(--color-neutral-500)' });
export function Toggle({ on, onClick, label }) {
  const t = tog(on);
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={onClick} style={sx(`width:46px;height:28px;border-radius:14px;border:1px solid ${t.bd};background:${t.bg};position:relative;cursor:pointer;flex:none;padding:0`)}>
      <span style={sx(`position:absolute;top:4px;left:${t.x};width:18px;height:18px;border-radius:50%;background:${t.knob};transition:left .15s`)} />
    </button>
  );
}

export function CheckRow({ on, label, onClick, disabled, strike, minH = '50px' }) {
  return (
    <button onClick={onClick} disabled={disabled} style={sx(`width:100%;display:flex;gap:12px;align-items:center;min-height:${minH};background:none;border:0;color:inherit;font:inherit;text-align:left;cursor:pointer`)}>
      <span style={sx(`width:20px;height:20px;border-radius:6px;border:1.5px solid ${on ? 'var(--color-accent)' : 'var(--color-neutral-600)'};background:${on ? 'var(--color-accent)' : 'transparent'};display:grid;place-items:center;color:${on ? 'var(--color-bg)' : 'transparent'};font-size:12px;flex:none`)}><Icon w="ph-bold" n="ph-check" /></span>
      <span style={sx(`flex:1;font-size:14px;text-wrap:pretty;color:${strike && on ? 'var(--color-neutral-500)' : 'var(--color-text)'};text-decoration:${strike && on ? 'line-through' : 'none'}`)}>{label}</span>
    </button>
  );
}

/** Bottom-Sheet über dem Bildschirm */
export function Sheet({ children, scroll }) {
  const wide = useIsWide();
  return (
    <div className="kf-backdrop" style={sx(`position:absolute;inset:0;z-index:5;background:rgba(30,10,4,0.3);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);display:flex;flex-direction:column;${wide ? 'justify-content:center;align-items:center' : 'justify-content:flex-end'}`)}>
      <div role="dialog" aria-modal="true" className={`kf-sheet${wide ? ' center' : ''}`} style={sx(`${wide ? 'width:460px;max-height:86vh;' : ''}margin:0 8px 8px;padding:22px 18px 16px;border-radius:32px;background:linear-gradient(180deg, rgba(160,98,78,0.46), rgba(72,40,32,0.58));-webkit-backdrop-filter:blur(16px) saturate(190%);backdrop-filter:blur(16px) saturate(190%);box-shadow:var(--shadow-lg);display:flex;flex-direction:column;gap:10px${scroll ? ';max-height:78%;overflow-y:auto;scrollbar-width:none' : ''}`)}>{children}</div>
    </div>
  );
}

export function TabBar({ tabs, padX = tabs.length > 4 ? '10px' : '24px', padBottom = '8px' }) {
  const idx = tabs.findIndex(t => t.on);
  return (
    <div style={sx(`flex:none;padding:8px ${padX} ${padBottom};position:relative;z-index:2;background:rgba(40,16,10,0.16);-webkit-backdrop-filter:var(--glass-blur);backdrop-filter:var(--glass-blur);box-shadow:inset 0 1px 0 rgba(255,255,255,0.18)`)}>
     <div style={sx(`position:relative;display:grid;grid-template-columns:repeat(${tabs.length}, 1fr)`)}>
      <LiquidPill index={idx} style={{ top: 0, bottom: 0, left: 0, width: `calc(100% / ${tabs.length} - 12px)`, borderRadius: 20, transform: `translateX(calc(${Math.max(0, idx)} * (100% + 12px) + 6px))` }} />
      {tabs.map(t => (
        <button key={t.label} onClick={t.onClick} style={sx(`display:flex;flex-direction:column;align-items:center;gap:3px;min-height:52px;justify-content:center;background:none;border:0;cursor:pointer;font:inherit;font-size:11px;color:${t.on ? 'var(--color-accent-200)' : 'var(--color-neutral-400)'};position:relative;z-index:1`)}>
          <Icon w={t.on ? 'ph-fill' : 'ph'} n={t.icon} style={sx(`font-size:24px${t.on ? ';color:var(--acc)' : ''}`)} />{t.label}
          {!!t.badge && <span style={sx('position:absolute;top:-2px;left:calc(50% + 6px);min-width:17px;height:17px;padding:0 5px;border-radius:9px;font-size:10px;font-weight:600;display:grid;place-items:center;' + BADGE)}>{t.badge}</span>}
        </button>
      ))}
     </div>
    </div>
  );
}

export function Seg({ options, value, onChange, minH = '40px', stacked }) {
  const name = useId();
  return (
    <div className="seg" style={sx('display:flex')}>
      <LiquidPill index={options.findIndex(o => o.value === value)} style={{ top: 3, bottom: 3, left: 3, width: `calc((100% - 6px - ${options.length - 1} * 3px) / ${options.length})`, transform: `translateX(calc(${Math.max(0, options.findIndex(o => o.value === value))} * (100% + 3px)))` }} />
      {options.map(o => (
        <label key={o.value} className="seg-opt" style={sx(stacked ? `flex:1;justify-content:center;min-height:${minH};flex-direction:column;gap:0;padding:6px 4px;line-height:1.2` : `flex:1;justify-content:center;min-height:${minH}`)}>
          <input type="radio" name={name} checked={value === o.value} onChange={() => onChange(o.value)} /><span>{o.label}</span>
          {o.sub && <span style={sx('font-size:11px;opacity:.7')}>{o.sub}</span>}
        </label>
      ))}
    </div>
  );
}

export const Field = ({ label, children, style }) => <div className="field" style={style}><label>{label}</label>{children}</div>;
export const Input = ({ style = '', ...p }) => <input className="input" {...p} style={sx('min-height:46px;font-size:15px;' + style)} />;

export const Avatar = ({ ini, size = 40, fs = 14, accent }) => (
  <div style={sx(`width:${size}px;height:${size}px;border-radius:50%;background:${accent ? 'var(--color-accent-900)' : 'var(--color-neutral-800)'};${accent ? 'color:var(--color-accent-300);box-shadow:0 0 0 1px var(--color-accent-800);' : ''}display:grid;place-items:center;font-size:${fs}px;font-weight:500;flex:none`)}>{ini}</div>
);

/** Vorschau einer E-Mail im App-Stil */
/** Vorschau einer E-Mail – nur zur Ansicht, nicht klickbar (deutlich als „Vorschau“ markiert) */
export function MailPreview({ meta, subject, text, action, onClick }) {
  return (
    <div onClick={onClick} aria-label="Vorschau der E-Mail" style={sx(`margin:20px 16px 0;border-radius:var(--radius-lg);background:var(--color-surface);box-shadow:var(--shadow-sm);overflow:hidden;opacity:.85${onClick ? ';cursor:pointer' : ''}`)}>
      <div style={sx(`padding:12px 14px;display:flex;flex-direction:column;gap:2px;background:${DIV_BOTTOM}`)}>
        <div style={sx('display:flex;gap:8px;align-items:center;font-size:12px;color:var(--color-neutral-500)')}><Icon n="ph-envelope-simple" /><span style={sx('flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis')}>{meta}</span><span className="tag tag-neutral" style={sx('font-size:10px;letter-spacing:0.06em;text-transform:uppercase')}>Vorschau</span></div>
        <div style={sx('font-size:14px;font-weight:500')}>{subject}</div>
      </div>
      <div style={sx('padding:12px 14px 14px;display:flex;flex-direction:column;gap:12px;font-size:13px;color:var(--color-neutral-300)')}>
        <span style={sx('text-wrap:pretty')}>{text}</span>
        {action && <span aria-hidden="true" style={sx('align-self:flex-start;padding:7px 13px;border-radius:var(--radius-md);border:1px dashed var(--color-neutral-600);color:var(--color-neutral-400);font-size:13px')}>{action}</span>}
      </div>
    </div>
  );
}

export function Hero({ icon, title, sub, muted, pad = '52px 24px 0', children }) {
  const ring = muted ? 'var(--color-neutral-400)' : 'var(--color-accent)';
  return (
    <div style={sx(`padding:${pad};display:flex;flex-direction:column;align-items:flex-start;gap:6px`)}>
      <div style={sx(`width:64px;height:64px;border-radius:50%;display:grid;place-items:center;border:1px solid ${ring};color:${ring};box-shadow:${muted ? 'none' : '0 0 40px color-mix(in srgb, var(--color-accent) 30%, transparent)'};margin-bottom:18px`)}><Icon w="ph-bold" n={icon} style={sx('font-size:28px')} /></div>
      <div style={sx('font-size:28px;font-weight:500;letter-spacing:-0.02em;line-height:1.15')}>{title}</div>
      {sub && <div style={sx('font-size:15px;color:var(--color-neutral-400);text-wrap:pretty')}>{sub}</div>}
      {children}
    </div>
  );
}

export function Loading() {
  return <div style={sx('min-height:100dvh;display:grid;place-items:center;color:var(--color-neutral-500);font-size:13px;background:var(--app-bg)')}>Lädt …</div>;
}

/** Datei-Auswahl hinter einem beliebigen Knopf */
export function FilePick({ accept, onFile, children, style, className, disabled }) {
  const ref = useRef(null);
  return (
    <>
      <input ref={ref} type="file" accept={accept} hidden onChange={e => { const f = e.target.files[0]; e.target.value = ''; if (f) onFile(f); }} />
      <button className={className} disabled={disabled} onClick={() => ref.current.click()} style={style}>{children}</button>
    </>
  );
}

/** Bestätigung „Konto löschen“ – der Nutzer tippt LÖSCHEN ein */
export function DeleteSheet({ text, onDelete, onClose, busy, error }) {
  const [v, setV] = useState('');
  return (
    <Sheet>
      <div style={sx('font-size:20px;font-weight:500')}>Konto löschen?</div>
      <div style={sx('font-size:14px;color:var(--color-neutral-300);text-wrap:pretty')}>{text}</div>
      <Field label="Zur Bestätigung LÖSCHEN eingeben"><Input value={v} onChange={e => setV(e.target.value)} placeholder="LÖSCHEN" autoComplete="off" style="text-transform:uppercase" /></Field>
      {error && <ErrorLine text={error} />}
      <button className="btn btn-primary" disabled={v.trim().toUpperCase() !== 'LÖSCHEN' || busy} onClick={() => onDelete(v.trim().toUpperCase())} style={sx('min-height:48px;margin-top:4px')}><Icon n="ph-trash" />Endgültig löschen</button>
      <button className="btn btn-ghost" onClick={onClose} style={sx('min-height:44px;color:var(--color-neutral-400)')}>Abbrechen</button>
    </Sheet>
  );
}

export const LegalLinks = () => (
  <div style={sx('display:flex;gap:18px;padding:0 22px 20px;font-size:12px')}><a href="/impressum" style={sx('color:var(--color-neutral-500)')}>Impressum</a><a href="/datenschutz" style={sx('color:var(--color-neutral-500)')}>Datenschutz</a></div>
);

const MONTHS_LONG = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
/**
 * Monatskalender als Dialog. min/max als ISO-Datum, disabled(iso) sperrt einzelne Tage (z. B. Sonntage, schon belegte).
 */
export function DatePicker({ value, min, max, disabled = () => false, onPick, onClose, title = 'Datum wählen' }) {
  const start = parseDate(value || min);
  const [ym, setYm] = useState({ y: start.getFullYear(), m: start.getMonth() });
  const first = new Date(ym.y, ym.m, 1), lead = (first.getDay() + 6) % 7, count = new Date(ym.y, ym.m + 1, 0).getDate();
  const cells = Array.from({ length: lead }, () => null).concat(Array.from({ length: count }, (_, i) => isoDate(new Date(ym.y, ym.m, i + 1))));
  const shift = n => setYm(({ y, m }) => { const d = new Date(y, m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const monthKey = (y, m) => y * 12 + m;
  const canPrev = !min || monthKey(ym.y, ym.m) > monthKey(parseDate(min).getFullYear(), parseDate(min).getMonth());
  const canNext = !max || monthKey(ym.y, ym.m) < monthKey(parseDate(max).getFullYear(), parseDate(max).getMonth());
  const today = isoDate(new Date());
  return (
    <Sheet>
      <div style={sx('display:flex;align-items:center;gap:8px')}>
        <div style={sx('flex:1;font-size:18px;font-weight:500')}>{title}</div>
        <button className="btn btn-icon" onClick={onClose} aria-label="Schließen" style={sx('width:40px;height:40px')}><Icon n="ph-x" style={sx('font-size:18px')} /></button>
      </div>
      <div style={sx('display:flex;align-items:center;gap:6px')}>
        <button className="btn btn-secondary btn-icon" disabled={!canPrev} onClick={() => shift(-1)} aria-label="Vorheriger Monat" style={sx('width:40px;height:40px')}><Icon n="ph-caret-left" /></button>
        <div style={sx('flex:1;text-align:center;font-size:15px;font-weight:500')} aria-live="polite">{MONTHS_LONG[ym.m]} {ym.y}</div>
        <button className="btn btn-secondary btn-icon" disabled={!canNext} onClick={() => shift(1)} aria-label="Nächster Monat" style={sx('width:40px;height:40px')}><Icon n="ph-caret-right" /></button>
      </div>
      <div role="grid" style={sx('display:grid;grid-template-columns:repeat(7, minmax(0, 1fr));gap:4px')}>
        {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(d => <div key={d} style={sx('text-align:center;font-size:11px;color:var(--color-neutral-500);padding:4px 0')}>{d}</div>)}
        {cells.map((iso, i) => {
          if (!iso) return <div key={'e' + i} />;
          const off = (min && iso < min) || (max && iso > max) || disabled(iso), on = iso === value;
          return (
            <button key={iso} disabled={off} onClick={() => onPick(iso)} aria-label={dayLabel(iso)} aria-pressed={on}
              style={sx(`min-height:42px;border-radius:var(--radius-md);font:inherit;font-size:15px;font-variant-numeric:tabular-nums;cursor:${off ? 'default' : 'pointer'};border:1px solid ${on ? 'var(--color-accent)' : iso === today ? 'var(--color-neutral-700)' : 'transparent'};background:${on ? 'var(--color-accent-900)' : 'transparent'};color:${on ? 'var(--color-accent-200)' : off ? 'var(--color-neutral-700)' : 'var(--color-text)'}`)}>
              {parseDate(iso).getDate()}
            </button>
          );
        })}
      </div>
      <button className="btn btn-ghost" onClick={onClose} style={sx('min-height:44px;color:var(--color-neutral-400)')}>Abbrechen</button>
    </Sheet>
  );
}

// ---------- Startseiten-Bausteine (nach der Vorlage: Kopf, Begrüßung, Nächster Termin, Kacheln, Info, Listenkarten) ----------

/** Kopf: Logo mit Schriftzug links, Glocke (mit Zahl) und Profil rechts */
export function AppHeader({ bell, onBell, onProfile, ini }) {
  const wide = useIsWide();
  const round = 'width:44px;height:44px;border-radius:50%;display:grid;place-items:center;position:relative;cursor:pointer;color:var(--color-text);font:inherit';
  return (
    <div style={sx('display:flex;align-items:center;gap:10px;padding:6px 18px 0 20px')}>
      <div style={sx('flex:1;min-width:0;display:flex;align-items:center;gap:10px')}>
        {!wide && <><LogoMark size={38} />
        <div style={sx('font-size:15px;font-weight:600;line-height:1.1')}>Kaminfeger<br />Verwaltung</div></>}
      </div>
      {onBell && <button className="glass" onClick={onBell} aria-label={bell ? `Benachrichtigungen, ${bell} neu` : 'Benachrichtigungen'} style={sx(`${round};border:0`)}>
        <Icon n="ph-bell" style={sx('font-size:21px')} />
        {!!bell && <span style={sx(`position:absolute;top:-3px;right:-3px;min-width:19px;height:19px;padding:0 5px;border-radius:10px;font-size:11px;font-weight:600;display:grid;place-items:center;${BADGE}`)}>{bell}</span>}
      </button>}
      {onProfile && <button className="glass" onClick={onProfile} aria-label="Profil und Konto" style={sx(`${round};border:0;font-size:13px;font-weight:600`)}>
        {ini || <Icon n="ph-user" w="ph-fill" style={sx('font-size:20px')} />}
      </button>}
    </div>
  );
}

export function Greeting({ hi, sub }) {
  return (
    <div style={sx('padding:22px 22px 0')}>
      <div style={sx('font-size:26px;font-weight:700;letter-spacing:-0.02em;line-height:1.15')}>{hi}</div>
      {sub && <div style={sx('font-size:15px;color:var(--color-neutral-300);margin-top:2px')}>{sub}</div>}
    </div>
  );
}

/** Karte „Nächster Termin“: Kalender-Symbol, Datum, Zeile(n), grüner Status, Pfeil */
export function NextCard({ icon = 'ph-calendar-dots', kicker, title, lines = [], tag, tagCls = 'tag-accent', onClick }) {
  return (
    <button className="glass" onClick={onClick} style={sx('margin:18px 16px 0;width:calc(100% - 32px);text-align:left;display:flex;gap:14px;align-items:flex-start;padding:18px 16px;border-radius:22px;border:0;color:inherit;font:inherit;cursor:pointer')}>
      <div style={sx('width:44px;height:44px;border-radius:14px;display:grid;place-items:center;flex:none;' + bubble('var(--acc)'))}><Icon w="ph-fill" n={icon} style={sx('font-size:24px')} /></div>
      <div style={sx('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
        {kicker && <div style={sx('font-size:13px;color:var(--color-neutral-300)')}>{kicker}</div>}
        <div style={sx('font-size:18px;font-weight:600;letter-spacing:-0.01em')}>{title}</div>
        {lines.map((l, i) => <div key={i} style={sx(`font-size:14px;color:${i ? 'var(--color-neutral-300)' : 'var(--color-neutral-100)'};${i === 0 ? 'margin-top:8px' : ''}`)}>{l}</div>)}
      </div>
      <div style={sx('display:flex;flex-direction:column;align-items:flex-end;justify-content:space-between;align-self:stretch;gap:8px')}>
        <Icon n="ph-caret-right" style={sx('font-size:18px;color:var(--color-neutral-300)')} />
        {tag && <span className={`tag ${tagCls}`}>{tag}</span>}
      </div>
    </button>
  );
}

/** 2×2-Kacheln mit Symbol, Beschriftung und roter Zahl */
export function Tiles({ items }) {
  return (
    <div style={sx('display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:12px 16px 0')}>
      {items.map((t, i) => (
        <button key={t.label} className="glass" onClick={t.onClick} style={sx('position:relative;text-align:left;display:flex;flex-direction:column;gap:14px;padding:18px 16px 16px;min-height:104px;border-radius:22px;border:0;color:inherit;font:inherit;cursor:pointer')}>
          <div style={sx('width:40px;height:40px;border-radius:50%;display:grid;place-items:center;' + bubble(t.color || TILE_COLORS[i % TILE_COLORS.length]))}><Icon w="ph-fill" n={t.icon} style={sx('font-size:22px')} /></div>
          <div style={sx('font-size:16px;font-weight:500')}>{t.label}</div>
          {!!t.badge && <span style={sx(`position:absolute;top:10px;right:10px;min-width:22px;height:22px;padding:0 6px;border-radius:11px;font-size:12px;font-weight:600;display:grid;place-items:center;${BADGE}`)}>{t.badge}</span>}
        </button>
      ))}
    </div>
  );
}

/** Info-Karte mit Flamme („Sicher. Sauber. Zukunft.“) */
export function InfoCard({ title, sub, onClick }) {
  return (
    <button className="glass" onClick={onClick} disabled={!onClick} style={sx(`margin:12px 16px 0;width:calc(100% - 32px);text-align:left;display:flex;gap:14px;align-items:center;padding:16px;border-radius:22px;border:0;color:inherit;font:inherit;cursor:${onClick ? 'pointer' : 'default'}`)}>
      <div style={sx('width:46px;height:46px;border-radius:50%;display:grid;place-items:center;flex:none;background:radial-gradient(circle at 50% 60%, rgba(255,170,80,0.45), rgba(255,170,80,0.08) 70%);box-shadow:inset 0 1px 0 rgba(255,255,255,0.25)')}><Icon w="ph-fill" n="ph-flame" style={sx('font-size:26px;color:#f7a54a')} /></div>
      <div style={sx('flex:1;min-width:0')}><div style={sx('font-size:16px;font-weight:600')}>{title}</div>{sub && <div style={sx('font-size:13px;color:var(--color-neutral-300);text-wrap:pretty')}>{sub}</div>}</div>
      {onClick && <Icon n="ph-caret-right" style={sx('font-size:18px;color:var(--color-neutral-300)')} />}
    </button>
  );
}

/** Listenkarte wie „Kunden“: Haus-Symbol im Kreis, Name, Adresse, Status, Pfeil */
export function ListCard({ icon = 'ph-house', title, lines = [], tag, tagCls = 'tag-accent', onClick }) {
  return (
    <button className="glass" onClick={onClick} style={sx('width:100%;text-align:left;display:flex;gap:14px;align-items:center;padding:14px 14px 14px 16px;border-radius:22px;border:0;color:inherit;font:inherit;cursor:pointer')}>
      <div style={sx('width:48px;height:48px;border-radius:50%;display:grid;place-items:center;flex:none;background:color-mix(in srgb, var(--acc) 22%, transparent);color:var(--color-accent-200);box-shadow:inset 0 1px 0 rgba(255,255,255,0.3), inset 0 0 0 1px color-mix(in srgb, var(--acc) 30%, transparent)')}><Icon n={icon} style={sx('font-size:24px')} /></div>
      <div style={sx('flex:1;min-width:0')}>
        <div style={sx('font-size:15px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{title}</div>
        {lines.map((l, i) => <div key={i} style={sx('font-size:13px;color:var(--color-neutral-300);overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{l}</div>)}
      </div>
      {tag && <span className={`tag ${tagCls}`} style={sx('flex:none')}>{tag}</span>}
      <Icon n="ph-caret-right" style={sx('font-size:18px;color:var(--color-neutral-300);flex:none')} />
    </button>
  );
}

/** Suchfeld als Glas-Pille */
export function SearchField({ value, onChange, placeholder }) {
  return (
    <label className="glass" style={sx('display:flex;align-items:center;gap:10px;margin:0 16px;padding:0 16px;min-height:48px;border-radius:999px;cursor:text')}>
      <Icon n="ph-magnifying-glass" style={sx('font-size:19px;color:var(--color-neutral-300)')} />
      <input type="search" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder}
        style={sx('flex:1;min-width:0;background:none;border:0;outline:none;color:var(--color-text);font:inherit;font-size:15px')} />
    </label>
  );
}

/** Kopf für Unterseiten wie „Kunden“ / „Leistungen“: Zurück-Pfeil und Titel */
export function PageHead({ title, onBack, right }) {
  return (
    <div style={sx('display:flex;align-items:center;gap:6px;padding:6px 16px 0 10px;min-height:52px')}>
      {onBack && <button className="btn btn-icon" onClick={onBack} aria-label="Zurück" style={sx('width:44px;height:44px')}><Icon n="ph-arrow-left" style={sx('font-size:22px')} /></button>}
      <div style={sx(`flex:1;font-size:19px;font-weight:600;${onBack ? '' : 'padding-left:12px'}`)}>{title}</div>
      {right}
    </div>
  );
}

/** Zurück zur Startseite (Willkommens- und Entsperrseiten). In der eingebetteten Testseite ausgeblendet. */
export function HomeBack({ onBack }) {
  if (EMBED) return null;
  return (
    <div style={sx('flex:none;display:flex;align-items:center;padding:4px 12px 0;position:relative;z-index:2')}>
      <button className="btn btn-icon" onClick={onBack || (() => { location.href = '/'; })} aria-label="Zurück zur Startseite" style={sx('width:44px;height:44px')}><Icon n="ph-arrow-left" style={sx('font-size:22px')} /></button>
    </div>
  );
}

/** Passkeys verwalten: Liste, neu einrichten, entfernen (Profil / Konto / Betreiber) */
export function PasskeyPanel({ role, intro, onChange }) {
  const list = useData(`/api/passkey/list?role=${role}`);
  const act = useAction();
  const [msg, setMsg] = useState(null);
  const supported = passkeySupported();
  const add = () => act.run(async () => { setMsg(null); await addPasskey(role); await list.reload(); setMsg('Passkey eingerichtet. Ab jetzt können Sie sich damit anmelden.'); onChange && onChange(); });
  const [confirm, setConfirm] = useState(null);
  const remove = id => act.run(async () => {
    setMsg(null); setConfirm(null);
    await api('/api/passkey/delete', { body: { role, id } });
    syncPasskeys(await api(`/api/passkey/list?role=${role}`));
    await list.reload();
    setMsg('Passkey entfernt.');
  });
  const items = list.data?.passkeys || [];
  return (
    <div style={sx('display:flex;flex-direction:column;gap:8px')}>
      {intro && <div style={sx('font-size:13px;color:var(--color-neutral-300);text-wrap:pretty')}>{intro}</div>}
      {items.map(p => (
        <div key={p.id} className="glass" style={sx('display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:16px')}>
          <Icon n="ph-fingerprint" style={sx('font-size:22px;color:var(--color-accent-300)')} />
          <div style={sx('flex:1;min-width:0')}><div style={sx('font-size:14px')}>{p.name}</div><div style={sx('font-size:11px;color:var(--color-neutral-400)')}>eingerichtet {new Date(p.created).toLocaleDateString('de-DE')}{p.lastUsed ? ' · zuletzt genutzt ' + new Date(p.lastUsed).toLocaleDateString('de-DE') : ''}</div></div>
          <button className="btn btn-ghost btn-icon" disabled={act.busy} onClick={() => setConfirm(p.id)} aria-label={`Passkey ${p.name} entfernen`} style={sx('width:40px;height:40px;color:var(--color-neutral-400)')}><Icon n="ph-trash" /></button>
        </div>
      ))}
      {confirm && <div className="glass" role="alertdialog" style={sx('padding:12px 14px;border-radius:16px;display:flex;flex-direction:column;gap:8px;box-shadow:0 0 0 1px rgba(245,163,165,0.5)')}>
        <div style={sx('font-size:14px;font-weight:600')}>Passkey wirklich entfernen?</div>
        <div style={sx('font-size:13px;color:var(--color-neutral-300);text-wrap:pretty')}>Mit diesem Passkey können Sie sich danach nicht mehr anmelden. {role === 'admin' ? 'Entfernen Sie nie den Passkey des Geräts, das Sie gerade benutzen, wenn Sie keinen zweiten haben – der Betreiber-Zugang ist nur per Passkey möglich.' : 'Die Anmeldung per Code per E-Mail bleibt möglich.'}</div>
        <div style={sx('display:grid;grid-template-columns:1fr 1fr;gap:8px')}>
          <button className="btn btn-secondary" onClick={() => setConfirm(null)} style={sx('min-height:42px')}>Behalten</button>
          <button className="btn btn-secondary" disabled={act.busy} onClick={() => remove(confirm)} style={sx('min-height:42px;color:#f5a3a5')}><Icon n="ph-trash" />Entfernen</button>
        </div>
      </div>}
      {supported
        ? <button className="btn btn-secondary" disabled={act.busy} onClick={add} style={sx('min-height:46px')}><Icon n="ph-fingerprint" />{act.busy ? 'Bitte am Gerät bestätigen …' : items.length ? 'Weiteren Passkey einrichten' : 'Passkey einrichten'}</button>
        : <div style={sx('font-size:12px;color:var(--color-neutral-400)')}>Dieser Browser unterstützt keine Passkeys.</div>}
      {msg && <div style={sx('font-size:13px;color:var(--color-ok);display:flex;gap:6px;align-items:center')}><Icon n="ph-check-circle" />{msg}</div>}
      {act.error && <ErrorLine text={act.error} />}
    </div>
  );
}

/** „Mit Passkey anmelden“ + Trenner zum E-Mail-Weg */
export function PasskeyLogin({ onPasskey, busy, label = 'Mit Passkey anmelden', hint = 'Noch keinen Passkey? Einmal mit Code anmelden und unter „Mehr“ einrichten.' }) {
  if (!passkeySupported()) return null;
  return <>
    <button className="btn btn-primary" disabled={busy} onClick={onPasskey} style={sx('min-height:52px;font-size:15px')}><Icon n="ph-fingerprint" style={sx('font-size:20px')} />{label}</button>
    {hint && <div style={sx('font-size:12px;color:var(--color-neutral-400);text-align:center;margin-top:-6px;text-wrap:pretty')}>{hint}</div>}
    <div style={sx('display:flex;align-items:center;gap:10px;font-size:12px;color:var(--color-neutral-400)')}><span style={sx('flex:1;height:1px;background:var(--color-divider)')} />oder mit Code per E-Mail<span style={sx('flex:1;height:1px;background:var(--color-divider)')} /></div>
  </>;
}

/** Angebot direkt nach der Code-Anmeldung: „Beim nächsten Mal schneller anmelden?“ */
export function PasskeyOffer({ role }) {
  const [show, setShow] = useState(false);
  const [done, setDone] = useState(false);
  const act = useAction();
  useEffect(() => {
    if (!takePasskeyOffer(role) || !passkeySupported() || passkeyDeclined(role)) return;
    api(`/api/auth/me?role=${role}`).then(r => { if (r.user && !r.user.passkeys) setShow(true); }).catch(() => {});
  }, [role]);
  if (!show) return null;
  const later = () => { declinePasskey(role); setShow(false); };
  return (
    <Sheet>
      {done ? <>
        <div style={sx('display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;padding:8px 0')}>
          <Icon w="ph-bold" n="ph-check-circle" style={sx('font-size:44px;color:var(--color-ok)')} />
          <div style={sx('font-size:19px;font-weight:600')}>Passkey eingerichtet</div>
          <div style={sx('font-size:14px;color:var(--color-neutral-300);text-wrap:pretty')}>Beim nächsten Mal tippen Sie einfach auf „Mit Passkey anmelden“.</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShow(false)} style={sx('min-height:48px')}>Weiter</button>
      </> : <>
        <div style={sx('width:56px;height:56px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,0.12);box-shadow:inset 0 1px 0 rgba(255,255,255,0.3)')}><Icon n="ph-fingerprint" style={sx('font-size:30px;color:var(--color-accent-300)')} /></div>
        <div style={sx('font-size:20px;font-weight:600')}>Beim nächsten Mal schneller anmelden?</div>
        <div style={sx('font-size:14px;color:var(--color-neutral-300);text-wrap:pretty')}>Mit einem Passkey melden Sie sich per Fingerabdruck, Gesicht oder Displaysperre an – ohne auf einen Code per E-Mail zu warten.</div>
        {act.error && <ErrorLine text={act.error} />}
        <button className="btn btn-primary" disabled={act.busy} onClick={() => act.run(async () => { await addPasskey(role); setDone(true); })} style={sx('min-height:50px;font-size:15px')}><Icon n="ph-fingerprint" style={sx('font-size:20px')} />{act.busy ? 'Bitte am Gerät bestätigen …' : 'Passkey einrichten'}</button>
        <button className="btn btn-ghost" disabled={act.busy} onClick={later} style={sx('min-height:44px;color:var(--color-neutral-300)')}>Später</button>
      </>}
    </Sheet>
  );
}

/** Unterer Abstand für eine eigene Reiterleiste (Home-Balken des Handys) */
export const TAB_PAD_BOTTOM = EMBED ? '8px' : 'max(8px, env(safe-area-inset-bottom))';
