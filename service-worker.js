const CACHE_NAME = 'gente-da-feira-v1';

// arquivos essenciais (App Shell)
const ASSETS = [
  '/gente-da-feira/',
  '/gente-da-feira/index.html',
  '/gente-da-feira/manifest.json',
  '/gente-da-feira/icon-192.png',
  '/gente-da-feira/icon-512.png',
  '/gente-da-feira/app.js'
];

// instalação → salva cache inicial
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// ativação → limpa caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    )
  );
  self.clients.claim();
});

// intercepta requisições
self.addEventListener('fetch', (event) => {
  const request = event.request;

  event.respondWith(
    fetch(request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        return response;
      })
      .catch(() => {
        return caches.match(request);
      })
  );
});
