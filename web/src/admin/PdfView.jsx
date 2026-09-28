// PDF mit pdf.js auf Canvas zeichnen – funktioniert auch auf dem Handy (dort zeigen iframes keine PDFs)
// und bietet keinen Download-Knopf.
import { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { sx } from '../lib/core.js';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export default function PdfView({ url }) {
  const box = useRef(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    let cancelled = false, doc = null;
    (async () => {
      try {
        const data = await (await fetch(url, { credentials: 'same-origin' })).arrayBuffer();
        doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
        const el = box.current;
        if (!el || cancelled) return;
        el.innerHTML = '';
        const width = el.clientWidth;
        for (let i = 1; i <= Math.min(doc.numPages, 10) && !cancelled; i++) {
          const page = await doc.getPage(i);
          const vp1 = page.getViewport({ scale: 1 });
          const scale = (width / vp1.width) * (window.devicePixelRatio || 1);
          const vp = page.getViewport({ scale });
          const c = document.createElement('canvas');
          c.width = vp.width; c.height = vp.height;
          c.style.cssText = 'width:100%;display:block;margin-bottom:8px;background:#fff';
          el.appendChild(c);
          await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
        }
      } catch (e) { if (!cancelled) setErr('Das PDF konnte nicht angezeigt werden.'); console.warn(e); }
    })();
    return () => { cancelled = true; doc?.destroy(); };
  }, [url]);
  return (
    <div style={sx('position:absolute;inset:0;overflow-y:auto;scrollbar-width:none;padding:0 0 44px')}>
      {err ? <div style={sx('padding:24px;color:var(--color-neutral-600);font-size:13px')}>{err}</div> : <div ref={box} />}
    </div>
  );
}
