import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { applyRateLimit } from "@/lib/rate-limit";

const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",   // .mov
  "video/x-msvideo",   // .avi
  "video/3gpp",        // .3gp
];

// Mapa de folders → buckets do Supabase Storage
const FOLDER_BUCKET_MAP: Record<string, string> = {
  posts: "post-videos",
  chat: "post-videos",
  videos: "post-videos",
  "album-videos": "profile-videos",
};

export async function POST(req: NextRequest) {
  try {
    // Rate limit: 10 uploads de vídeo por minuto (são arquivos pesados)
    const blocked = await applyRateLimit(req, 10, 60_000);
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
        { error: "Tipo de vídeo não suportado (use MP4, WebM, MOV, AVI ou 3GP)" },
        { status: 400 }
      );
    }

    if (file.size > MAX_VIDEO_SIZE) {
      return NextResponse.json({ error: "Vídeo muito grande (máx 50MB)" }, { status: 400 });
    }

    // Determinar bucket com base na folder
    const bucket = FOLDER_BUCKET_MAP[folder] || "post-videos";

    // Determinar extensão a partir do tipo MIME
    const extMap: Record<string, string> = {
      "video/mp4": "mp4",
      "video/webm": "webm",
      "video/quicktime": "mov",
      "video/x-msvideo": "avi",
      "video/3gpp": "3gp",
    };
    const ext = extMap[file.type] || "mp4";

    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const path = `${user.id}/${folder}/${timestamp}-${randomSuffix}.${ext}`;

    const videoBuffer = Buffer.from(await file.arrayBuffer());
    const admin = createAdminClient();

    const { error: uploadError } = await admin.storage
      .from(bucket)
      .upload(path, videoBuffer, { contentType: file.type, cacheControl: "31536000", upsert: false });

    if (uploadError) throw uploadError;

    const { data: urlData } = admin.storage.from(bucket).getPublicUrl(path);
    const url = urlData.publicUrl;

    return NextResponse.json({ url });
  } catch (error: any) {
    console.error("Upload video error:", error.message);
    return NextResponse.json({ error: error.message || "Erro ao enviar vídeo" }, { status: 500 });
  }
}