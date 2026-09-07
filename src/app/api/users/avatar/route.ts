import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { sanitizeImage } from "@/lib/image-sanitize";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { idempotencyGate, idempotencyStore, idempotencyFail } from "@/lib/idempotency";
import { safeErrorResponse } from "@/lib/safe-error";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    const blocked = await rateLimitByRule(req, "users:avatar", user?.id);
    if (blocked) return blocked;

    const idemBlock = await idempotencyGate(req, user.id);
    if (idemBlock) return idemBlock;

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const imageUrl = (formData.get("imageUrl") as string | null)?.trim() || null;
    const userId = formData.get("userId") as string | null;

    if (!userId || userId !== user.id) {
      return NextResponse.json({ error: "ID do usuário inválido" }, { status: 400 });
    }

    let inputBuffer: Buffer;
    let mimeType: string;

    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        return NextResponse.json({ error: "Arquivo muito grande (máx 2MB)" }, { status: 400 });
      }
      const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
      if (!allowedTypes.includes(file.type)) {
        return NextResponse.json(
          { error: "Tipo de arquivo não suportado (use JPG, PNG, WebP ou GIF)" },
          { status: 400 }
        );
      }
      inputBuffer = Buffer.from(await file.arrayBuffer());
      mimeType = file.type;
    } else if (imageUrl) {
      // Definir avatar a partir de uma foto já existente (álbum / post)
      let parsed: URL;
      try {
        parsed = new URL(imageUrl);
      } catch {
        return NextResponse.json({ error: "URL de imagem inválida" }, { status: 400 });
      }
      if (!["http:", "https:"].includes(parsed.protocol)) {
        return NextResponse.json({ error: "URL de imagem inválida" }, { status: 400 });
      }

      const imgRes = await fetch(imageUrl, {
        headers: { Accept: "image/*" },
        signal: AbortSignal.timeout(15000),
      });
      if (!imgRes.ok) {
        return NextResponse.json({ error: "Não foi possível baixar a imagem" }, { status: 400 });
      }
      const contentType = (imgRes.headers.get("content-type") || "").split(";")[0].trim();
      const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
      // Alguns CDNs não enviam content-type confiável — tentamos mesmo assim
      const ab = await imgRes.arrayBuffer();
      if (ab.byteLength > 5 * 1024 * 1024) {
        return NextResponse.json({ error: "Imagem muito grande (máx 5MB)" }, { status: 400 });
      }
      inputBuffer = Buffer.from(ab);
      mimeType = allowedTypes.includes(contentType) ? contentType : "image/jpeg";
    } else {
      return NextResponse.json({ error: "Arquivo ou imageUrl não enviado" }, { status: 400 });
    }

    const admin = createAdminClient();

    // Remove EXIF/GPS, corrige orientação e padroniza tamanho máximo de 512px
    const { buffer: sanitizedBuffer, contentType, ext } = await sanitizeImage(
      inputBuffer,
      mimeType,
      { maxWidth: 512, maxHeight: 512 }
    );

    const path = `${userId}/avatar.${ext}`;

    // REL-006: Upload storage + update DB com compensação.
    const { error: uploadError } = await admin.storage
      .from("avatars")
      .upload(path, sanitizedBuffer, { contentType, cacheControl: "31536000", upsert: true });
    if (uploadError) throw uploadError;

    const { data: urlData } = admin.storage.from("avatars").getPublicUrl(path);
    const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;

    const { error: updateError } = await admin
      .from("profiles")
      .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
      .eq("id", userId);

    if (updateError) {
      console.error("[avatar-upload] DB update falhou, compensando storage:", updateError.message);
      admin.storage.from("avatars").remove([path]).catch(() => {});
      throw updateError;
    }

    const responseData = { avatar_url: avatarUrl };
    await idempotencyStore(req, responseData);
    return NextResponse.json(responseData);
  } catch (error: any) {
    await idempotencyFail(req);

    const { message, status } = safeErrorResponse(error, 500, "[users/avatar POST]");
    return NextResponse.json({ error: message }, { status });
  }
}
