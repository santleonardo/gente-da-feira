import { CLIENT_UPLOAD_LIMITS } from "@/lib/upload-limits";
// ============================================================
// Compressão de imagens no cliente — otimizada para WebP
//
// Pipeline:
//   1. Carrega via createObjectURL (menos RAM)
//   2. Redimensiona (fit inside, sem upscale)
//   3. Encode preferencial: WebP → JPEG (AVIF opcional)
//   4. Se ainda grande: baixa qualidade (busca) e, se preciso, reduz lado
//
// Suporta: HEIC/HEIF (quando o browser decodifica), JPEG, PNG, WebP, AVIF, GIF
// ============================================================

interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  /** Qualidade inicial 0–1 */
  quality?: number;
  maxSizeKB?: number;
  /**
   * Tentar AVIF antes de WebP. Em muitos mobiles AVIF é mais lento
   * e às vezes maior que WebP bem calibrado — default false no feed.
   */
  preferAvif?: boolean;
}

const DEFAULT_OPTIONS: CompressionOptions = {
  maxWidth: 1080,
  maxHeight: 1080,
  quality: 0.72,
  maxSizeKB: 120,
  preferAvif: false,
};

/** Feed / posts / chat: lado ≤1080, alvo ~120KB WebP */
export const FEED_IMAGE_OPTIONS: CompressionOptions = {
  maxWidth: CLIENT_UPLOAD_LIMITS.feedCompress.maxWidth,
  maxHeight: CLIENT_UPLOAD_LIMITS.feedCompress.maxHeight,
  quality: CLIENT_UPLOAD_LIMITS.feedCompress.quality,
  maxSizeKB: CLIENT_UPLOAD_LIMITS.feedCompress.maxSizeKB,
  preferAvif: false,
};

/** Álbum permanente: um pouco mais qualidade */
export const ALBUM_IMAGE_OPTIONS: CompressionOptions = {
  maxWidth: CLIENT_UPLOAD_LIMITS.albumCompress.maxWidth,
  maxHeight: CLIENT_UPLOAD_LIMITS.albumCompress.maxHeight,
  quality: CLIENT_UPLOAD_LIMITS.albumCompress.quality,
  maxSizeKB: CLIENT_UPLOAD_LIMITS.albumCompress.maxSizeKB,
  // Álbum permanente: tenta AVIF (menor) e cai para WebP
  preferAvif: true,
};

/** Avatar / thumbs menores */
export const THUMB_IMAGE_OPTIONS: CompressionOptions = {
  maxWidth: CLIENT_UPLOAD_LIMITS.avatarCompress.maxWidth,
  maxHeight: CLIENT_UPLOAD_LIMITS.avatarCompress.maxHeight,
  quality: CLIENT_UPLOAD_LIMITS.avatarCompress.quality,
  maxSizeKB: CLIENT_UPLOAD_LIMITS.avatarCompress.maxSizeKB,
  preferAvif: false,
};

/** DM / salas */
export const CHAT_IMAGE_OPTIONS: CompressionOptions = {
  maxWidth: CLIENT_UPLOAD_LIMITS.chatCompress.maxWidth,
  maxHeight: CLIENT_UPLOAD_LIMITS.chatCompress.maxHeight,
  quality: CLIENT_UPLOAD_LIMITS.chatCompress.quality,
  maxSizeKB: CLIENT_UPLOAD_LIMITS.chatCompress.maxSizeKB,
  preferAvif: false,
};

type EncodeMime = "image/avif" | "image/webp" | "image/jpeg";

let _webpSupported: boolean | null = null;
let _avifSupported: boolean | null = null;

async function detectWebPSupport(): Promise<boolean> {
  if (_webpSupported !== null) return _webpSupported;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 1;
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/webp", 0.8);
    });
    _webpSupported = !!blob && blob.size > 0 && blob.type === "image/webp";
  } catch {
    _webpSupported = false;
  }
  return _webpSupported;
}

async function detectAvifSupport(): Promise<boolean> {
  if (_avifSupported !== null) return _avifSupported;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 1;
    const blob = await new Promise<Blob | null>((resolve) => {
      try {
        canvas.toBlob(resolve, "image/avif", 0.6);
      } catch {
        resolve(null);
      }
    });
    _avifSupported = !!blob && blob.size > 0 && blob.type === "image/avif";
  } catch {
    _avifSupported = false;
  }
  return _avifSupported;
}

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
  "image/heic",
  "image/heif",
]);

const ALLOWED_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "avif",
  "gif",
  "heic",
  "heif",
]);

function getExtension(filename: string): string {
  const parts = filename.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

export function validateImageFile(file: File): string | null {
  if (file.type) {
    if (!ALLOWED_TYPES.has(file.type)) {
      return "Tipo não suportado. Use JPG, PNG, WebP, AVIF ou GIF.";
    }
  } else {
    const ext = getExtension(file.name);
    if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
      return "Tipo não suportado. Use JPG, PNG, WebP, AVIF ou GIF.";
    }
  }

  if (file.size > CLIENT_UPLOAD_LIMITS.maxImageUploadBytes) {
    return `Imagem muito grande. Máximo ${CLIENT_UPLOAD_LIMITS.maxImageUploadMb}MB antes da compressão.`;
  }

  return null;
}

async function pickOutputType(preferAvif: boolean): Promise<EncodeMime> {
  const webp = await detectWebPSupport();
  const avif = preferAvif && (await detectAvifSupport());
  // preferAvif → tenta AVIF; senão WebP (rápido no mobile)
  if (avif) return "image/avif";
  if (webp) return "image/webp";
  return "image/jpeg";
}

/** Lista de formatos a tentar (melhor → fallback). */
async function candidateTypes(preferAvif: boolean): Promise<EncodeMime[]> {
  const out: EncodeMime[] = [];
  const webp = await detectWebPSupport();
  const avif = await detectAvifSupport();
  if (preferAvif && avif) out.push("image/avif");
  if (webp) out.push("image/webp");
  if (preferAvif && avif && !out.includes("image/avif")) out.push("image/avif");
  if (!out.includes("image/webp") && webp) out.push("image/webp");
  out.push("image/jpeg");
  // unique preserve order
  return [...new Set(out)];
}

function toBlob(
  canvas: HTMLCanvasElement,
  type: EncodeMime,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), type, quality);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Busca a melhor qualidade WebP/JPEG que ainda cabe em maxSizeKB.
 * Retorna o menor blob que atende o alvo (ou o menor obtido).
 */
async function encodeWithinBudget(
  canvas: HTMLCanvasElement,
  type: EncodeMime,
  maxSizeKB: number,
  initialQuality: number
): Promise<Blob | null> {
  const maxBytes = maxSizeKB * 1024;
  // AVIF costuma precisar de qualidade um pouco menor que WebP no canvas
  let lo = type === "image/avif" ? 0.28 : type === "image/webp" ? 0.42 : 0.35;
  let hi = Math.min(Math.max(initialQuality, 0.5), type === "image/avif" ? 0.75 : 0.92);
  let best: Blob | null = null;

  // Tentativa na qualidade alta primeiro
  let blob = await toBlob(canvas, type, hi);
  if (!blob) return null;
  if (blob.size <= maxBytes) return blob;
  best = blob;

  // Busca binária de qualidade (até 7 passos — bom equilíbrio mobile)
  for (let step = 0; step < 7; step++) {
    const mid = (lo + hi) / 2;
    blob = await toBlob(canvas, type, mid);
    if (!blob) break;
    if (blob.size <= maxBytes) {
      best = blob;
      lo = mid; // tenta subir um pouco a qualidade
    } else {
      hi = mid;
      if (!best || blob.size < best.size) best = blob;
    }
  }

  return best;
}

function drawScaled(
  img: HTMLImageElement | ImageBitmap,
  maxWidth: number,
  maxHeight: number
): HTMLCanvasElement {
  const iw = "width" in img ? img.width : (img as HTMLImageElement).naturalWidth;
  const ih = "height" in img ? img.height : (img as HTMLImageElement).naturalHeight;
  let w = iw;
  let h = ih;

  if (w > maxWidth || h > maxHeight) {
    const ratio = Math.min(maxWidth / w, maxHeight / h);
    w = Math.max(1, Math.round(w * ratio));
    h = Math.max(1, Math.round(h * ratio));
  }

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas não disponível");

  // Fundo branco evita halo em PNG transparente → WebP/JPEG
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img as CanvasImageSource, 0, 0, w, h);
  return canvas;
}

/**
 * Comprime um File de imagem. Retorna Blob (WebP quando possível).
 */
export async function compressImage(
  file: File,
  options: CompressionOptions = {}
): Promise<Blob> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const maxWidth = opts.maxWidth ?? 1280;
  const maxHeight = opts.maxHeight ?? 1280;
  const maxSizeKB = opts.maxSizeKB ?? 220;
  const quality = opts.quality ?? 0.78;

  // GIF: não re-encoda (preserva animação); só valida tamanho bruto
  if (file.type === "image/gif") {
    if (file.size > maxSizeKB * 1024 * 4) {
      throw new Error("GIF muito grande para o limite do app.");
    }
    return file;
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    const img = await loadImage(objectUrl);
    const types = await candidateTypes(!!opts.preferAvif);
    const maxBytes = maxSizeKB * 1024;

    let best: Blob | null = null;

    for (const outputType of types) {
      let canvas = drawScaled(img, maxWidth, maxHeight);
      let blob = await encodeWithinBudget(canvas, outputType, maxSizeKB, quality);

      // Se ainda grande: reduz lado
      if (blob && blob.size > maxBytes) {
        for (const s of [0.85, 0.72, 0.6, 0.5]) {
          const mw = Math.round(maxWidth * s);
          const mh = Math.round(maxHeight * s);
          canvas = drawScaled(img, mw, mh);
          const candidate = await encodeWithinBudget(
            canvas,
            outputType,
            maxSizeKB,
            Math.min(quality, outputType === "image/avif" ? 0.55 : 0.72)
          );
          if (candidate && (!blob || candidate.size < blob.size)) blob = candidate;
          if (blob && blob.size <= maxBytes) break;
        }
      }

      if (blob && (!best || blob.size < best.size)) {
        best = blob;
      }
      // Já cabe no orçamento com formato moderno — pode parar
      if (best && best.size <= maxBytes && (outputType === "image/avif" || outputType === "image/webp")) {
        break;
      }
    }

    if (!best) throw new Error("Erro ao comprimir imagem");
    return best;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** Atalho do feed com preset FEED_IMAGE_OPTIONS */
export async function compressImageForFeed(file: File): Promise<Blob> {
  return compressImage(file, FEED_IMAGE_OPTIONS);
}

/** Álbum permanente */
export async function compressImageForAlbum(file: File): Promise<Blob> {
  return compressImage(file, ALBUM_IMAGE_OPTIONS);
}

/** Chat (DM / salas) */
export async function compressImageForChat(file: File): Promise<Blob> {
  return compressImage(file, CHAT_IMAGE_OPTIONS);
}

export function getExtensionForBlob(blob: Blob): string {
  if (blob.type === "image/webp") return "webp";
  if (blob.type === "image/avif") return "avif";
  if (blob.type === "image/png") return "png";
  if (blob.type === "image/gif") return "gif";
  return "jpg";
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error("Erro ao carregar imagem. Tente outra foto."));
    img.src = url;
  });
}

/** Object URL para preview local (sempre revogar depois). */
export function createPreviewUrl(file: Blob | File): string {
  return URL.createObjectURL(file);
}

export function revokePreviewUrl(url: string | null | undefined): void {
  if (!url) return;
  try {
    URL.revokeObjectURL(url);
  } catch {
    /* ignore */
  }
}


/** Quais encoders o browser expõe via canvas.toBlob */
export async function getSupportedImageEncoders(): Promise<{
  webp: boolean;
  avif: boolean;
}> {
  return {
    webp: await detectWebPSupport(),
    avif: await detectAvifSupport(),
  };
}
