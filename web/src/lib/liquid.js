// Liquid Glass: setzt auf der Glasfläche unter Finger/Maus die Lichtposition (--mx/--my) und lässt sie aufleuchten (--lit).
// Ein Listener für die ganze Seite, pro Bild höchstens ein Update. Aus bei „Bewegung reduzieren“.
const GLASS = '.btn-primary, .btn-secondary, .glass, [data-glass], [style*="var(--color-surface)"]';

if (typeof window !== 'undefined' && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  let lit = null, pending = null;
  const set = (el, e) => {
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
    el.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
  };
  const off = el => { if (el) { el.style.setProperty('--lit', '0'); } };
  const frame = () => {
    const e = pending; pending = null;
    const el = e.target instanceof Element ? e.target.closest(GLASS) : null;
    if (el !== lit) { off(lit); lit = el; }
    if (el) { set(el, e); el.style.setProperty('--lit', e.pointerType === 'mouse' ? '0.6' : '1'); }
  };
  const move = e => { if (!pending) requestAnimationFrame(frame); pending = e; };
  window.addEventListener('pointermove', move, { passive: true });
  window.addEventListener('pointerdown', e => { move(e); }, { passive: true });
  // Auf Touch-Geräten verblasst der Glanz nach dem Loslassen
  window.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') setTimeout(() => { off(lit); lit = null; }, 380); }, { passive: true });
  document.addEventListener('pointerleave', () => { off(lit); lit = null; });
}
