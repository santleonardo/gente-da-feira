import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { sanitizeImage } from "@/lib/image-sanitize";
import { rateLimitByRule } from "@/lib/apply-rate-limit";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    const blocked = await rateLimitByRule(req, "users:avatar", user?.id);
    if (blocked) return blocked;

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const userId = formData.get("userId") as string | null;

    if (!file) return NextResponse.json({ error: "Arquivo não enviado" }, { status: 400 });
    if (!userId || userId !== user.id) return NextResponse.json({ error: "ID do usuário inválido" }, { status: 400 });
    if (file.size > 2 * 1024 * 1024) return NextResponse.json({ error: "Arquivo muito grande (máx 2MB)" }, { status: 400 });

    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) return NextResponse.json({ error: "Tipo de arquivo não suportado (use JPG, PNG, WebP ou GIF)" }, { status: 400 });

    const admin = createAdminClient();

    // Remove EXIF/GPS, corrige orientação e padroniza tamanho máximo de 512px
    const inputBuffer = Buffer.from(await file.arrayBuffer());
    const { buffer: sanitizedBuffer, contentType, ext } = await sanitizeImage(
      inputBuffer,
      file.type,
      { maxWidth: 512, maxHeight: 512 }
    );

    const path = `${userId}/avatar.${ext}`;

    // REL-006: Upload storage + update DB com compensação.
    // 1. Upload para storage (pode falhar — retorna erro)
    // 2. Update profile avatar_url (pode falhar — compensação: remove do storage)
    const { error: uploadError } = await admin.storage.from("avatars").upload(path, sanitizedBuffer, { contentType, cacheControl: "31536000", upsert: true });
    if (uploadError) throw uploadError;

    const { data: urlData } = admin.storage.from("avatars").getPublicUrl(path);
    const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;

    const { error: updateError } = await admin.from("profiles").update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() }).eq("id", userId);

    if (updateError) {
      // REL-006: Compensação — remover do storage se DB falhou
      // Previne arquivo órfão no storage sem referência no perfil
      console.error("[avatar-upload] DB update falhou, compensando storage:", updateError.message);
      admin.storage.from("avatars").remove([path]).catch(() => {});
      throw updateError;
    }

    return NextResponse.json({ avatar_url: avatarUrl });
  } catch (error: any) {
    console.error("Avatar upload error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}