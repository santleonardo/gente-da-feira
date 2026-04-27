const CACHE_NAME = 'gente-da-feira-v2';
const BASE_PATH = '/gente-da-feira';

// Arquivos essenciais para precaching
const ASSETS = [
  `${BASE_PATH}/`,
  `${BASE_PATH}/index.html`,
  `${BASE_PATH}/app.js`,
  `${BASE_PATH}/manifest.json`,
  `${BASE_PATH}/icon-192.png`,
  `${BASE_PATH}/icon-512.png`,
  `${BASE_PATH}/icon-maskable-192.png`,
  `${BASE_PATH}/icon-maskable-512.png`
];

// Instala e precacheia os arquivos essenciais
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS).catch(err => {
        console.error('Erro ao cachear assets:', err);
      });
    })
  );
  self.skipWaiting();
});

// Ativa e remove caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            console.log('Deletando cache antigo:', key);
            return caches.delete(key);
          }
        })
      )
    )
  );
  self.clients.claim();
});

// Intercepta requests com estratégia Network First para dados dinâmicos
self.addEventListener('fetch', (event) => {
  const request = event.request;
  
  // 🚫 Nunca cachear chamadas da API Supabase
  if (request.url.includes('supabase.co')) {
    return;
  }
  
  // 🚫 Só cachear GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Estratégia Network First com Cache Fallback
  event.respondWith(
    fetch(request)
      .then(response => {
        // Cachear resposta bem-sucedida
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, clone);
          });
        }
        return response;
      })
      .catch(() => {
        // Se falhou, tenta buscar do cache
        return caches.match(request).then(cached => {
          if (cached) {
            return cached;
          }
          // Fallback para página offline
          if (request.mode === 'navigate') {
            return caches.match(`${BASE_PATH}/index.html`);
          }
        });
      })
  );
});
