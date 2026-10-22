import { useEffect, useRef, useState } from 'react';
import { fileUrl } from './api.js';

export const Icon = ({ n, w = 'regular', className = '', ...p }) => <i className={`ph${w === 'regular' ? '' : '-' + w} ph-${n} ${className}`} aria-hidden="true" {...p} />;

// Offene Dialoge, oberster zuletzt – Escape schließt nur den obersten
const stack = [];
export function Modal({ title, onClose, children, footer, wide, className = '' }) {
  const id = useRef({});
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const me = id.current;
    stack.push(me);
    const k = e => e.key === 'Escape' && stack.at(-1) === me && close.current?.();
    window.addEventListener('keydown', k);
    document.body.classList.add('no-scroll');
    return () => {
      stack.splice(stack.indexOf(me), 1);
      window.removeEventListener('keydown', k);
      if (!stack.length) document.body.classList.remove('no-scroll');
    };
  }, []);
  return (
    <div className="backdrop" onMouseDown={e => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${wide ? 'wide' : ''} ${className}`} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
        {title && <div className="modal-head"><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Schließen"><Icon n="x" /></button></div>}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={!!checked} onChange={e => onChange(e.target.checked)} />
      <span className="track"><span className="thumb" /></span>
      <span>{label}{hint && <small className="muted"> {hint}</small>}</span>
    </label>
  );
}

export function Field({ label, children, hint, className = '' }) {
  return <label className={`field ${className}`}><span className="label">{label}</span>{children}{hint && <span className="hint">{hint}</span>}</label>;
}

export function Segmented({ value, onChange, options }) {
  return (
    <div className="segmented" role="tablist">
      {options.map(o => (
        <button key={o.value} type="button" role="tab" aria-selected={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.icon && <Icon n={o.icon} />}{o.label}
        </button>
      ))}
    </div>
  );
}

/** Kleines Aufklapp-Menü an einem Knopf */
export function Menu({ button, items, align = 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    if (!open) return;
    const close = e => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div className="menu-wrap" ref={ref}>
      {button(() => setOpen(o => !o))}
      {open && (
        <div className={`menu ${align}`}>
          {items.filter(Boolean).map(it => (
            <button key={it.label} type="button" className={it.danger ? 'danger' : ''} onClick={() => { setOpen(false); it.onClick(); }}>
              {it.icon && <Icon n={it.icon} />}{it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const STATUS = {
  open: ['Nicht zugeordnet', 'circle', ''],
  partial: ['Teilweise zugeordnet', 'circle-half', 'warn'],
  done: ['Vollständig zugeordnet', 'check-circle', 'ok'],
  transfer: ['Umbuchung', 'arrows-left-right', 'info']
};
export function StatusPill({ status }) {
  const [label, icon, tone] = STATUS[status] || STATUS.open;
  return <span className={`pill ${tone}`}><Icon n={icon} w={status === 'done' ? 'fill' : 'regular'} />{label}</span>;
}
export function StatusDot({ status }) {
  const t = { done: 'Vollständig bezahlt/zugeordnet', partial: 'Teilweise zugeordnet', open: 'Noch keiner Zahlung zugeordnet' }[status];
  return <span className={`dot-status ${status}`} title={t} aria-label={t} />;
}

export function CostDot({ color, name }) {
  return <span className="cost"><span className="dot" style={{ background: color }} />{name}</span>;
}

/** Vorschaubild eines Belegs (Foto direkt, PDF als Symbol) */
export function Thumb({ r, size = 40 }) {
  const style = { width: size, height: size * 1.25 };
  if (r.hasFile && r.mime?.startsWith('image/') && r.mime !== 'image/heic')
    return <span className="thumb" style={style}><img src={fileUrl(r)} alt="" loading="lazy" /></span>;
  return <span className="thumb icon" style={style}><Icon n={r.hasFile ? 'file-pdf' : 'receipt'} /></span>;
}

export function Empty({ icon, title, children }) {
  return <div className="empty"><Icon n={icon} /><strong>{title}</strong>{children && <div className="muted">{children}</div>}</div>;
}

// Kurze Meldungen unten am Bildschirm
let pushToast = () => {};
export const toast = (text, tone = 'ok') => pushToast({ text, tone, id: Math.random() });
export function Toasts() {
  const [list, setList] = useState([]);
  useEffect(() => {
    pushToast = t => { setList(l => [...l, t]); setTimeout(() => setList(l => l.filter(x => x.id !== t.id)), 3500); };
  }, []);
  return <div className="toasts">{list.map(t => <div key={t.id} className={`toast ${t.tone}`}><Icon n={t.tone === 'err' ? 'warning-circle' : 'check-circle'} w="fill" />{t.text}</div>)}</div>;
}

export function ErrorBox({ error }) {
  return error ? <div className="error-box"><Icon n="warning-circle" w="fill" />{error}</div> : null;
}

/** Bestätigung als Promise: if (await confirmBox('…')) … */
export function useConfirm() {
  const [state, setState] = useState(null);
  const ask = (text, { ok = 'Löschen', danger = true } = {}) => new Promise(resolve => setState({ text, ok, danger, resolve }));
  const close = v => { state.resolve(v); setState(null); };
  const dialog = state && (
    <Modal title="Bist du sicher?" onClose={() => close(false)} footer={<>
      <button className="btn" onClick={() => close(false)}>Abbrechen</button>
      <button className={`btn ${state.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => close(true)} autoFocus>{state.ok}</button>
    </>}>
      <p>{state.text}</p>
    </Modal>
  );
  return [ask, dialog];
}
