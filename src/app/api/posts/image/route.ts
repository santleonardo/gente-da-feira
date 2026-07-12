import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { sanitizeImage } from "@/lib/image-sanitize";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { safeErrorResponse } from "@/lib/safe-error";

const MAX_PHOTOS_PER_USER = 25;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const blocked = await rateLimitByRule(req, "upload:postimg", user?.id);
    if (blocked) return blocked;

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) return NextResponse.json({ error: "Arquivo não enviado" }, { status: 400 });
    if (!ALLOWED_TYPES.includes(file.type))
      return NextResponse.json({ error: "Tipo não suportado (use JPG, PNG, WebP ou GIF)" }, { status: 400 });
    if (file.size > MAX_FILE_SIZE)
      return NextResponse.json({ error: "Arquivo muito grande (máx 10MB)" }, { status: 400 });

    const { count, error: countError } = await supabase
      .from("posts")
      .select("id", { count: "exact", head: true })
      .eq("author_id", user.id)
      .eq("is_deleted", false)
      .not("image_url", "is", null);

    if (countError) throw countError;
    if ((count || 0) >= MAX_PHOTOS_PER_USER) {
      return NextResponse.json(
        { error: `Limite de ${MAX_PHOTOS_PER_USER} fotos atingido. Exclua posts com foto para publicar mais.` },
        { status: 400 }
      );
    }

    const inputBuffer = Buffer.from(await file.arrayBuffer());
    const { buffer: compressedBuffer, contentType, ext } = await sanitizeImage(
      inputBuffer,
      file.type,
      { maxWidth: 1200, maxHeight: 1200, quality: 70 }
    );

    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const path = `${user.id}/${timestamp}-${randomSuffix}.${ext}`;

    const admin = createAdminClient();
    const { error: uploadError } = await admin.storage
      .from("post-images")
      .upload(path, compressedBuffer, { contentType, cacheControl: "31536000", upsert: false });

    if (uploadError) throw uploadError;

    const { data: urlData } = admin.storage.from("post-images").getPublicUrl(path);
    const imageUrl = urlData.publicUrl;

    return NextResponse.json({ image_url: imageUrl });
  } catch (error: any) {

    const { message, status } = safeErrorResponse(error, 500, "[posts/image POST]");
    return NextResponse.json({ error: message }, { status });
  }
}
