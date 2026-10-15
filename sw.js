/* Sales Tracker service worker: opens without signal. Your numbers live in this browser, not here. */
const CACHE = 'st-v1';
const CORE = ['./', 'index.html', 'app.css', 'app.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => Promise.all(CORE.map((u) => c.add(u).catch(() => null)))).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('st-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
const keyOf = (u) => u.origin + u.pathname;
self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url); if (url.origin !== location.origin) return;
  /* network first, so updates land; cached copy when offline */
  e.respondWith(fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(keyOf(url), copy)); } return res; })
    .catch(() => caches.match(keyOf(url)).then((r) => r || caches.match(req, { ignoreSearch: true })).then((r) => r || caches.match('./'))));
});
