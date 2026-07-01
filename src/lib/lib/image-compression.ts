// ============================================================
// Compressão e validação de imagens — compatível com mobile
// Suporta: HEIC/HEIF (iPhone), JPEG, PNG, WebP, GIF
// Usa createObjectURL (menos RAM) em vez de readAsDataURL
// Detecta suporte a WebP no browser; fallback para JPEG
// ============================================================

interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  maxSizeKB?: number;
}

const DEFAULT_OPTIONS: CompressionOptions = {
  maxWidth: 800,
  maxHeight: 800,
  quality: 0.55,
  maxSizeKB: 300,
};

// Detecta se o browser suporta codificação WebP no canvas
let _webpSupported: boolean | null = null;

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

// Tipos aceitos na validação — inclui HEIC/HEIF do iPhone
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

// Extensões aceitas (fallback quando file.type está vazio, comum no Android)
const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif", "heic", "heif"]);

function getExtension(filename: string): string {
  const parts = filename.split(".");
  if (parts.length < 2) return "";
  return parts[parts.length - 1].toLowerCase();
}

export function validateImageFile(file: File): string | null {
  // 1) Verifica por tipo MIME
  if (file.type) {
    if (!ALLOWED_TYPES.has(file.type)) {
      return "Tipo não suportado. Use JPG, PNG, WebP ou GIF.";
    }
  } else {
    // 2) Fallback: verifica por extensão (Android às vezes não seta file.type)
    const ext = getExtension(file.name);
    if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
      return "Tipo não suportado. Use JPG, PNG, WebP ou GIF.";
    }
  }

  // 3) Tamanho máximo antes da compressão (10MB)
  if (file.size > 10 * 1024 * 1024) {
    return "Imagem muito grande. Máximo 10MB antes da compressão.";
  }

  return null;
}

/**
 * Comprime uma imagem para upload.
 * Usa URL.createObjectURL (menos RAM que readAsDataURL).
 * Detecta suporte a WebP; faz fallback para JPEG se necessário.
 */
export async function compressImage(
  file: File,
  options: CompressionOptions = {}
): Promise<Blob> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const webpSupported = await detectWebPSupport();

  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      // Libera o object URL após carregar
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

      // Fundo branco para imagens com transparência (PNG → JPEG)
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      // Tenta WebP primeiro; se não suportado, usa JPEG
      const outputType = webpSupported ? "image/webp" : "image/jpeg";
      const quality = webpSupported ? opts.quality! : Math.min(opts.quality! + 0.1, 0.85);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            // WebP falhou? Tenta JPEG como fallback
            if (outputType === "image/webp") {
              canvas.toBlob(
                (jpegBlob) => {
                  if (!jpegBlob) {
                    reject(new Error("Erro ao comprimir imagem"));
                    return;
                  }
                  handleSizeLimit(canvas, jpegBlob, "image/jpeg", opts.maxSizeKB!, resolve, reject);
                },
                "image/jpeg",
                0.75
              );
            } else {
              reject(new Error("Erro ao comprimir imagem"));
            }
            return;
          }

          handleSizeLimit(canvas, blob, outputType, opts.maxSizeKB!, resolve, reject);
        },
        outputType,
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Erro ao carregar imagem. Tente outra foto."));
    };

    // Usa createObjectURL (muito menos RAM que readAsDataURL)
    img.src = objectUrl;
  });
}

/**
 * Verifica se o blob está dentro do limite de tamanho.
 * Se estiver acima, comprime iterativamente reduzindo a qualidade.
 */
function handleSizeLimit(
  canvas: HTMLCanvasElement,
  blob: Blob,
  outputType: string,
  maxSizeKB: number,
  resolve: (blob: Blob) => void,
  reject: (error: Error) => void,
  currentQuality: number = 0.4
) {
  if (blob.size <= maxSizeKB * 1024) {
    resolve(blob);
    return;
  }

  // Se já está na qualidade mínima, aceita o que tiver
  if (currentQuality < 0.1) {
    resolve(blob);
    return;
  }

  compressIteratively(canvas, outputType, maxSizeKB, resolve, reject, currentQuality);
}

function compressIteratively(
  canvas: HTMLCanvasElement,
  outputType: string,
  maxSizeKB: number,
  resolve: (blob: Blob) => void,
  reject: (error: Error) => void,
  currentQuality: number = 0.4
) {
  if (currentQuality < 0.1) {
    // Qualidade mínima — aceita o resultado
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Erro na compressão"));
      },
      outputType,
      0.1
    );
    return;
  }

  canvas.toBlob(
    (blob) => {
      if (!blob) {
        // Se WebP falhou nessa iteração, tenta JPEG
        if (outputType === "image/webp") {
          compressIteratively(canvas, "image/jpeg", maxSizeKB, resolve, reject, currentQuality);
        } else {
          reject(new Error("Erro na compressão"));
        }
        return;
      }

      if (blob.size <= maxSizeKB * 1024) {
        resolve(blob);
      } else {
        compressIteratively(canvas, outputType, maxSizeKB, resolve, reject, currentQuality - 0.1);
      }
    },
    outputType,
    currentQuality
  );
}

/**
 * Retorna a extensão correta para o blob baseada no tipo MIME.
 */
export function getExtensionForBlob(blob: Blob): string {
  if (blob.type === "image/jpeg") return "jpg";
  if (blob.type === "image/png") return "png";
  if (blob.type === "image/gif") return "gif";
  // Default para webp (ou unknown)
  return "webp";
}

export function createPreviewUrl(file: File): string {
  return URL.createObjectURL(file);
}

export function revokePreviewUrl(url: string): void {
  URL.revokeObjectURL(url);
}
