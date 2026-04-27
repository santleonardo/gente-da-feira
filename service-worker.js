const CACHE_NAME = 'gente-da-feira-v1';
// arquivos essenciais (opcional)
const ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];
// instala
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});
// ativa
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      )
    )
  );
  self.clients.claim();
});
// intercepta requests
self.addEventListener('fetch', (event) => {
  const request = event.request;
  // 🚫 nunca mexer com API (Supabase)
  if (request.url.includes('supabase.co')) return;
  // 🚫 só cacheia GET
  if (request.method !== 'GET') return;
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(request, clone);
        });
        return response;
      });
    }).catch(() => {
      return caches.match('/index.html'); // fallback offline
    })
  );
});
