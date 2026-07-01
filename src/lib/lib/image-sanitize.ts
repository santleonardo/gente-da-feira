// ============================================================
// Sanitização de imagens no servidor
//
// Reprocessa toda imagem recebida via `sharp`, o que:
//  - Remove metadados EXIF (inclui GPS/geolocalização) — o sharp
//    só inclui metadados na saída se .withMetadata() for chamado,
//    o que NÃO fazemos aqui (omissão intencional).
//  - Corrige a orientação visual usando .rotate() sem argumentos,
//    que lê o EXIF Orientation, gira a imagem corretamente e
//    então descarta o metadado — evita fotos "de lado".
//  - Re-encoda para um formato previsível.
//
// GIFs (potencialmente animados) são tratados separadamente para
// preservar a animação, usando { animated: true }.
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
}

export async function sanitizeImage(
  input: Buffer,
  mimeType: string,
  opts: SanitizeOptions = {}
): Promise<SanitizedImage> {
  const { maxWidth, maxHeight, quality } = opts;

  // GIF: trata como animado para não perder frames; ainda assim
  // remove EXIF pois não chamamos withMetadata().
  if (mimeType === "image/gif") {
    let img = sharp(input, { animated: true, failOn: "none" });
    if (maxWidth || maxHeight) {
      img = img.resize(maxWidth, maxHeight, { fit: "inside", withoutEnlargement: true });
    }
    const buffer = await img.gif().toBuffer();
    return { buffer, contentType: "image/gif", ext: "gif" };
  }

  let img = sharp(input, { failOn: "none" }).rotate(); // aplica EXIF orientation e depois descarta

  if (maxWidth || maxHeight) {
    img = img.resize(maxWidth, maxHeight, { fit: "inside", withoutEnlargement: true });
  }

  switch (mimeType) {
    case "image/png":
      return { buffer: await img.png({ compressionLevel: 8 }).toBuffer(), contentType: "image/png", ext: "png" };
    case "image/webp":
      return { buffer: await img.webp({ quality: quality ?? 80 }).toBuffer(), contentType: "image/webp", ext: "webp" };
    case "image/jpeg":
    default:
      return { buffer: await img.jpeg({ quality: quality ?? 85, mozjpeg: true }).toBuffer(), contentType: "image/jpeg", ext: "jpg" };
  }
}
