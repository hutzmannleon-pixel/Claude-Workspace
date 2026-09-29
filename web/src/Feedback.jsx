// Feedback-Knopf für die angemeldeten Apps: macht ein Bild der aktuellen Ansicht,
// der Nutzer zieht einen Rahmen um die betroffene Stelle und schreibt etwas dazu.
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { sx, api } from './lib/core.js';
import { Icon, ErrorLine } from './ui.jsx';

let fontCss = null;

/** Bild der Seite als JPEG-Data-URL. Innere Scroll-Bereiche werden so verschoben, dass der sichtbare Ausschnitt drauf ist. */
async function capture() {
  const { toJpeg, getFontEmbedCSS } = await import('html-to-image');
  const root = document.getElementById('root');
  const moved = [];
  const bars = [];
  for (const el of root.querySelectorAll('*')) {
    if (el.scrollHeight > el.clientHeight && /auto|scroll/.test(getComputedStyle(el).overflowY)) { bars.push([el, el.style.scrollbarWidth]); el.style.scrollbarWidth = 'none'; }
    if (el.scrollTop > 0 && el.children.length) {
      const st = el.scrollTop;
      moved.push([el, st, [...el.children].map(c => [c, c.style.transform])]);
      el.scrollTop = 0;
      for (const c of el.children) c.style.transform = `translateY(-${st}px)`;
    }
  }
  try {
    const bg = getComputedStyle(document.body).backgroundColor;
    const opts = { quality: 0.8, pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5), backgroundColor: bg,
      width: window.innerWidth, height: window.innerHeight, filter: n => !(n.dataset && 'feedbackIgnore' in n.dataset) };
    if (fontCss === null) fontCss = await getFontEmbedCSS(root, opts).catch(() => '');
    return await toJpeg(root, { ...opts, fontEmbedCSS: fontCss });
  } finally {
    for (const [el, st, kids] of moved) { for (const [c, t] of kids) c.style.transform = t; el.scrollTop = st; }
    for (const [el, w] of bars) el.style.scrollbarWidth = w;
  }
}

const device = () => `${window.innerWidth}×${window.innerHeight} · ${/Android/.test(navigator.userAgent) ? 'Android' : /iPhone|iPad/.test(navigator.userAgent) ? 'iOS' : /Windows/.test(navigator.userAgent) ? 'Windows' : /Mac/.test(navigator.userAgent) ? 'Mac' : 'Sonstiges'}${matchMedia('(display-mode: standalone)').matches ? ' · installiert' : ''}`;

/**
 * Knopf + Editor. variant 'float' (schwebend unten rechts in der App-Hülle), 'fixed' (unten rechts im Fenster) oder 'side' (Seitenleiste am Desktop).
 * role 'public' = ohne Anmeldung, dann gibt es ein optionales E-Mail-Feld für Rückfragen.
 * role = welche App (customer/sweep/admin), where = aktuelle Ansicht zur Einordnung beim Betreiber.
 */
export function FeedbackButton({ role = 'public', where, variant = 'float' }) {
  const [state, setState] = useState(null); // null | 'capturing' | { image }
  const open = async () => {
    setState('capturing');
    let image = null;
    try { image = await capture(); } catch (e) { console.warn('Feedback-Bild:', e); }
    setState({ image, page: `${location.pathname}${where ? ' · ' + where : ''}` });
  };
  const btn = variant === 'side'
    ? <button data-feedback-ignore onClick={open} disabled={state === 'capturing'} style={sx('display:flex;align-items:center;gap:12px;min-height:44px;padding:0 12px;border-radius:var(--radius-md);border:0;cursor:pointer;font:inherit;font-size:14px;text-align:left;background:none;color:var(--color-neutral-400)')}>
        <Icon n="ph-chat-circle-dots" style={sx('font-size:20px')} />{state === 'capturing' ? 'Bild wird erstellt …' : 'Feedback geben'}
      </button>
    : <button data-feedback-ignore onClick={open} disabled={state === 'capturing'} aria-label="Feedback geben" title="Feedback geben"
        style={sx(`${variant === 'fixed' ? 'position:fixed;right:24px;bottom:24px;z-index:50' : 'position:absolute;right:12px;bottom:10px;z-index:4'};width:42px;height:42px;border-radius:50%;border:1px solid var(--color-neutral-700);background:color-mix(in srgb, var(--color-surface) 92%, transparent);color:var(--color-accent);display:grid;place-items:center;cursor:pointer;box-shadow:var(--shadow-sm)`)}>
        <Icon n={state === 'capturing' ? 'ph-circle-notch' : 'ph-chat-circle-dots'} style={sx('font-size:21px')} />
      </button>;
  return <>
    {btn}
    {state && state !== 'capturing' && createPortal(<Editor role={role} image={state.image} page={state.page} onClose={() => setState(null)} />, document.body)}
  </>;
}

function Editor({ role, image, page, onClose }) {
  const [mark, setMark] = useState(null);
  const [withImage, setWithImage] = useState(!!image);
  const [note, setNote] = useState('');
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [sent, setSent] = useState(false);
  const box = useRef(null), drag = useRef(null);

  const pos = e => { const r = box.current.getBoundingClientRect(); return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) }; };
  const down = e => { e.preventDefault(); box.current.setPointerCapture(e.pointerId); drag.current = pos(e); setMark({ x: drag.current.x, y: drag.current.y, w: 0, h: 0 }); };
  const move = e => { if (!drag.current) return; const p = pos(e), s = drag.current; setMark({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) }); };
  const up = () => {
    if (!drag.current) return; drag.current = null;
    // Nur getippt statt gezogen: kleinen Rahmen um die Stelle legen
    setMark(m => m && (m.w < 0.02 || m.h < 0.02) ? { x: Math.max(0, m.x - 0.08), y: Math.max(0, m.y - 0.04), w: 0.16, h: 0.08 } : m);
  };
  const send = async () => {
    setBusy(true); setErr(null);
    try {
      await api('/api/feedback', { body: { role, page, note, contact: role === 'public' ? contact.trim() : undefined, device: device(), image: withImage ? image : null, mark: withImage ? mark : null } });
      setSent(true); setTimeout(onClose, 1600);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Feedback geben" data-feedback-ignore style={sx('position:fixed;inset:0;z-index:1000;background:var(--color-bg);font-family:var(--font-body);color:var(--color-text);font-size:15px;line-height:1.45;display:flex;justify-content:center;overflow-y:auto')}>
      <div style={sx('width:100%;max-width:720px;padding:max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:12px')}>
        <div style={sx('display:flex;align-items:center;gap:8px')}>
          <div style={sx('flex:1')}><div style={sx('font-size:20px;font-weight:500')}>Feedback geben</div><div style={sx('font-size:12px;color:var(--color-neutral-500)')}>Geht an den Betreiber · {page}</div></div>
          <button className="btn btn-secondary btn-icon" onClick={onClose} style={sx('width:44px;height:44px')} aria-label="Schließen"><Icon n="ph-x" style={sx('font-size:18px')} /></button>
        </div>
        {sent ? <div style={sx('padding:40px 0;display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center')}>
          <Icon w="ph-bold" n="ph-check-circle" style={sx('font-size:44px;color:var(--color-accent)')} />
          <div style={sx('font-size:18px;font-weight:500')}>Danke für Ihre Rückmeldung!</div>
        </div> : <>
          {image && withImage && <>
            <div style={sx('font-size:13px;color:var(--color-neutral-400);display:flex;gap:8px;align-items:center')}><Icon n="ph-selection-plus" style={sx('font-size:17px;color:var(--color-accent)')} /><span style={sx('flex:1')}>Ziehen Sie einen Rahmen um die betroffene Stelle (oder tippen Sie darauf).</span>
              {mark && <button className="btn btn-ghost" onClick={() => setMark(null)} style={sx('min-height:32px;padding-inline:8px;font-size:12px;color:var(--color-neutral-400)')}>Rahmen entfernen</button>}</div>
            <div style={sx('display:flex;justify-content:center')}>
              <div ref={box} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
                style={sx('position:relative;touch-action:none;cursor:crosshair;user-select:none;border-radius:var(--radius-md);overflow:hidden;box-shadow:0 0 0 1px var(--color-neutral-700);line-height:0')}>
                <img src={image} alt="Bild der aktuellen Ansicht" draggable={false} style={sx('display:block;max-width:100%;max-height:52vh;width:auto;height:auto')} />
                {mark && <div style={{ position: 'absolute', left: mark.x * 100 + '%', top: mark.y * 100 + '%', width: mark.w * 100 + '%', height: mark.h * 100 + '%', border: '2px solid var(--color-accent)', borderRadius: 6, boxShadow: '0 0 0 9999px color-mix(in srgb, #000 35%, transparent)', pointerEvents: 'none' }} />}
              </div>
            </div>
          </>}
          {!image && <div style={sx('font-size:13px;color:var(--color-neutral-400);padding:10px 12px;border-radius:var(--radius-md);background:var(--color-surface)')}>Das Bild der Ansicht konnte auf diesem Gerät nicht erstellt werden. Beschreiben Sie die Stelle bitte kurz im Text.</div>}
          <div className="field"><label htmlFor="fb-note">Was ist Ihnen aufgefallen?</label>
            <textarea id="fb-note" className="input" autoFocus value={note} onChange={e => setNote(e.target.value)} maxLength={2000} placeholder="z. B. Der Knopf reagiert nicht, Text ist unklar, hier fehlt etwas …" style={sx('min-height:96px;font-size:15px')} /></div>
          {role === 'public' && <div className="field"><label htmlFor="fb-contact">E-Mail für Rückfragen (freiwillig)</label>
            <input id="fb-contact" className="input" type="email" inputMode="email" autoComplete="email" value={contact} onChange={e => setContact(e.target.value)} placeholder="name@beispiel.de" style={sx('min-height:44px')} /></div>}
          {image && <label className="checkbox" style={sx('display:flex;gap:10px;align-items:center;font-size:13px;color:var(--color-neutral-300);cursor:pointer')}>
            <input type="checkbox" checked={withImage} onChange={e => setWithImage(e.target.checked)} />Bild der Ansicht mitsenden (kann persönliche Angaben enthalten)</label>}
          {err && <ErrorLine text={err} />}
          <button className="btn btn-primary" disabled={busy || note.trim().length < 3} onClick={send} style={sx('min-height:48px')}><Icon n="ph-paper-plane-tilt" />{busy ? 'Wird gesendet …' : 'Feedback senden'}</button>
        </>}
      </div>
    </div>
  );
}
