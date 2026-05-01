// Service Worker - Gente da Feira
// Versão: 3.4.0 - Correcoes UI: Ver Perfil, Chat direto, Mapa bairro, Eventos

const CACHE_VERSION = '3.4.0';
const CACHE_NAME = `gente-da-feira-v${CACHE_VERSION}`;

// Assets para precache (Ficheiros essenciais para o app abrir offline)
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './app.js',
  './supabase.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
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
      .then(() => self.skipWaiting())
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

// ===== EVENTO: FETCH =====
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Ignorar pedidos do Supabase (Sempre pedir à rede)
  if (NEVER_CACHE_URLS.some(path => url.pathname.includes(path))) {
    return;
  }

  // 2. Estratégia para Assets Locais (Cache First)
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

// ============================================================
// PUSH NOTIFICATIONS
// ============================================================

self.addEventListener('push', (event) => {
  console.log('[SW] Push recebido:', event);

  let data = {
    title: 'Gente da Feira',
    body: 'Você tem uma nova notificação!',
    icon: './icon-192.png',
    badge: './icon-192.png',
    url: './'
  };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || './icon-192.png',
    badge: data.badge || './icon-192.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || './'
    },
    actions: [
      { action: 'open', title: 'Ver' },
      { action: 'close', title: 'Fechar' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Clicar na notificação push
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notificação clicada:', event);
  event.notification.close();

  const urlToOpen = event.notification.data?.url || './';

  if (event.action === 'close') return;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // Se já tem uma janela aberta, focar nela
      for (const client of windowClients) {
        if (client.url.includes('index.html') && 'focus' in client) {
          return client.focus();
        }
      }
      // Senão, abrir nova janela
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
