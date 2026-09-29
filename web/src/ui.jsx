// Gemeinsame Bausteine – Styles 1:1 aus den Claude-Design-Prototypen (Nocturne).
import { createContext, useContext, useEffect, useId, useRef, useState } from 'react';
import { sx, EMBED, useWide, parseDate, isoDate, dayLabel } from './lib/core.js';
import { FeedbackButton } from './Feedback.jsx';
import { LogoMark, Scenery } from './brand.jsx';

export const GLOW = {
  sweep: 'radial-gradient(90% 38% at 88% 0%, rgba(255, 214, 170, 0.16), transparent 70%)',
  customer: 'radial-gradient(90% 38% at 88% 0%, rgba(255, 214, 170, 0.18), transparent 70%)',
  admin: 'radial-gradient(90% 38% at 88% 0%, rgba(214, 228, 255, 0.12), transparent 70%)'
};
/** Illustration dezent hinter dem Kopfbereich, nach unten ausgeblendet */
const HeaderScenery = ({ o = 0.6, wide }) => (
  <div aria-hidden="true" style={sx(`position:absolute;left:0;right:0;bottom:0;height:${wide ? '100%' : '64%'};pointer-events:none;opacity:${o};-webkit-mask-image:linear-gradient(to bottom, transparent, #000 18%);mask-image:linear-gradient(to bottom, transparent, #000 18%)`)}><Scenery wide={wide} /></div>
);
const BADGE = 'background:#e5484d;color:#fff;box-shadow:0 2px 8px rgba(229,72,77,0.4)';
export const DIV_BOTTOM = 'linear-gradient(to right, transparent, var(--color-divider) 32px, var(--color-divider) calc(100% - 32px), transparent) no-repeat bottom / 100% 1px';
export const DIV_TOP_48 = 'linear-gradient(to right, transparent, var(--color-divider) 48px, var(--color-divider) calc(100% - 48px), transparent) no-repeat top / 100% 1px';

const WideCtx = createContext(false);
export const useIsWide = () => useContext(WideCtx);

/**
 * Bildschirm-Hülle einer App. Auf dem Handy Vollbild mit Leiste unten (nav.tabs),
 * am Desktop (ab 1024 px, siehe useWide) Seitenleiste links, optional eine Liste (aside) und rechts der Inhalt.
 */
export function Shell({ glow, top, bottom, overlay, children, scrollKey, nav, aside, asideKey, feedback = { role: 'public' }, scenery = true, backdrop }) {
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
        <nav aria-label="Hauptnavigation" style={sx('flex:none;width:232px;display:flex;flex-direction:column;gap:4px;padding:24px 14px;position:relative;z-index:2;box-shadow:inset -1px 0 0 var(--color-divider);background:rgba(20,32,48,0.16);-webkit-backdrop-filter:blur(14px) saturate(120%);backdrop-filter:blur(14px) saturate(120%)')}>
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
    <div style={sx(card ? 'min-height:100dvh;display:grid;place-items:center;padding:24px;background:radial-gradient(70% 50% at 80% 0%, rgba(255,214,170,0.14), transparent 70%), var(--app-bg);font-family:var(--font-body);color:var(--color-text);font-size:15px;line-height:1.45'
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
        {nav && nav.bar !== false && <TabBar tabs={nav.tabs} />}
        {!EMBED && <div style={sx('height:max(8px, env(safe-area-inset-bottom));flex:none')} />}
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
export function CodeInput({ email, value, onChange, onResend, label = 'Bestätigungscode' }) {
  return (
    <div style={sx('display:flex;flex-direction:column;gap:10px')}>
      <div style={sx('font-size:13px;color:var(--color-neutral-400);display:flex;gap:8px;align-items:center;padding:0 6px')}><Icon n="ph-envelope-simple-open" style={sx('font-size:18px;color:var(--color-accent)')} /><span>Code an {email} gesendet</span></div>
      <div style={sx('position:relative;display:grid;grid-template-columns:repeat(6, 1fr);gap:6px')}>
        {[0, 1, 2, 3, 4, 5].map(i => (
          <div key={i} style={sx(`height:54px;border-radius:var(--radius-md);border:1px solid ${i === value.length ? 'var(--color-accent)' : 'var(--color-neutral-700)'};background:var(--color-surface);display:grid;place-items:center;font-size:22px;font-weight:500;font-variant-numeric:tabular-nums`)}>{value[i] || ''}</div>
        ))}
        <input value={value} onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" maxLength={6} autoComplete="one-time-code" aria-label={label}
          style={sx('position:absolute;inset:0;opacity:0;font-size:16px;cursor:text;width:100%')} autoFocus />
      </div>
      {onResend && <button className="btn btn-ghost" onClick={onResend} style={sx('align-self:flex-start;min-height:40px;padding-inline:6px')}>Code erneut senden</button>}
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
    <div className="kf-backdrop" style={sx(`position:absolute;inset:0;z-index:5;background:rgba(12,22,36,0.28);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);display:flex;flex-direction:column;${wide ? 'justify-content:center;align-items:center' : 'justify-content:flex-end'}`)}>
      <div role="dialog" aria-modal="true" className={`kf-sheet${wide ? ' center' : ''}`} style={sx(`${wide ? 'width:460px;max-height:86vh;' : ''}margin:0 8px 8px;padding:22px 18px 16px;border-radius:32px;background:linear-gradient(180deg, rgba(90,120,158,0.42), rgba(40,60,86,0.5));-webkit-backdrop-filter:blur(16px) saturate(190%);backdrop-filter:blur(16px) saturate(190%);box-shadow:var(--shadow-lg);display:flex;flex-direction:column;gap:10px${scroll ? ';max-height:78%;overflow-y:auto;scrollbar-width:none' : ''}`)}>{children}</div>
    </div>
  );
}

export function TabBar({ tabs, padX = '24px' }) {
  const idx = tabs.findIndex(t => t.on);
  return (
    <div style={sx(`flex:none;padding:8px ${padX} 0;position:relative;z-index:2;background:rgba(20,32,48,0.14);-webkit-backdrop-filter:var(--glass-blur);backdrop-filter:var(--glass-blur);box-shadow:inset 0 1px 0 rgba(255,255,255,0.18)`)}>
     <div style={sx(`position:relative;display:grid;grid-template-columns:repeat(${tabs.length}, 1fr)`)}>
      <LiquidPill index={idx} style={{ top: 0, bottom: 0, left: 0, width: `calc(100% / ${tabs.length} - 12px)`, borderRadius: 20, transform: `translateX(calc(${Math.max(0, idx)} * (100% + 12px) + 6px))` }} />
      {tabs.map(t => (
        <button key={t.label} onClick={t.onClick} style={sx(`display:flex;flex-direction:column;align-items:center;gap:3px;min-height:52px;justify-content:center;background:none;border:0;cursor:pointer;font:inherit;font-size:11px;color:${t.on ? 'var(--color-accent-200)' : 'var(--color-neutral-500)'};position:relative;z-index:1`)}>
          <Icon w={t.on ? 'ph-fill' : 'ph'} n={t.icon} style={sx('font-size:24px')} />{t.label}
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
      <div style={sx('width:44px;height:44px;border-radius:14px;display:grid;place-items:center;flex:none;background:rgba(255,255,255,0.1);box-shadow:inset 0 1px 0 rgba(255,255,255,0.25)')}><Icon n={icon} style={sx('font-size:24px')} /></div>
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
      {items.map(t => (
        <button key={t.label} className="glass" onClick={t.onClick} style={sx('position:relative;text-align:left;display:flex;flex-direction:column;gap:14px;padding:18px 16px 16px;min-height:104px;border-radius:22px;border:0;color:inherit;font:inherit;cursor:pointer')}>
          <div style={sx('width:40px;height:40px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,0.1);box-shadow:inset 0 1px 0 rgba(255,255,255,0.25)')}><Icon n={t.icon} style={sx('font-size:22px')} /></div>
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
      <div style={sx('width:48px;height:48px;border-radius:50%;display:grid;place-items:center;flex:none;background:rgba(255,255,255,0.12);box-shadow:inset 0 1px 0 rgba(255,255,255,0.3)')}><Icon n={icon} style={sx('font-size:24px')} /></div>
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
