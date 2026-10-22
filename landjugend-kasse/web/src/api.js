/** Anfrage an den Server. Wirft Error mit der deutschen Fehlermeldung des Servers. */
export async function api(method, url, body) {
  const opts = { method, headers: {} };
  if (body instanceof FormData) opts.body = body;
  else if (body !== undefined) { opts.body = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; }
  const res = await fetch(url, opts);
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (res.status === 401) window.dispatchEvent(new Event('ljk-auth'));
  if (!res.ok) throw Object.assign(new Error(data?.error || 'Verbindung fehlgeschlagen.'), { code: data?.code });
  return data;
}

export const euro = c => (c / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
export const signed = c => (c > 0 ? '+' : '') + euro(c);
export const fmtDate = iso => { if (!iso) return ''; const [y, m, d] = iso.slice(0, 10).split('-'); return `${+d}.${+m}.${y}`; };
export const isoDate = dt => dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
export const today = () => isoDate(new Date());
/** Cent → Text fürs Eingabefeld („54,89“) */
export const toInput = c => (c == null ? '' : (c / 100).toFixed(2).replace('.', ','));
/** Text aus dem Eingabefeld → Cent (NaN bei ungültiger Eingabe) */
export function toCents(v) {
  let s = String(v ?? '').trim().replace(/\s|€/g, '');
  if (!s) return NaN;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  // „1.100“ ohne Komma = Tausenderpunkt (deutsche Schreibweise), nicht 1,1
  else if (/^[-+]?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  if (!/^[-+]?\d+(\.\d{1,2})?$/.test(s)) return NaN;
  return Math.round(Number(s) * 100);
}
export const fileUrl = r => `/api/kasse/receipts/${r.id}/file`;

/** Fotos vor dem Hochladen verkleinern (Handyfotos haben oft 5–10 MB). PDFs bleiben unverändert. */
export async function shrink(file, max = 2200) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 2_500_000) return file;
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
  } catch { return file; }
}
