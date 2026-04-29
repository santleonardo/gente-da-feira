// Service Worker - Gente da Feira
// Versão: 1.0.1 - Atualizar a cada deploy para forçar update

const CACHE_VERSION = '1.0.1';
const CACHE_NAME = `gente-da-feira-v${CACHE_VERSION}`;

// Assets para precache (usar caminhos relativos para compatibilidade com subpastas)
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './config.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// URLs que NUNCA devem ser cacheadas
const NEVER_CACHE_URLS = [
  '/realtime/v1/websocket',
  '/auth/v1',
  '/rest/v1'
];

// URLs de CDN que devem usar cache (stale-while-revalidate)
const CDN_URLS = [
  'cdn.tailwindcss.com',
  'unpkg.com'
];

// ===== EVENTO: INSTALL =====
// Cacheia arquivos essenciais na instalação
self.addEventListener('install', (event) => {
  console.log('[SW] Instalando Service Worker v' + CACHE_VERSION);
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Cacheando assets essenciais');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => {
        console.log('[SW] Assets cacheados com sucesso');
        // Força o novo SW a assumir controle imediatamente
        return self.skipWaiting();
      })
      .catch(err => {
        console.error('[SW] Erro ao cachear assets:', err);
        // Não bloqueia instalação se um asset falhar
        return self.skipWaiting();
      })
  );
});

// ===== EVENTO: ACTIVATE =====
// Limpa caches antigos e assume controle das páginas abertas
self.addEventListener('activate', (event) => {
  console.log('[SW] Ativando Service Worker v' + CACHE_VERSION);
  
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        // Remove todos os caches antigos
        return Promise.all(
          cacheNames
            .filter(cacheName => {
              return cacheName.startsWith('gente-da-feira-') && cacheName !== CACHE_NAME;
            })
            .map(cacheName => {
              console.log('[SW] Removendo cache antigo:', cacheName);
              return caches.delete(cacheName);
            })
        );
      })
      .then(() => {
        console.log('[SW] Service Worker ativado e assumindo controle');
        // Assume controle de todas as páginas abertas imediatamente
        return self.clients.claim();
      })
  );
});

// ===== EVENTO: FETCH =====
// Intercepta requisições e aplica estratégias de cache
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. IGNORAR: WebSockets, requisições não-HTTP, e requisições de realtime do Supabase
  if (
    !request.url.startsWith('http') ||
    NEVER_CACHE_URLS.some(path => request.url.includes(path))
  ) {
    return; // Deixa o navegador lidar
  }

  // 2. IGNORAR: Requisições que não sejam GET (POST, PUT, DELETE)
  // Necessário para não interferir com operações do Supabase
  if (request.method !== 'GET') {
    return;
  }

  // 3. ESTRATÉGIA: Stale-While-Revalidate para CDNs
  // Retorna do cache imediatamente, mas atualiza em background
  if (CDN_URLS.some(cdn => url.hostname.includes(cdn))) {
    event.respondWith(
      caches.match(request).then(cachedResponse => {
        const fetchPromise = fetch(request).then(networkResponse => {
          // Atualiza cache em background
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, networkResponse.clone());
            });
          }
          return networkResponse;
        });
        
        // Retorna cache imediatamente se disponível, senão espera rede
        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // 4. ESTRATÉGIA: Cache First para assets locais
  // Perfeito para arquivos estáticos que raramente mudam
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then(cachedResponse => {
        if (cachedResponse) {
          console.log('[SW] Servindo do cache:', request.url);
          return cachedResponse;
        }
        
        // Se não está no cache, busca da rede e cacheia
        return fetch(request).then(networkResponse => {
          // Só cacheia se foi bem sucedido
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, networkResponse.clone());
            });
          }
          return networkResponse;
        }).catch(err => {
          console.error('[SW] Falha ao buscar da rede:', request.url, err);
          
          // Fallback: Se estiver offline e for HTML, retorna index.html
          if (request.headers.get('accept').includes('text/html')) {
            return caches.match('./index.html');
          }
          
          throw err;
        });
      })
    );
    return;
  }

  // 5. ESTRATÉGIA PADRÃO: Network First para APIs externas (Supabase)
  // Sempre tenta rede primeiro, cache apenas como fallback offline
  event.respondWith(
    fetch(request)
      .then(networkResponse => {
        return networkResponse;
      })
      .catch(err => {
        console.log('[SW] Rede falhou, tentando cache para:', request.url);
        return caches.match(request);
      })
  );
});

// ===== EVENTO: MESSAGE =====
// Permite comunicação da página com o Service Worker
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] Recebido comando SKIP_WAITING');
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_VERSION });
  }
});

// ===== LOGGING E DEBUGGING =====
// Logs úteis para debugging
console.log('[SW] Service Worker carregado - Versão:', CACHE_VERSION);
console.log('[SW] Assets para precache:', ASSETS_TO_CACHE);
console.log('[SW] Nome do cache:', CACHE_NAME);
