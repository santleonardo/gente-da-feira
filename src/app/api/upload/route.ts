// ============================================================
// API de upload de fotos e vídeos para o Supabase Storage
// Bucket: post-photos (público) — images
// Suporta: images (max 1MB) — WebP ou JPEG
// Para vídeos, use /api/upload/video
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { sanitizeImage } from "@/lib/image-sanitize";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { validateUploadFolder, validateStoragePath } from "@/lib/storage-security";
import { safeErrorResponse } from "@/lib/safe-error";

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];
const MAX_IMAGE_SIZE = 1 * 1024 * 1024; // 1MB — aumentado de 500KB para dar
// margem caso a compressão cliente não chegue a 150KB em alguns dispositivos
const MAX_VIDEO_THUMB_SIZE = 500 * 1024; // 500KB para thumbnails de vídeo
const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"];

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

    const maxSize = folder === "video-thumbs" ? MAX_VIDEO_THUMB_SIZE : MAX_IMAGE_SIZE;
    if (file.size > maxSize) {
      return NextResponse.json({
        error: "Arquivo muito grande. Comprima antes de enviar."
      }, { status: 400 });
    }

    const admin = createAdminClient();

    // Reprocessa a imagem via sharp: remove metadados EXIF/GPS,
    // corrige orientação e re-encoda para um formato previsível.
    const fileExt = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const inputType = (file.type && ALLOWED_IMAGE_TYPES.includes(file.type))
      ? file.type
      : (fileExt === "png" ? "image/png" : fileExt === "gif" ? "image/gif" : fileExt === "webp" ? "image/webp" : "image/jpeg");
    const inputBuffer = Buffer.from(await file.arrayBuffer());
    const { buffer: sanitizedBuffer, contentType, ext } = await sanitizeImage(
      inputBuffer,
      inputType,
      folder === "video-thumbs" ? { maxWidth: 640, maxHeight: 640 } : {}
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
