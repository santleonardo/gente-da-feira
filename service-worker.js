// Service Worker - Gente da Feira
// Versão: 1.1.0 - Atualizado para arquitetura Modular + Tema Terra-Sol

const CACHE_VERSION = '1.1.0';
const CACHE_NAME = `gente-da-feira-v${CACHE_VERSION}`;

// Assets para precache (Ficheiros essenciais para o app abrir offline)
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './app.js',         // NOVO: O motor principal
  './supabase.js',    // NOVO: A conexão com o banco
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  // Se adicionou o screenshot que sugerimos no manifest, descomente a linha abaixo:
  // './screenshot-mobile.png' 
];

// URLs que NUNCA devem ser cacheadas (Dados em tempo real do Supabase)
const NEVER_CACHE_URLS = [
  '/realtime/v1/websocket',
  '/auth/v1',
  '/rest/v1'
];

// URLs de CDN que o app usa
const CDN_URLS = [
  'cdn.tailwindcss.com',
  'cdn.jsdelivr.net',
  'unpkg.com'
];

// ===== EVENTO: INSTALL =====
self.addEventListener('install', (event) => {
  console.log('[SW] A instalar versão ' + CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] A guardar ficheiros essenciais no cache');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting()) // Força a ativação imediata
  );
});

// ===== EVENTO: ACTIVATE (Limpeza de caches antigos) =====
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME)
            .map(key => caches.delete(key))
      );
    })
  );
  console.log('[SW] Versão ' + CACHE_VERSION + ' ativa e pronta.');
});

// ===== EVENTO: FETCH (O que acontece quando o app pede um ficheiro) =====
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Ignorar pedidos do Supabase (Sempre pedir à rede)
  if (NEVER_CACHE_URLS.some(path => url.pathname.includes(path))) {
    return;
  }

  // 2. Estratégia para Assets Locais (Cache First)
  // Se o ficheiro estiver no cache, usa o cache. Se não, vai à rede.
  event.respondWith(
    caches.match(request).then(response => {
      return response || fetch(request).then(networkResponse => {
        // Se for um asset de CDN, guarda uma cópia no cache
        if (CDN_URLS.some(cdn => url.hostname.includes(cdn))) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, responseClone));
        }
        return networkResponse;
      });
    }).catch(() => {
      // Fallback offline para páginas HTML
      if (request.headers.get('accept').includes('text/html')) {
        return caches.match('./index.html');
      }
    })
  );
});

// Mensagem para atualizar o app via interface
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
