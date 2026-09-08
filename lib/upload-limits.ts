/**
 * Limites de upload / mídia — fonte única de verdade.
 *
 * Ajuste aqui ou via variáveis de ambiente no Vercel (só servidor):
 *
 *   UPLOAD_MAX_IMAGE_MB=12
 *   UPLOAD_MAX_ALBUM_PHOTOS=20
 *   UPLOAD_MAX_ACTIVE_MEDIA_POSTS=2
 *   UPLOAD_MEDIA_EXPIRATION_HOURS=6
 *   UPLOAD_MAX_PHOTOS_PER_POST=1
 *
 * Valores do cliente (NEXT_PUBLIC_*) devem espelhar os mesmos números
 * se forem alterados em produção.
 */

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// ── Arquivo de imagem (entrada, antes da compressão final no Storage) ──

/** Tamanho máximo do arquivo de imagem aceito no upload (bytes). */
export const MAX_IMAGE_UPLOAD_BYTES = envInt("UPLOAD_MAX_IMAGE_MB", 12) * 1024 * 1024;

/** Mesmo limite em MB (mensagens de erro / UI). */
export const MAX_IMAGE_UPLOAD_MB = Math.round(MAX_IMAGE_UPLOAD_BYTES / (1024 * 1024));

/** Thumbnail de vídeo */
export const MAX_VIDEO_THUMB_BYTES = 300 * 1024;

// ── Compressão alvo (o que fica no Storage) ──

export const FEED_COMPRESS = {
  maxWidth: 1280,
  maxHeight: 1280,
  quality: 0.8,
  maxSizeKB: 180,
} as const;

export const AVATAR_COMPRESS = {
  maxWidth: 512,
  maxHeight: 512,
  quality: 0.8,
  maxBytes: 100 * 1024,
} as const;

export const STORAGE_FEED_MAX_BYTES = 220 * 1024;
export const STORAGE_ALBUM_MAX_BYTES = 280 * 1024;

// ── Álbum do perfil ──

export const MAX_ALBUM_PHOTOS = envInt("UPLOAD_MAX_ALBUM_PHOTOS", 20);
export const MAX_ALBUM_VIDEOS = envInt("UPLOAD_MAX_ALBUM_VIDEOS", 5);
export const MAX_ALBUM_VIDEO_DURATION_SEC = envInt("UPLOAD_MAX_ALBUM_VIDEO_SEC", 30);
export const MAX_ALBUM_AUDIO_BYTES = envInt("UPLOAD_MAX_ALBUM_AUDIO_MB", 10) * 1024 * 1024;

// ── Posts com mídia (feed) ──

export const MAX_PHOTOS_PER_POST = envInt("UPLOAD_MAX_PHOTOS_PER_POST", 1);
export const MAX_ACTIVE_MEDIA_POSTS = envInt("UPLOAD_MAX_ACTIVE_MEDIA_POSTS", 2);
export const MEDIA_EXPIRATION_HOURS = envInt("UPLOAD_MEDIA_EXPIRATION_HOURS", 6);

/**
 * Limites seguros para import no cliente (sem process.env secreto).
 * Mantidos em sync com os defaults acima.
 */
export const CLIENT_UPLOAD_LIMITS = {
  maxImageUploadMb: 12,
  maxImageUploadBytes: 12 * 1024 * 1024,
  maxAlbumPhotos: 20,
  maxAlbumVideos: 5,
  maxAlbumVideoDurationSec: 30,
  maxAlbumAudioBytes: 10 * 1024 * 1024,
  maxPhotosPerPost: 1,
  maxActiveMediaPosts: 2,
  mediaExpirationHours: 6,
  feedCompress: { maxWidth: 1280, maxHeight: 1280, quality: 0.8, maxSizeKB: 180 },
} as const;
