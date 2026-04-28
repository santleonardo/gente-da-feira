const CACHE_NAME = 'gente-da-feira-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/config.js',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// Instalação: Salva arquivos básicos no cache
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// Ativação: Limpa caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
});

// Interceptador de buscas (FETCH)
self.addEventListener('fetch', (event) => {
  // SEGURANÇA: Ignora requisições que não sejam GET (corrige o erro de POST do Supabase)
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});