// Service worker for offline support and faster mobile loading
const CACHE_NAME = 'roadwatch-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './css/style.css',
  './js/data.js',
  './js/sensor.js',
  './js/ai-detect.js',
  './js/map.js',
  './js/app.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css',
  'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Let the browser handle Leaflet tile loads from CDN online
  if (e.request.url.includes('tile.openstreetmap') || e.request.url.includes('basemaps.cartocdn') || e.request.url.includes('arcgisonline')) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then(response => {
      return response || fetch(e.request);
    }).catch(() => {
      // Offline fallback
      return caches.match('./index.html');
    })
  );
});
