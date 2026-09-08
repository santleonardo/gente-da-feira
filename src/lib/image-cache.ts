/**
 * Cache local de imagens (Cache API + Service Worker).
 *
 * - O SW (`public/sw.js`) faz cache-first/SWR para URLs do Supabase Storage.
 * - Este módulo: prefetch, estatísticas e limpeza a partir do client.
 */

const IMAGE_CACHE_NAME = "gdf-images-v1";

function isCacheApiAvailable(): boolean {
  return typeof window !== "undefined" && "caches" in window;
}

/** Prefetch de uma lista de URLs (ex.: fotos do álbum ao abrir o perfil). */
export async function prefetchImages(urls: string[]): Promise<number> {
  if (!isCacheApiAvailable()) return 0;
  const unique = [...new Set(urls.filter((u) => typeof u === "string" && u.startsWith("http")))];
  if (unique.length === 0) return 0;

  const cache = await caches.open(IMAGE_CACHE_NAME);
  let stored = 0;

  await Promise.all(
    unique.map(async (url) => {
      try {
        const existing = await cache.match(url);
        if (existing) {
          stored++;
          return;
        }
        const res = await fetch(url, { mode: "cors", credentials: "omit" });
        if (!res.ok) return;
        const ct = (res.headers.get("content-type") || "").toLowerCase();
        if (ct && !ct.startsWith("image/")) return;
        await cache.put(url, res.clone());
        stored++;
      } catch {
        /* rede / CORS / quota */
      }
    })
  );

  return stored;
}

/** Remove todas as imagens do cache local. */
export async function clearImageCache(): Promise<boolean> {
  if (!isCacheApiAvailable()) return false;

  // Avisa o SW (se ativo) — mesma ação
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg?.active) {
      await new Promise<void>((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = () => resolve();
        reg.active!.postMessage({ type: "CLEAR_IMAGE_CACHE" }, [channel.port2]);
        setTimeout(() => resolve(), 800);
      });
    }
  } catch {
    /* ignore */
  }

  try {
    return await caches.delete(IMAGE_CACHE_NAME);
  } catch {
    return false;
  }
}

export interface ImageCacheStats {
  entries: number;
  /** Soma aproximada via Content-Length quando disponível */
  approxBytes: number;
  supported: boolean;
}

/** Estatísticas do cache de imagens (para tela de configurações). */
export async function getImageCacheStats(): Promise<ImageCacheStats> {
  if (!isCacheApiAvailable()) {
    return { entries: 0, approxBytes: 0, supported: false };
  }

  try {
    const cache = await caches.open(IMAGE_CACHE_NAME);
    const keys = await cache.keys();
    let approxBytes = 0;

    // Amostra até 40 respostas para não travar
    const sample = keys.slice(0, 40);
    await Promise.all(
      sample.map(async (req) => {
        try {
          const res = await cache.match(req);
          if (!res) return;
          const len = Number(res.headers.get("content-length") || 0);
          if (len) approxBytes += len;
          else {
            const buf = await res.clone().arrayBuffer();
            approxBytes += buf.byteLength;
          }
        } catch {
          /* ignore */
        }
      })
    );

    // Extrapolação simples se houver mais entradas
    if (keys.length > sample.length && sample.length > 0) {
      approxBytes = Math.round((approxBytes / sample.length) * keys.length);
    }

    return { entries: keys.length, approxBytes, supported: true };
  } catch {
    return { entries: 0, approxBytes: 0, supported: true };
  }
}

export function formatCacheSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
