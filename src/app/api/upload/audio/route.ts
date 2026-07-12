// ============================================================
// API de upload de áudios para o Supabase Storage
// Bucket: post-audios (público)
// Máximo: 10MB, formatos: audio/mpeg, audio/mp4, audio/webm, audio/ogg, audio/wav
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { validateUploadFolder } from "@/lib/storage-security";
import { safeErrorResponse } from "@/lib/safe-error";

const MAX_AUDIO_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_AUDIO_TYPES = ["audio/mpeg", "audio/mp4", "audio/webm", "audio/ogg", "audio/wav", "audio/x-m4a"];

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const blocked = await rateLimitByRule(req, "upload:audio", user?.id);
    if (blocked) return blocked;

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const rawFolder = (formData.get("folder") as string) || "posts";

    // SEC-008: Whitelist do folder — impede path traversal
    const folder = validateUploadFolder(rawFolder, "post-audios");
    if (!folder) {
      return NextResponse.json({ error: "Pasta de destino inválida" }, { status: 400 });
    }

    if (!file) return NextResponse.json({ error: "Arquivo não enviado" }, { status: 400 });

    if (!ALLOWED_AUDIO_TYPES.includes(file.type)) {
      return NextResponse.json({
        error: "Tipo não suportado. Use MP3, M4A, WebM, OGG ou WAV."
      }, { status: 400 });
    }

    if (file.size > MAX_AUDIO_SIZE) {
      return NextResponse.json({
        error: `Áudio muito grande. Máximo ${MAX_AUDIO_SIZE / (1024 * 1024)}MB.`
      }, { status: 400 });
    }

    const admin = createAdminClient();

    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const AUDIO_EXT_MAP: Record<string, string> = {
      "audio/mpeg": "mp3",
      "audio/mp4": "m4a",
      "audio/x-m4a": "m4a",
      "audio/webm": "webm",
      "audio/ogg": "ogg",
      "audio/wav": "wav",
      "audio/x-wav": "wav",
    };
    const ext = AUDIO_EXT_MAP[file.type] || "webm";
    const path = `${user.id}/${folder}/${timestamp}-${random}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const { error: uploadError } = await admin.storage
      .from("post-audios")
      .upload(path, arrayBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data: urlData } = admin.storage.from("post-audios").getPublicUrl(path);

    return NextResponse.json({
      url: urlData.publicUrl,
      path,
    });
  } catch (error: any) {

    const { message, status } = safeErrorResponse(error, 500, "[upload/audio POST]");
    return NextResponse.json({ error: message }, { status });
  }
}
