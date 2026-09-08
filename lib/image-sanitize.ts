// ============================================================
// Sanitização de imagens no servidor (sharp)
//
// - Remove EXIF/GPS (não chama withMetadata)
// - Corrige orientação via .rotate()
// - Encode otimizado: WebP (padrão feed) → AVIF opcional → JPEG
// - GIF animado preservado
// ============================================================

import sharp from "sharp";

export interface SanitizedImage {
  buffer: Buffer;
  contentType: string;
  ext: string;
}

interface SanitizeOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  /** Preferir WebP (padrão atual do feed) */
  preferWebP?: boolean;
  /** Preferir AVIF (melhor compressão em alguns casos; mais CPU) */
  preferAvif?: boolean;
  /** Tamanho máximo aproximado em bytes (só WebP/JPEG iterativo) */
  maxBytes?: number;
}

async function encodeWebPBest(
  base: sharp.Sharp,
  quality: number,
  maxBytes?: number
): Promise<Buffer> {
  // effort 5 = bom equilíbrio serverless (0–6)
  const encode = (q: number) =>
    base
      .clone()
      .webp({
        quality: Math.round(Math.min(Math.max(q, 40), 90)),
        effort: 5,
        smartSubsample: true,
        // preset photo melhora fotos reais vs UI
        preset: "photo",
      })
      .toBuffer();

  let q = quality;
  let buffer = await encode(q);

  if (!maxBytes || buffer.length <= maxBytes) return buffer;

  // Reduz qualidade até caber (passos curtos — cold start)
  for (const next of [q - 8, q - 16, q - 24, 52, 45]) {
    if (next >= q) continue;
    q = Math.max(40, next);
    buffer = await encode(q);
    if (buffer.length <= maxBytes) return buffer;
  }

  return buffer;
}

export async function sanitizeImage(
  input: Buffer,
  mimeType: string,
  opts: SanitizeOptions = {}
): Promise<SanitizedImage> {
  const {
    maxWidth,
    maxHeight,
    quality,
    preferWebP = true,
    preferAvif = false,
    maxBytes,
  } = opts;

  // GIF animado
  if (mimeType === "image/gif") {
    let img = sharp(input, { animated: true, failOn: "none" });
    if (maxWidth || maxHeight) {
      img = img.resize(maxWidth, maxHeight, {
        fit: "inside",
        withoutEnlargement: true,
      });
    }
    const buffer = await img.gif().toBuffer();
    return { buffer, contentType: "image/gif", ext: "gif" };
  }

  let img = sharp(input, { failOn: "none" }).rotate();

  if (maxWidth || maxHeight) {
    img = img.resize(maxWidth, maxHeight, {
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  const q = quality ?? 78;

  // AVIF só se pedido explicitamente
  if (preferAvif && !preferWebP) {
    try {
      const buffer = await img
        .avif({
          quality: Math.min(Math.max(q, 40), 80),
          effort: 4,
        })
        .toBuffer();
      return { buffer, contentType: "image/avif", ext: "avif" };
    } catch {
      // cai para WebP
    }
  }

  // WebP (caminho principal)
  if (preferWebP || preferAvif || mimeType === "image/webp" || mimeType === "image/avif") {
    try {
      const buffer = await encodeWebPBest(img, q, maxBytes);
      return { buffer, contentType: "image/webp", ext: "webp" };
    } catch {
      // JPEG fallback
    }
  }

  if (preferAvif) {
    try {
      const buffer = await img
        .avif({
          quality: Math.min(Math.max(q, 40), 80),
          effort: 4,
        })
        .toBuffer();
      return { buffer, contentType: "image/avif", ext: "avif" };
    } catch {
      /* jpeg */
    }
  }

  switch (mimeType) {
    case "image/png": {
      // PNG estático → WebP costuma ser bem menor; se preferWebP falhou, png compacto
      try {
        const buffer = await encodeWebPBest(img, q, maxBytes);
        return { buffer, contentType: "image/webp", ext: "webp" };
      } catch {
        return {
          buffer: await img.png({ compressionLevel: 9 }).toBuffer(),
          contentType: "image/png",
          ext: "png",
        };
      }
    }
    case "image/jpeg":
    default: {
      let jq = q;
      let buffer = await img
        .jpeg({ quality: jq, mozjpeg: true, progressive: true })
        .toBuffer();
      if (maxBytes && buffer.length > maxBytes) {
        for (const next of [jq - 10, jq - 20, 55, 48]) {
          jq = Math.max(40, next);
          buffer = await img
            .clone()
            .jpeg({ quality: jq, mozjpeg: true, progressive: true })
            .toBuffer();
          if (buffer.length <= maxBytes) break;
        }
      }
      return { buffer, contentType: "image/jpeg", ext: "jpg" };
    }
  }
}
