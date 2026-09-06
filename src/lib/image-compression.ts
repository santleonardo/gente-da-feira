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
  maxWidth: 1280,
  maxHeight: 1280,
  quality: 0.78,
  maxSizeKB: 220,
  preferAvif: false,
};

/** Feed / posts: lado ≤1280, alvo ~180KB em WebP */
export const FEED_IMAGE_OPTIONS: CompressionOptions = {
  maxWidth: 1280,
  maxHeight: 1280,
  quality: 0.8,
  maxSizeKB: 180,
  preferAvif: false,
};

/** Avatar / thumbs menores */
export const THUMB_IMAGE_OPTIONS: CompressionOptions = {
  maxWidth: 640,
  maxHeight: 640,
  quality: 0.75,
  maxSizeKB: 80,
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

  if (file.size > 12 * 1024 * 1024) {
    return "Imagem muito grande. Máximo 12MB antes da compressão.";
  }

  return null;
}

async function pickOutputType(preferAvif: boolean): Promise<EncodeMime> {
  // WebP primeiro (melhor custo/benefício em fotos de feed no mobile)
  if (await detectWebPSupport()) {
    if (preferAvif && (await detectAvifSupport())) return "image/avif";
    return "image/webp";
  }
  if (preferAvif && (await detectAvifSupport())) return "image/avif";
  return "image/jpeg";
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
  let lo = type === "image/webp" ? 0.42 : 0.35;
  let hi = Math.min(Math.max(initialQuality, 0.5), 0.92);
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
    const outputType = await pickOutputType(!!opts.preferAvif);

    // Tentativa 1: dimensões alvo
    let canvas = drawScaled(img, maxWidth, maxHeight);
    let blob = await encodeWithinBudget(canvas, outputType, maxSizeKB, quality);

    // Tentativa 2: se ainda grande, reduz lado e re-encoda WebP
    if (blob && blob.size > maxSizeKB * 1024) {
      const scaleSteps = [0.85, 0.72, 0.6];
      for (const s of scaleSteps) {
        const mw = Math.round(maxWidth * s);
        const mh = Math.round(maxHeight * s);
        canvas = drawScaled(img, mw, mh);
        const candidate = await encodeWithinBudget(
          canvas,
          outputType === "image/avif" ? "image/webp" : outputType,
          maxSizeKB,
          Math.min(quality, 0.72)
        );
        if (candidate && (!blob || candidate.size < blob.size)) {
          blob = candidate;
        }
        if (blob && blob.size <= maxSizeKB * 1024) break;
      }
    }

    // Fallback de tipo se WebP/AVIF falhou
    if (!blob) {
      canvas = drawScaled(img, maxWidth, maxHeight);
      blob = await encodeWithinBudget(canvas, "image/jpeg", maxSizeKB, 0.7);
    }

    if (!blob) throw new Error("Erro ao comprimir imagem");
    return blob;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** Atalho do feed com preset FEED_IMAGE_OPTIONS */
export async function compressImageForFeed(file: File): Promise<Blob> {
  return compressImage(file, FEED_IMAGE_OPTIONS);
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
