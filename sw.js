/* Service worker: la app funciona sin internet (cache de archivos estáticos). */
const CACHE = 'mtto-v1';
const ASSETS = ['./', 'index.html', 'styles.css', 'logo.png', 'manifest.webmanifest',
  'vendor/jspdf.umd.min.js', 'js/db.js', 'js/model.js', 'js/pdf.js', 'js/app.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// red primero (para recibir actualizaciones), caché como respaldo offline
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then((r) => {
      const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r;
    }).catch(() => caches.match(e.request))
  );
});
