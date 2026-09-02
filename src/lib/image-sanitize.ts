// ============================================================
// Sanitização de imagens no servidor (sharp)
//
// - Remove EXIF/GPS (não chama withMetadata)
// - Corrige orientação via .rotate()
// - Prioridade de encode no feed: AVIF → WebP → JPEG
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
  /** Preferir WebP (legado / fallback) */
  preferWebP?: boolean;
  /**
   * Preferir AVIF (melhor compressão). Se falhar, cai para WebP.
   * Recomendado para feed/posts.
   */
  preferAvif?: boolean;
}

export async function sanitizeImage(
  input: Buffer,
  mimeType: string,
  opts: SanitizeOptions = {}
): Promise<SanitizedImage> {
  const { maxWidth, maxHeight, quality, preferWebP, preferAvif } = opts;

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

  // AVIF primeiro (feed)
  if (preferAvif || mimeType === "image/avif") {
    try {
      const buffer = await img
        .avif({
          quality: Math.min(Math.max(q, 40), 85),
          effort: 4, // 0–9; 4 = bom custo/benefício no serverless
        })
        .toBuffer();
      return { buffer, contentType: "image/avif", ext: "avif" };
    } catch {
      // libvips/avif indisponível → WebP
    }
  }

  // WebP
  if (preferAvif || preferWebP || mimeType === "image/webp") {
    try {
      const buffer = await img
        .webp({
          quality: q,
          effort: 4,
          smartSubsample: true,
        })
        .toBuffer();
      return { buffer, contentType: "image/webp", ext: "webp" };
    } catch {
      // continua para JPEG
    }
  }

  switch (mimeType) {
    case "image/png":
      return {
        buffer: await img.png({ compressionLevel: 8 }).toBuffer(),
        contentType: "image/png",
        ext: "png",
      };
    case "image/jpeg":
    default:
      return {
        buffer: await img
          .jpeg({ quality: quality ?? 85, mozjpeg: true })
          .toBuffer(),
        contentType: "image/jpeg",
        ext: "jpg",
      };
  }
}
