// ============================================================
// API de upload de fotos e vídeos para o Supabase Storage
// Bucket: post-photos (público) — images
// Suporta: images (max 1MB) — WebP ou JPEG
// Para vídeos, use /api/upload/video
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { sanitizeImage } from "@/lib/image-sanitize";

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];
const MAX_IMAGE_SIZE = 1 * 1024 * 1024; // 1MB — aumentado de 500KB para dar
// margem caso a compressão cliente não chegue a 150KB em alguns dispositivos

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const folder = (formData.get("folder") as string) || "posts";

    if (!file) return NextResponse.json({ error: "Arquivo não enviado" }, { status: 400 });

    // Determina o tipo de conteúdo aceito
    const allowedTypes = [...ALLOWED_IMAGE_TYPES];
    if (!allowedTypes.includes(file.type)) {
      // Alguns navegadores mobile podem enviar com tipo diferente
      // Verifica pela extensão do nome do arquivo
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      if (!["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) {
        return NextResponse.json({ error: "Tipo não suportado" }, { status: 400 });
      }
    }

    if (file.size > MAX_IMAGE_SIZE) {
      return NextResponse.json({
        error: "Arquivo muito grande. Comprima antes de enviar."
      }, { status: 400 });
    }

    const admin = createAdminClient();

    // Reprocessa a imagem via sharp: remove metadados EXIF/GPS,
    // corrige orientação e re-encoda para um formato previsível.
    const inputType = file.type || (
      file.name.endsWith(".png") ? "image/png" :
      file.name.endsWith(".gif") ? "image/gif" :
      file.name.endsWith(".webp") ? "image/webp" : "image/jpeg"
    );
    const inputBuffer = Buffer.from(await file.arrayBuffer());
    const { buffer: sanitizedBuffer, contentType, ext } = await sanitizeImage(inputBuffer, inputType);

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
