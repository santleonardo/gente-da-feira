// ============================================================
// Limpeza de mídia expirada em mensagens (DMs e salas)
//
// Mensagens com mídia (imagem/vídeo/áudio) recebem um `expires_at`
// no momento da criação. Quando expiram:
//   - Se a mensagem tinha apenas mídia (sem texto), ela é marcada
//     como `is_deleted = true` (mesmo tratamento dado a posts).
//   - Se a mensagem tinha texto + mídia, o texto é preservado e
//     apenas os campos de mídia são limpos (media_url, media_type,
//     expires_at), liberando o arquivo do storage.
//
// A limpeza roda de forma "best effort" a cada GET de mensagens,
// igual ao padrão já usado em /api/posts.
// ============================================================

import { createAdminClient } from "@/lib/supabase/server";

// Buckets conhecidos onde mídia de mensagens pode estar armazenada
const MEDIA_BUCKETS = [
  "post-photos",
  "post-videos",
  "post-audios",
  "profile-videos",
  "post-images",
];

/**
 * Extrai (bucket, path) de uma URL pública do Supabase Storage.
 * Retorna null se a URL não corresponder a nenhum bucket conhecido.
 */
function parseStorageUrl(url: string): { bucket: string; path: string } | null {
  try {
    const parts = new URL(url).pathname.split("/");
    for (const bucket of MEDIA_BUCKETS) {
      const idx = parts.indexOf(bucket);
      if (idx >= 0) {
        const path = parts.slice(idx + 1).join("/");
        if (path) return { bucket, path };
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Remove o arquivo de mídia de uma mensagem do storage, se reconhecido.
 * Silencioso em caso de erro (best effort).
 */
export async function removeMessageMedia(mediaUrl: string | null | undefined) {
  if (!mediaUrl) return;
  const parsed = parseStorageUrl(mediaUrl);
  if (!parsed) return;

  try {
    const admin = createAdminClient();
    await admin.storage.from(parsed.bucket).remove([parsed.path]);
  } catch {
    /* silent — best effort */
  }
}

/**
 * Limpa mídia expirada em mensagens de DMs e salas.
 * Pode ser chamada a cada GET (fire-and-forget) sem travar a resposta.
 */
export async function cleanupExpiredMessageMedia() {
  try {
    const admin = createAdminClient();
    const now = new Date().toISOString();

    const { data: expired } = await admin
      .from("messages")
      .select("id, content, media_url")
      .lt("expires_at", now)
      .not("media_url", "is", null)
      .eq("is_deleted", false)
      .limit(100);

    if (!expired || expired.length === 0) return;

    const toDelete: string[] = [];
    const toStripMedia: string[] = [];

    for (const msg of expired as any[]) {
      if (msg.content && msg.content.trim()) {
        toStripMedia.push(msg.id);
      } else {
        toDelete.push(msg.id);
      }
      // remove o arquivo do storage independentemente do caminho acima
      removeMessageMedia(msg.media_url).catch(() => {});
    }

    if (toDelete.length > 0) {
      await admin.from("messages").update({ is_deleted: true }).in("id", toDelete);
    }
    if (toStripMedia.length > 0) {
      await admin
        .from("messages")
        .update({ media_url: null, media_type: null, expires_at: null })
        .in("id", toStripMedia);
    }
  } catch {
    /* silent — best effort */
  }
}

/**
 * Calcula o timestamp ISO de expiração para uma mensagem com mídia.
 */
export function getMessageMediaExpiration(hours: number): string {
  const expires = new Date();
  expires.setHours(expires.getHours() + hours);
  return expires.toISOString();
}

/**
 * Calcula o timestamp ISO de expiração para uma mensagem com mídia (em minutos).
 * Usado para salas, onde a mídia é mais efêmera.
 */
export function getMessageMediaExpirationMinutes(minutes: number): string {
  const expires = new Date();
  expires.setMinutes(expires.getMinutes() + minutes);
  return expires.toISOString();
}
