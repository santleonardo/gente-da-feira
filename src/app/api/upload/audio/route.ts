// ============================================================
// API de upload de áudios para o Supabase Storage
// Bucket: post-audios (público)
// Máximo: 10MB — mp3, m4a, webm, ogg, wav
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { validateUploadFolder, validateStoragePath } from "@/lib/storage-security";
import { safeErrorResponse } from "@/lib/safe-error";

const ALLOWED_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/webm",
  "audio/ogg",
  "audio/wav",
  "audio/x-wav",
];
const ALLOWED_EXTENSIONS = ["mp3", "m4a", "webm", "ogg", "wav"];
const MAX_AUDIO_SIZE = 10 * 1024 * 1024; // 10 MB

function extFromFile(file: File): string {
  const fromName = file.name.split(".").pop()?.toLowerCase() || "";
  if (ALLOWED_EXTENSIONS.includes(fromName)) return fromName;
  if (file.type.includes("mpeg") || file.type.includes("mp3")) return "mp3";
  if (file.type.includes("mp4") || file.type.includes("m4a")) return "m4a";
  if (file.type.includes("ogg")) return "ogg";
  if (file.type.includes("wav")) return "wav";
  return "webm";
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const blocked = await rateLimitByRule(req, "upload:audio", user.id);
    if (blocked) return blocked;

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const rawFolder = (formData.get("folder") as string) || "posts";

    const folder = validateUploadFolder(rawFolder, "post-audios");
    if (!folder) {
      return NextResponse.json({ error: "Pasta de destino inválida" }, { status: 400 });
    }

    if (!file) {
      return NextResponse.json({ error: "Arquivo não enviado" }, { status: 400 });
    }

    let isValidType = ALLOWED_TYPES.includes(file.type);
    if (!isValidType) {
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      isValidType = ALLOWED_EXTENSIONS.includes(ext);
    }
    if (!isValidType) {
      return NextResponse.json(
        { error: "Tipo não suportado. Use MP3, M4A, WebM, OGG ou WAV." },
        { status: 400 }
      );
    }

    if (file.size > MAX_AUDIO_SIZE) {
      return NextResponse.json(
        { error: "Áudio muito grande (máx 10MB)" },
        { status: 400 }
      );
    }

    const ext = extFromFile(file);
    const path = `${user.id}/${folder}/${Date.now()}.${ext}`;

    const admin = createAdminClient();
    const buffer = Buffer.from(await file.arrayBuffer());
    const contentType = file.type || `audio/${ext === "mp3" ? "mpeg" : ext}`;

    const { error } = await admin.storage.from("post-audios").upload(path, buffer, {
      contentType,
      upsert: false,
    });

    if (error) {
      console.error("[upload/audio]", error);
      return NextResponse.json(
        { error: error.message || "Falha no upload" },
        { status: 500 }
      );
    }

    const { data: urlData } = admin.storage.from("post-audios").getPublicUrl(path);

    return NextResponse.json({
      url: urlData.publicUrl,
      path,
    });
  } catch (error: unknown) {
    const { message, status } = safeErrorResponse(error, 500, "[upload/audio POST]");
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const blocked = await rateLimitByRule(req, "upload:audio:del", user.id);
    if (blocked) return blocked;

    const { searchParams } = new URL(req.url);
    const rawPath = searchParams.get("path");
    if (!rawPath) {
      return NextResponse.json({ error: "Caminho necessário" }, { status: 400 });
    }

    const path = validateStoragePath(rawPath, user.id);
    if (!path) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const admin = createAdminClient();
    const { error } = await admin.storage.from("post-audios").remove([path]);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const { message, status } = safeErrorResponse(error, 500, "[upload/audio DELETE]");
    return NextResponse.json({ error: message }, { status });
  }
}
