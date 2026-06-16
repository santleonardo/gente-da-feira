import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { applyRateLimit } from "@/lib/rate-limit";

const MAX_AUDIO_SIZE = 20 * 1024 * 1024; // 20MB
const ALLOWED_TYPES = [
  "audio/webm",
  "audio/ogg",
  "audio/mpeg",       // .mp3
  "audio/mp4",        // .m4a
  "audio/aac",
  "audio/wav",
  "audio/x-wav",
  "audio/amr",
  "audio/3gpp",       // .3gp (pode conter áudio)
];

// Mapa de folders → buckets do Supabase Storage
const FOLDER_BUCKET_MAP: Record<string, string> = {
  posts: "post-audios",
  chat: "post-audios",
  "album-audios": "post-audios",
};

export async function POST(req: NextRequest) {
  try {
    // Rate limit: 15 uploads de áudio por minuto
    const blocked = await applyRateLimit(req, 15, 60_000);
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
        { error: "Tipo de áudio não suportado (use WebM, OGG, MP3, M4A, AAC, WAV ou AMR)" },
        { status: 400 }
      );
    }

    if (file.size > MAX_AUDIO_SIZE) {
      return NextResponse.json({ error: "Áudio muito grande (máx 20MB)" }, { status: 400 });
    }

    // Determinar bucket com base na folder
    const bucket = FOLDER_BUCKET_MAP[folder] || "post-audios";

    // Determinar extensão a partir do tipo MIME
    const extMap: Record<string, string> = {
      "audio/webm": "webm",
      "audio/ogg": "ogg",
      "audio/mpeg": "mp3",
      "audio/mp4": "m4a",
      "audio/aac": "aac",
      "audio/wav": "wav",
      "audio/x-wav": "wav",
      "audio/amr": "amr",
      "audio/3gpp": "3gp",
    };
    const ext = extMap[file.type] || "webm";

    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const path = `${user.id}/${folder}/${timestamp}-${randomSuffix}.${ext}`;

    const audioBuffer = Buffer.from(await file.arrayBuffer());
    const admin = createAdminClient();

    const { error: uploadError } = await admin.storage
      .from(bucket)
      .upload(path, audioBuffer, { contentType: file.type, cacheControl: "31536000", upsert: false });

    if (uploadError) throw uploadError;

    const { data: urlData } = admin.storage.from(bucket).getPublicUrl(path);
    const url = urlData.publicUrl;

    return NextResponse.json({ url });
  } catch (error: any) {
    console.error("Upload audio error:", error.message);
    return NextResponse.json({ error: error.message || "Erro ao enviar áudio" }, { status: 500 });
  }
}