const CACHE_NAME = 'pdks-v1';
const urlsToCache = [
  '/mobile/',
  '/mobile/index.html',
  '/mobile/css/mobile.css',
  '/mobile/js/app.js',
  '/mobile/js/api.js',
  '/mobile/js/qrScanner.js',
  '/mobile/js/camera.js',
  '/mobile/js/gpsTracker.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    }).catch(() => {
      if (event.request.destination === 'document') {
        return caches.match('/mobile/index.html');
      }
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)));
    })
  );
  self.clients.claim();
});
