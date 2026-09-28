// Gemeinsame Bausteine – Styles 1:1 aus den Claude-Design-Prototypen (Nocturne).
import { createContext, useContext, useEffect, useId, useRef, useState } from 'react';
import { sx, EMBED, useWide } from './lib/core.js';

export const GLOW = {
  sweep: 'radial-gradient(110% 45% at 0% 0%, color-mix(in srgb, var(--color-section-glow) 45%, transparent), transparent 70%)',
  customer: 'radial-gradient(110% 45% at 0% 0%, color-mix(in srgb, var(--color-accent) 11%, transparent), transparent 70%)',
  admin: 'radial-gradient(110% 40% at 100% 0%, color-mix(in srgb, var(--color-neutral-600) 22%, transparent), transparent 70%)'
};
export const DIV_BOTTOM = 'linear-gradient(to right, transparent, var(--color-divider) 32px, var(--color-divider) calc(100% - 32px), transparent) no-repeat bottom / 100% 1px';
export const DIV_TOP_48 = 'linear-gradient(to right, transparent, var(--color-divider) 48px, var(--color-divider) calc(100% - 48px), transparent) no-repeat top / 100% 1px';

const WideCtx = createContext(false);
export const useIsWide = () => useContext(WideCtx);

/**
 * Bildschirm-Hülle einer App. Auf dem Handy Vollbild mit Leiste unten (nav.tabs),
 * am Desktop (ab 1024 px, siehe useWide) Seitenleiste links, optional eine Liste (aside) und rechts der Inhalt.
 */
export function Shell({ glow, top, bottom, overlay, children, scrollKey, nav, aside, asideKey }) {
  const ref = useRef(null), asideRef = useRef(null);
  const wide = useWide() && !!nav;
  useEffect(() => { if (ref.current) ref.current.scrollTop = 0; }, [scrollKey]);
  useEffect(() => { if (asideRef.current) asideRef.current.scrollTop = 0; }, [asideKey]);
  if (wide) return (
    <WideCtx.Provider value={true}>
      <div style={sx('height:100dvh;font-family:var(--font-body);color:var(--color-text);font-size:15px;line-height:1.45;background:var(--color-bg);position:relative;overflow:hidden;display:flex')}>
        <div style={sx(`position:absolute;inset:0;pointer-events:none;background:${glow}`)} />
        <nav aria-label="Hauptnavigation" style={sx('flex:none;width:232px;display:flex;flex-direction:column;gap:4px;padding:24px 14px;position:relative;z-index:2;box-shadow:inset -1px 0 0 var(--color-divider)')}>
          <div style={sx('display:flex;gap:10px;align-items:center;padding:0 10px 20px')}>
            <div style={sx('width:34px;height:34px;border-radius:10px;background:var(--color-accent);color:var(--color-bg);display:grid;place-items:center;flex:none')}><Icon w="ph-fill" n="ph-flame" style={sx('font-size:19px')} /></div>
            <div style={sx('min-width:0')}><div style={sx('font-size:15px;font-weight:500;line-height:1.2')}>{nav.title}</div>{nav.sub && <div style={sx('font-size:12px;color:var(--color-neutral-500);overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{nav.sub}</div>}</div>
          </div>
          {nav.tabs.map(t => (
            <button key={t.label} onClick={t.onClick} aria-current={t.on ? 'page' : undefined} style={sx(`display:flex;align-items:center;gap:12px;min-height:44px;padding:0 12px;border-radius:var(--radius-md);border:0;cursor:pointer;font:inherit;font-size:14px;text-align:left;background:${t.on ? 'var(--color-surface)' : 'none'};color:${t.on ? 'var(--color-text)' : 'var(--color-neutral-400)'}`)}>
              <Icon n={t.icon} style={sx(`font-size:20px;color:${t.on ? 'var(--color-accent)' : 'inherit'}`)} /><span style={sx('flex:1')}>{t.label}</span>
              {!!t.badge && <span style={sx('min-width:20px;height:20px;padding:0 6px;border-radius:10px;background:var(--color-accent);color:var(--color-bg);font-size:11px;font-weight:600;display:grid;place-items:center')}>{t.badge}</span>}
            </button>
          ))}
          <div style={sx('flex:1')} />
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
  return (
    <div style={sx('width:100%;max-width:520px;margin:0 auto;height:100dvh;font-family:var(--font-body);color:var(--color-text);font-size:15px;line-height:1.45')}>
      <div style={sx('position:relative;width:100%;height:100%;overflow:hidden;background:var(--color-bg);display:flex;flex-direction:column')}>
        <div style={sx(`position:absolute;inset:0;pointer-events:none;background:${glow}`)} />
        {!EMBED && <div style={sx('height:max(10px, env(safe-area-inset-top));flex:none')} />}
        {top}
        <div ref={ref} style={sx('flex:1;overflow-y:auto;position:relative;z-index:1;scrollbar-width:none')}>{aside}{children}</div>
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
    <div style={sx(`position:absolute;inset:0;z-index:5;background:color-mix(in srgb, var(--color-bg) 70%, transparent);display:flex;flex-direction:column;${wide ? 'justify-content:center;align-items:center' : 'justify-content:flex-end'}`)}>
      <div role="dialog" aria-modal="true" style={sx(`${wide ? 'width:460px;max-height:86vh;' : ''}margin:0 8px 8px;padding:22px 18px 16px;border-radius:32px;background:var(--color-surface);box-shadow:var(--shadow-lg);display:flex;flex-direction:column;gap:10px${scroll ? ';max-height:78%;overflow-y:auto;scrollbar-width:none' : ''}`)}>{children}</div>
    </div>
  );
}

export function TabBar({ tabs, padX = '24px' }) {
  return (
    <div style={sx(`flex:none;display:grid;grid-template-columns:repeat(${tabs.length}, 1fr);padding:8px ${padX} 0;position:relative;z-index:2;background:${DIV_TOP_48}`)}>
      {tabs.map(t => (
        <button key={t.label} onClick={t.onClick} style={sx(`display:flex;flex-direction:column;align-items:center;gap:3px;min-height:48px;background:none;border:0;cursor:pointer;font:inherit;font-size:11px;color:${t.on ? 'var(--color-accent)' : 'var(--color-neutral-500)'};position:relative`)}>
          <Icon n={t.icon} style={sx('font-size:24px')} />{t.label}
          {!!t.badge && <span style={sx('position:absolute;top:-2px;left:calc(50% + 6px);min-width:17px;height:17px;padding:0 5px;border-radius:9px;background:var(--color-accent);color:var(--color-bg);font-size:10px;font-weight:600;display:grid;place-items:center')}>{t.badge}</span>}
        </button>
      ))}
    </div>
  );
}

export function Seg({ options, value, onChange, minH = '40px', stacked }) {
  const name = useId();
  return (
    <div className="seg" style={sx('display:flex')}>
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
  return <div style={sx('min-height:100dvh;display:grid;place-items:center;color:var(--color-neutral-500);font-size:13px;background:var(--color-bg)')}>Lädt …</div>;
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
