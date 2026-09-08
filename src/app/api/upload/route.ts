// ============================================================
// API de upload de fotos e vídeos para o Supabase Storage
// Bucket: post-photos (público) — images
// Limites em @/lib/upload-limits (UPLOAD_MAX_IMAGE_MB etc.)
// Para vídeos, use /api/upload/video
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { sanitizeImage } from "@/lib/image-sanitize";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { validateUploadFolder, validateStoragePath } from "@/lib/storage-security";
import { safeErrorResponse } from "@/lib/safe-error";
import {
  MAX_IMAGE_UPLOAD_BYTES,
  MAX_IMAGE_UPLOAD_MB,
  MAX_VIDEO_THUMB_BYTES,
  STORAGE_FEED_MAX_BYTES,
  STORAGE_ALBUM_MAX_BYTES,
  FEED_COMPRESS,
  ALBUM_COMPRESS,
} from "@/lib/upload-limits";

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
];
const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "avif", "gif"];

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const blocked = await rateLimitByRule(req, "upload:image", user?.id);
    if (blocked) return blocked;

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const rawFolder = (formData.get("folder") as string) || "posts";

    // SEC-008: Whitelist do folder — impede path traversal
    const folder = validateUploadFolder(rawFolder, "post-photos");
    if (!folder) {
      return NextResponse.json({ error: "Pasta de destino inválida" }, { status: 400 });
    }

    if (!file) return NextResponse.json({ error: "Arquivo não enviado" }, { status: 400 });

    // Validação por tipo MIME, com fallback por extensão (mobile browsers)
    let isValidType = ALLOWED_IMAGE_TYPES.includes(file.type);
    if (!isValidType) {
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      isValidType = ALLOWED_EXTENSIONS.includes(ext);
    }
    if (!isValidType) {
      return NextResponse.json({ error: "Tipo não suportado" }, { status: 400 });
    }

    const maxSize = folder === "video-thumbs" ? MAX_VIDEO_THUMB_BYTES : MAX_IMAGE_UPLOAD_BYTES;
    if (file.size > maxSize) {
      return NextResponse.json({
        error: `Arquivo muito grande (máx. ${MAX_IMAGE_UPLOAD_MB} MB). Escolha outra foto.`
      }, { status: 400 });
    }

    const admin = createAdminClient();

    // Reprocessa via sharp: EXIF off, orientação, AVIF → WebP → JPEG
    const fileExt = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const inputType = (file.type && ALLOWED_IMAGE_TYPES.includes(file.type))
      ? file.type
      : fileExt === "png"
        ? "image/png"
        : fileExt === "gif"
          ? "image/gif"
          : fileExt === "webp"
            ? "image/webp"
            : fileExt === "avif"
              ? "image/avif"
              : "image/jpeg";
    const inputBuffer = Buffer.from(await file.arrayBuffer());

    const isFeedPhoto = folder === "posts" || folder === "post-photos" || folder === "album-photos";
    const { buffer: sanitizedBuffer, contentType, ext } = await sanitizeImage(
      inputBuffer,
      inputType,
      folder === "video-thumbs"
        ? {
            maxWidth: 640,
            maxHeight: 640,
            preferWebP: true,
            preferAvif: false,
            quality: 70,
            maxBytes: MAX_VIDEO_THUMB_BYTES > 90 * 1024 ? 90 * 1024 : MAX_VIDEO_THUMB_BYTES,
          }
        : isFeedPhoto
          ? {
              maxWidth: FEED_COMPRESS.maxWidth,
              maxHeight: FEED_COMPRESS.maxHeight,
              preferWebP: true,
              // Feed: WebP prioritário (CPU); AVIF só se cliente já enviou avif
              preferAvif: false,
              quality: Math.round(FEED_COMPRESS.quality * 100),
              maxBytes: STORAGE_FEED_MAX_BYTES,
            }
          : {
              maxWidth: ALBUM_COMPRESS.maxWidth,
              maxHeight: ALBUM_COMPRESS.maxHeight,
              preferWebP: true,
              // Álbum permanente: compara WebP vs AVIF e guarda o menor
              preferAvif: true,
              quality: Math.round(ALBUM_COMPRESS.quality * 100),
              maxBytes: STORAGE_ALBUM_MAX_BYTES,
            }
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

    const { message, status } = safeErrorResponse(error, 500, "[upload POST]");
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const blocked = await rateLimitByRule(req, "upload:image:del", user?.id);
    if (blocked) return blocked;

    const { searchParams } = new URL(req.url);
    const rawPath = searchParams.get("path");

    if (!rawPath) return NextResponse.json({ error: "Caminho necessário" }, { status: 400 });

    // SEC-008: Validar path — bloquear traversal e verificar ownership
    const path = validateStoragePath(rawPath, user.id);
    if (!path) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const admin = createAdminClient();
    const { error } = await admin.storage.from("post-photos").remove([path]);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    const { message, status } = safeErrorResponse(error, 500, "[upload DELETE]");
    return NextResponse.json({ error: message }, { status });
  }
}
