// ============================================================
// Compressão e validação de imagens — compatível com mobile
// Suporta: HEIC/HEIF (iPhone), JPEG, PNG, WebP, AVIF, GIF
// Usa createObjectURL (menos RAM) em vez de readAsDataURL
// Prioridade de encode: AVIF → WebP → JPEG
// ============================================================

interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  maxSizeKB?: number;
  /** Tentar AVIF no canvas (quando o browser suportar) */
  preferAvif?: boolean;
}

const DEFAULT_OPTIONS: CompressionOptions = {
  maxWidth: 800,
  maxHeight: 800,
  quality: 0.55,
  maxSizeKB: 300,
  preferAvif: true,
};

/** Preset do feed: lado ≤1280, alvo ~150KB (AVIF/WebP) */
export const FEED_IMAGE_OPTIONS: CompressionOptions = {
  maxWidth: 1280,
  maxHeight: 1280,
  quality: 0.7,
  maxSizeKB: 150,
  preferAvif: true,
};

type EncodeMime = "image/avif" | "image/webp" | "image/jpeg";

let _webpSupported: boolean | null = null;
let _avifSupported: boolean | null = null;

async function detectWebPSupport(): Promise<boolean> {
  if (_webpSupported !== null) return _webpSupported;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/webp", 0.5);
    });
    _webpSupported = blob !== null && blob.type === "image/webp";
  } catch {
    _webpSupported = false;
  }
  return _webpSupported;
}

async function detectAvifSupport(): Promise<boolean> {
  if (_avifSupported !== null) return _avifSupported;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const blob = await new Promise<Blob | null>((resolve) => {
      try {
        canvas.toBlob(resolve, "image/avif", 0.5);
      } catch {
        resolve(null);
      }
    });
    // Alguns browsers retornam blob com type vazio ou webp — exige type avif
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
  if (parts.length < 2) return "";
  return parts[parts.length - 1].toLowerCase();
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

  if (file.size > 10 * 1024 * 1024) {
    return "Imagem muito grande. Máximo 10MB antes da compressão.";
  }

  return null;
}

async function pickOutputType(preferAvif: boolean): Promise<EncodeMime> {
  if (preferAvif && (await detectAvifSupport())) return "image/avif";
  if (await detectWebPSupport()) return "image/webp";
  return "image/jpeg";
}

function qualityForType(type: EncodeMime, base: number): number {
  // AVIF costuma precisar de quality um pouco mais alta no canvas para visual similar
  if (type === "image/avif") return Math.min(Math.max(base, 0.45), 0.85);
  if (type === "image/webp") return base;
  return Math.min(base + 0.12, 0.88);
}

/**
 * Comprime uma imagem para upload.
 * Prioridade: AVIF → WebP → JPEG.
 */
export async function compressImage(
  file: File,
  options: CompressionOptions = {}
): Promise<Blob> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const outputType = await pickOutputType(opts.preferAvif !== false);
  const quality = qualityForType(outputType, opts.quality ?? 0.55);

  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const canvas = document.createElement("canvas");
      let { width, height } = img;

      if (width > opts.maxWidth! || height > opts.maxHeight!) {
        const ratio = Math.min(opts.maxWidth! / width, opts.maxHeight! / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      canvas.width = Math.max(1, width);
      canvas.height = Math.max(1, height);

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Erro ao criar contexto canvas"));
        return;
      }

      const drawForType = (type: EncodeMime) => {
        if (type === "image/jpeg") {
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(0, 0, width, height);
        } else {
          ctx.clearRect(0, 0, width, height);
        }
        ctx.drawImage(img, 0, 0, width, height);
      };

      const tryEncode = (type: EncodeMime, q: number) => {
        drawForType(type);
        canvas.toBlob(
          (blob) => {
            if (!blob || blob.size === 0) {
              // Cascata de fallback
              if (type === "image/avif") {
                tryEncode("image/webp", qualityForType("image/webp", opts.quality ?? 0.55));
                return;
              }
              if (type === "image/webp") {
                tryEncode("image/jpeg", qualityForType("image/jpeg", opts.quality ?? 0.55));
                return;
              }
              reject(new Error("Erro ao comprimir imagem"));
              return;
            }
            // Se o browser mentiu o type, ainda aceita se size ok e tenta limit
            const actualType =
              blob.type === "image/avif" || blob.type === "image/webp" || blob.type === "image/jpeg"
                ? (blob.type as EncodeMime)
                : type;
            handleSizeLimit(canvas, blob, actualType, opts.maxSizeKB!, resolve, reject);
          },
          type,
          q
        );
      };

      tryEncode(outputType, quality);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Erro ao carregar imagem. Tente outra foto."));
    };

    img.src = objectUrl;
  });
}

function handleSizeLimit(
  canvas: HTMLCanvasElement,
  blob: Blob,
  outputType: EncodeMime,
  maxSizeKB: number,
  resolve: (blob: Blob) => void,
  reject: (error: Error) => void
) {
  if (blob.size <= maxSizeKB * 1024) {
    resolve(blob);
    return;
  }
  compressIteratively(canvas, outputType, maxSizeKB, resolve, reject, 0.45);
}

function compressIteratively(
  canvas: HTMLCanvasElement,
  outputType: EncodeMime,
  maxSizeKB: number,
  resolve: (blob: Blob) => void,
  reject: (error: Error) => void,
  currentQuality: number = 0.4
) {
  if (currentQuality < 0.12) {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else if (outputType === "image/avif") {
          compressIteratively(canvas, "image/webp", maxSizeKB, resolve, reject, 0.4);
        } else if (outputType === "image/webp") {
          compressIteratively(canvas, "image/jpeg", maxSizeKB, resolve, reject, 0.4);
        } else {
          reject(new Error("Erro na compressão"));
        }
      },
      outputType,
      0.12
    );
    return;
  }

  canvas.toBlob(
    (blob) => {
      if (!blob) {
        if (outputType === "image/avif") {
          compressIteratively(canvas, "image/webp", maxSizeKB, resolve, reject, currentQuality);
        } else if (outputType === "image/webp") {
          compressIteratively(canvas, "image/jpeg", maxSizeKB, resolve, reject, currentQuality);
        } else {
          reject(new Error("Erro na compressão"));
        }
        return;
      }

      if (blob.size <= maxSizeKB * 1024) {
        resolve(blob);
      } else {
        compressIteratively(
          canvas,
          outputType,
          maxSizeKB,
          resolve,
          reject,
          currentQuality - 0.08
        );
      }
    },
    outputType,
    currentQuality
  );
}

export function getExtensionForBlob(blob: Blob): string {
  if (blob.type === "image/jpeg") return "jpg";
  if (blob.type === "image/png") return "png";
  if (blob.type === "image/gif") return "gif";
  if (blob.type === "image/avif") return "avif";
  return "webp";
}

/**
 * Compressão otimizada para o feed: AVIF → WebP → JPEG.
 * Retorna File com nome/extensão corretos para o FormData.
 */
export async function compressImageForFeed(file: File): Promise<File> {
  const isGif = file.type === "image/gif" || getExtension(file.name) === "gif";
  if (isGif) {
    if (file.size > 500 * 1024) {
      throw new Error("GIF muito grande (máx 500KB).");
    }
    return file;
  }

  const blob = await compressImage(file, FEED_IMAGE_OPTIONS);
  const ext = getExtensionForBlob(blob);
  const mime =
    blob.type ||
    (ext === "jpg" ? "image/jpeg" : ext === "avif" ? "image/avif" : `image/${ext}`);
  const base = (file.name.replace(/\.[^.]+$/, "") || "photo")
    .slice(0, 40)
    .replace(/[^\w\-]+/g, "_");
  return new File([blob], `${base}.${ext}`, { type: mime, lastModified: Date.now() });
}

export function createPreviewUrl(file: File): string {
  return URL.createObjectURL(file);
}

export function revokePreviewUrl(url: string): void {
  URL.revokeObjectURL(url);
}
