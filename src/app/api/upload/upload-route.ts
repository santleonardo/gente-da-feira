// ============================================================
// API de upload de fotos e vídeos para o Supabase Storage
// Bucket: post-photos (público) — images
// Suporta: images (max 1MB) e video thumbnails (max 500KB)
// Aceita: JPEG, PNG, WebP, GIF (enviados pelo compressImage)
// Para vídeos, use /api/upload/video
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { sanitizeImage } from "@/lib/image-sanitize";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"];
const MAX_IMAGE_SIZE = 1 * 1024 * 1024; // 1MB (aumentado de 500KB para mobile)
const MAX_VIDEO_THUMB_SIZE = 500 * 1024; // 500KB for thumbnails

function getExtension(filename: string): string {
  const parts = filename.split(".");
  if (parts.length < 2) return "";
  return parts[parts.length - 1].toLowerCase();
}

function getContentTypeForExt(ext: string): string {
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    default:
      return "image/jpeg";
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const folder = (formData.get("folder") as string) || "posts";

    if (!file) return NextResponse.json({ error: "Arquivo não enviado" }, { status: 400 });

    // Validação por tipo MIME
    let isValidType = ALLOWED_IMAGE_TYPES.includes(file.type);

    // Fallback: valida por extensão quando o tipo MIME é incomum
    // (ex: mobile browsers que enviam tipo vazio ou application/octet-stream)
    if (!isValidType) {
      const ext = getExtension(file.name);
      if (ALLOWED_EXTENSIONS.includes(ext)) {
        isValidType = true;
      }
    }

    if (!isValidType) {
      return NextResponse.json({ error: "Tipo não suportado" }, { status: 400 });
    }

    // Verifica tamanho
    const maxSize = folder === "video-thumbs" ? MAX_VIDEO_THUMB_SIZE : MAX_IMAGE_SIZE;
    if (file.size > maxSize) {
      return NextResponse.json({
        error: "Arquivo muito grande. Comprima antes de enviar."
      }, { status: 400 });
    }

    const admin = createAdminClient();

    // Reprocessa a imagem via sharp: remove metadados EXIF/GPS,
    // corrige orientação e re-encoda para um formato previsível.
    const inputExt = getExtension(file.name) || "jpg";
    const inputType = file.type && ALLOWED_IMAGE_TYPES.includes(file.type)
      ? file.type
      : getContentTypeForExt(inputExt);

    const inputBuffer = Buffer.from(await file.arrayBuffer());
    const maxThumbDim = folder === "video-thumbs" ? 640 : undefined;
    const { buffer: sanitizedBuffer, contentType, ext } = await sanitizeImage(
      inputBuffer,
      inputType,
      maxThumbDim ? { maxWidth: maxThumbDim, maxHeight: maxThumbDim } : {}
    );

    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const path = `${user.id}/${folder}/${timestamp}-${random}.${ext}`;

    const { error: uploadError } = await admin.storage
      .from("post-photos")
      .upload(path, sanitizedBuffer, {
        contentType,
        cacheControl: "31536000",
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data: urlData } = admin.storage.from("post-photos").getPublicUrl(path);

    return NextResponse.json({
      url: urlData.publicUrl,
      path,
    });
  } catch (error: any) {
    console.error("Upload error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const path = searchParams.get("path");

    if (!path) return NextResponse.json({ error: "Caminho necessário" }, { status: 400 });

    if (!path.startsWith(user.id + "/")) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const admin = createAdminClient();
    const { error } = await admin.storage.from("post-photos").remove([path]);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
