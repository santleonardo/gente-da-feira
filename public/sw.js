// ============================================
// GDF — Service Worker v6
// - Offline fallback (navegação)
// - Network-first para assets estáticos do app
// - Cache-first (SWR) para imagens do Supabase Storage
// - Push Notifications com VAPID
// ============================================

const CACHE_NAME = "gdf-v6";
const IMAGE_CACHE_NAME = "gdf-images-v1";
const OFFLINE_URL = "/offline.html";

/** Máx. entradas no cache de mídia (evita encher o disco do aparelho). */
const IMAGE_CACHE_MAX_ENTRIES = 180;
/** Não cachear resposta de imagem maior que isto (bytes). */
const IMAGE_CACHE_MAX_BYTES = 1.5 * 1024 * 1024; // 1.5 MB

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.add(OFFLINE_URL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  const keep = new Set([CACHE_NAME, IMAGE_CACHE_NAME]);
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !keep.has(k)).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

function isSupabaseStorageImage(url) {
  try {
    const u = new URL(url);
    // Storage público Supabase
    if (!u.hostname.endsWith("supabase.co")) return false;
    if (!u.pathname.includes("/storage/")) return false;
    return /\.(webp|jpe?g|png|gif|avif|heic)(\?|$)/i.test(u.pathname) ||
      u.pathname.includes("/object/public/");
  } catch {
    return false;
  }
}

async function trimImageCache() {
  const cache = await caches.open(IMAGE_CACHE_NAME);
  const keys = await cache.keys();
  if (keys.length <= IMAGE_CACHE_MAX_ENTRIES) return;
  const toDelete = keys.length - IMAGE_CACHE_MAX_ENTRIES;
  // Remove as mais antigas (ordem de inserção aproximada)
  for (let i = 0; i < toDelete; i++) {
    await cache.delete(keys[i]);
  }
}


self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.pathname.startsWith("/api")) return;
  if (url.pathname.startsWith("/auth")) return;
  if (url.protocol !== "https:" && url.protocol !== "http:") return;

  // Imagens do Supabase Storage — cache local
  if (isSupabaseStorageImage(request.url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(IMAGE_CACHE_NAME);
        const cached = await cache.match(request);

        const networkPromise = fetch(request)
          .then(async (response) => {
            if (!response.ok) return response;
            const clone = response.clone();
            const len = Number(response.headers.get("content-length") || 0);
            if (len && len > IMAGE_CACHE_MAX_BYTES) return response;
            const ct = (response.headers.get("content-type") || "").toLowerCase();
            if (ct && !ct.startsWith("image/") && !ct.includes("octet-stream")) {
              return response;
            }
            try {
              await cache.put(request, clone);
              await trimImageCache();
            } catch {
              /* quota */
            }
            return response;
          })
          .catch(() => null);

        if (cached) {
          event.waitUntil(networkPromise);
          return cached;
        }

        const net = await networkPromise;
        if (net) return net;
        return new Response("Image unavailable", {
          status: 503,
          statusText: "Offline",
        });
      })()
    );
    return;
  }

  // Navegação — offline fallback
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  // Assets estáticos do app — network first
  const isStaticAsset =
    /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot)(\?|$)/i.test(url.pathname);
  if (!isStaticAsset) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then(
          (cached) => cached || new Response("Offline", { status: 503 })
        )
      )
  );
});

// Mensagens do client (limpar cache de imagens, etc.)
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;

  if (data.type === "CLEAR_IMAGE_CACHE") {
    event.waitUntil(
      caches.delete(IMAGE_CACHE_NAME).then(() => {
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({ ok: true });
        }
      })
    );
  }

  if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// ── Push Notifications ──────────────────────────────────────

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data = {};
  try {
    data = event.data.json();
  } catch {
    data = { title: "GDF", body: event.data.text() };
  }

  const title = data.title || "Gente da Feira";
  const options = {
    body: data.body || "Você tem uma nova notificação",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-maskable-192.png",
    data: { url: data.url || "/" },
    vibrate: [100, 50, 100],
    tag: data.tag || "gdf-notification",
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === url && "focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
