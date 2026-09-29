// Offline-Hülle: Seiten und Assets aus dem Cache, wenn kein Netz. API-Aufrufe werden nie gecacht.
const C = 'kf-v4';
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png']).catch(() => {}))); self.skipWaiting(); });
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/aktivieren/')) return;
  const nav = e.request.mode === 'navigate';
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok) { const cp = res.clone(); caches.open(C).then(c => c.put(nav ? '/' : e.request, cp)); }
    return res;
  }).catch(() => caches.match(nav ? '/' : e.request).then(r => r || caches.match('/'))));
});
