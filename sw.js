const CACHE_NAME = 'ledger-cache-v1';
const ASSETS = [
  './index.html',
  './manifest.json',
  './js/app.js',
  './js/db.js',
  './js/ledger.js',
  './js/executor.js',
  './js/ai.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((res) => res || fetch(e.request))
  );
});