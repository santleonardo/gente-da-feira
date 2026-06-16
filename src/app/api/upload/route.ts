import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { sanitizeImage } from "@/lib/image-sanitize";
import { applyRateLimit } from "@/lib/rate-limit";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// Mapa de folders → buckets do Supabase Storage
const FOLDER_BUCKET_MAP: Record<string, string> = {
  posts: "post-images",
  chat: "post-images",
  gallery: "post-images",
  "album-photos": "post-photos",
  "video-thumbs": "post-images",
};

export async function POST(req: NextRequest) {
  try {
    // Rate limit: 30 uploads por minuto
    const blocked = await applyRateLimit(req, 30, 60_000);
    if (blocked) return blocked;

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const folder = (formData.get("folder") as string) || "posts";

    if (!file) return NextResponse.json({ error: "Arquivo não enviado" }, { status: 400 });

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Tipo não suportado (use JPG, PNG, WebP ou GIF)" },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Arquivo muito grande (máx 10MB)" }, { status: 400 });
    }

    // Sanitizar imagem (remove EXIF/GPS, corrige orientação, re-dimensiona)
    const inputBuffer = Buffer.from(await file.arrayBuffer());
    const { buffer: sanitizedBuffer, contentType, ext } = await sanitizeImage(
      inputBuffer,
      file.type,
      { maxWidth: 1200, maxHeight: 1200, quality: 70 }
    );

    // Determinar bucket com base na folder
    const bucket = FOLDER_BUCKET_MAP[folder] || "post-images";

    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const path = `${user.id}/${folder}/${timestamp}-${randomSuffix}.${ext}`;

    const admin = createAdminClient();
    const { error: uploadError } = await admin.storage
      .from(bucket)
      .upload(path, sanitizedBuffer, { contentType, cacheControl: "31536000", upsert: false });

    if (uploadError) throw uploadError;

    const { data: urlData } = admin.storage.from(bucket).getPublicUrl(path);
    const url = urlData.publicUrl;

    return NextResponse.json({ url });
  } catch (error: any) {
    console.error("Upload image error:", error.message);
    return NextResponse.json({ error: error.message || "Erro ao enviar imagem" }, { status: 500 });
  }
}