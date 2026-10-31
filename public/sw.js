// JEarn service worker. The version and file list below are filled in at build time (see vite.config.ts).
const VERSION = '__VERSION__';
const FILES = __FILES__;
const CACHE = 'jearn-' + VERSION;

// Precache the app shell; the new worker waits and takes over on the next launch.
self.addEventListener('install', (e) => {
  // cache: 'reload' skips the browser's HTTP cache (GitHub Pages: max-age=600), so a quick redeploy can't precache
  // the previous index.html, which points to a script the server no longer has (blank app until the next deploy).
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('jearn-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Cache-first for app files; navigations fall back to the cached index.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) =>
      hit || fetch(req).catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()))),
  );
});
