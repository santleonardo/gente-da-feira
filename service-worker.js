const CACHE_NAME = 'gente-da-feira-v2';

const BASE = '/gente-da-feira';

const ASSETS = [
  `${BASE}/`,
  `${BASE}/index.html`,
  `${BASE}/app.js`,
  `${BASE}/manifest.json`,
  `${BASE}/icon-192.png`,
  `${BASE}/icon-512.png`
];

// instala
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .catch(err => console.error('Cache error:', err))
  );
  self.skipWaiting();
});

// ativa
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => key !== CACHE_NAME && caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// fetch
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // nunca mexer com supabase
  if (request.url.includes('supabase.co')) return;

  if (request.method !== 'GET') return;

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;

      return fetch(request)
        .then(response => {
          const clone = response.clone();

          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, clone);
          });

          return response;
        })
        .catch(() => caches.match(`${BASE}/index.html`));
    })
  );
});
