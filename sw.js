// Pamięć podręczna: karta otwiera się szybko i działa przy słabym zasięgu.
const VERSION = 'ww-v1';
const ASSETS = [
  './', 'index.html', 'panel.html', 'config.js', 'css/style.css',
  'js/core.js', 'js/card.js', 'js/panel.js',
  'vendor/supabase.js', 'vendor/qrcode.js', 'img/icon-192.png'
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // baza danych zawsze na żywo
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
