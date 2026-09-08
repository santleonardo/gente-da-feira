/**
 * Limites de upload / mídia — fonte única de verdade.
 *
 * Env (servidor / Vercel):
 *   UPLOAD_MAX_IMAGE_MB=8
 *   UPLOAD_MAX_ALBUM_PHOTOS=15
 *   UPLOAD_MAX_ACTIVE_MEDIA_POSTS=8
 *   UPLOAD_MEDIA_EXPIRATION_HOURS=3
 *   UPLOAD_MAX_PHOTOS_PER_POST=1
 */

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// ── Entrada (antes da compressão) ──

export const MAX_IMAGE_UPLOAD_BYTES = envInt("UPLOAD_MAX_IMAGE_MB", 8) * 1024 * 1024;
export const MAX_IMAGE_UPLOAD_MB = Math.round(MAX_IMAGE_UPLOAD_BYTES / (1024 * 1024));
export const MAX_VIDEO_THUMB_BYTES = 200 * 1024;

// ── Compressão alvo (bytes que ficam no Storage) ──

/** Feed / chat: efêmero — mais agressivo */
export const FEED_COMPRESS = {
  maxWidth: 1080,
  maxHeight: 1080,
  quality: 0.72,
  maxSizeKB: 120,
} as const;

/** Álbum permanente: um pouco mais qualidade, ainda leve */
export const ALBUM_COMPRESS = {
  maxWidth: 1280,
  maxHeight: 1280,
  quality: 0.78,
  maxSizeKB: 180,
} as const;

/** Avatar / thumbs */
export const AVATAR_COMPRESS = {
  maxWidth: 512,
  maxHeight: 512,
  quality: 0.75,
  maxBytes: 80 * 1024,
} as const;

/** Teto no servidor após compressão (rejeita se cliente pular compressão) */
export const STORAGE_FEED_MAX_BYTES = 150 * 1024;
export const STORAGE_ALBUM_MAX_BYTES = 220 * 1024;
export const STORAGE_AVATAR_MAX_BYTES = 100 * 1024;
export const STORAGE_CHAT_MAX_BYTES = 150 * 1024;

// ── Álbum do perfil ──

export const MAX_ALBUM_PHOTOS = envInt("UPLOAD_MAX_ALBUM_PHOTOS", 15);
export const MAX_ALBUM_VIDEOS = envInt("UPLOAD_MAX_ALBUM_VIDEOS", 5);
export const MAX_ALBUM_VIDEO_DURATION_SEC = envInt("UPLOAD_MAX_ALBUM_VIDEO_SEC", 30);
export const MAX_ALBUM_AUDIO_BYTES = envInt("UPLOAD_MAX_ALBUM_AUDIO_MB", 8) * 1024 * 1024;

// ── Posts com mídia (feed) ──

export const MAX_PHOTOS_PER_POST = envInt("UPLOAD_MAX_PHOTOS_PER_POST", 1);
export const MAX_ACTIVE_MEDIA_POSTS = envInt("UPLOAD_MAX_ACTIVE_MEDIA_POSTS", 8);
export const MEDIA_EXPIRATION_HOURS = envInt("UPLOAD_MEDIA_EXPIRATION_HOURS", 3);

/**
 * Limites seguros para o cliente (sem process.env secreto).
 * Manter em sync com os defaults acima.
 */
export const CLIENT_UPLOAD_LIMITS = {
  maxImageUploadMb: 8,
  maxImageUploadBytes: 8 * 1024 * 1024,
  maxAlbumPhotos: 15,
  maxAlbumVideos: 5,
  maxAlbumVideoDurationSec: 30,
  maxAlbumAudioBytes: 8 * 1024 * 1024,
  maxPhotosPerPost: 1,
  maxActiveMediaPosts: 8,
  mediaExpirationHours: 3,
  feedCompress: {
    maxWidth: FEED_COMPRESS.maxWidth,
    maxHeight: FEED_COMPRESS.maxHeight,
    quality: FEED_COMPRESS.quality,
    maxSizeKB: FEED_COMPRESS.maxSizeKB,
  },
  albumCompress: {
    maxWidth: ALBUM_COMPRESS.maxWidth,
    maxHeight: ALBUM_COMPRESS.maxHeight,
    quality: ALBUM_COMPRESS.quality,
    maxSizeKB: ALBUM_COMPRESS.maxSizeKB,
  },
  avatarCompress: {
    maxWidth: AVATAR_COMPRESS.maxWidth,
    maxHeight: AVATAR_COMPRESS.maxHeight,
    quality: AVATAR_COMPRESS.quality,
    maxSizeKB: Math.round(AVATAR_COMPRESS.maxBytes / 1024),
  },
  chatCompress: {
    maxWidth: 1080,
    maxHeight: 1080,
    quality: 0.72,
    maxSizeKB: 120,
  },
} as const;
