// ============================================================
// API de fotos do perfil (galeria permanente)
// Máximo: 20 fotos por perfil
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { isBlocked } from "@/lib/block-check";
import { rateLimitByRule } from "@/lib/apply-rate-limit";

const MAX_PHOTOS_PER_PROFILE = 20;

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (!userId) return NextResponse.json({ error: "userId necessário" }, { status: 400 });

    // SEC-004: Block access to profile photos if blocked
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser && authUser.id !== userId) {
      const blocked = await isBlocked(supabase, authUser.id, userId);
      if (blocked) {
        return NextResponse.json({ photos: [], _privacy: { isBlocked: true } });
      }
    }

    const blocked = await rateLimitByRule(req, "photos:list", authUser?.id);
    if (blocked) return blocked;

    const { data: photos, error } = await supabase
      .from("profile_photos")
      .select(`
        *,
        reactions:profile_photo_reactions(user_id, type),
        comment_count:profile_photo_comments(count)
      `)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const formatted = (photos || []).map((p: any) => ({
      ...p,
      reactions: p.reactions || [],
      comment_count: p.comment_count?.[0]?.count || 0,
    }));

    return NextResponse.json({ photos: formatted });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const blocked = await rateLimitByRule(req, "photos:create", user?.id);
    if (blocked) return blocked;

    const { url, caption, storagePath } = await req.json();
    if (!url) return NextResponse.json({ error: "URL da foto é obrigatória" }, { status: 400 });

    const { count, error: countError } = await supabase
      .from("profile_photos")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);

    if (countError) throw countError;

    if (count !== null && count >= MAX_PHOTOS_PER_PROFILE) {
      return NextResponse.json({
        error: `Limite de ${MAX_PHOTOS_PER_PROFILE} fotos no perfil atingido. Remova uma foto para adicionar outra.`
      }, { status: 400 });
    }

    const { data: photo, error } = await supabase
      .from("profile_photos")
      .insert({
        user_id: user.id,
        url,
        caption: caption || "",
        storage_path: storagePath || "",
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ photo });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const blocked = await rateLimitByRule(req, "photos:delete", user?.id);
    if (blocked) return blocked;

    const { searchParams } = new URL(req.url);
    const photoId = searchParams.get("id");
    if (!photoId) return NextResponse.json({ error: "ID necessário" }, { status: 400 });

    const admin = createAdminClient();

    const { data: photo } = await admin
      .from("profile_photos")
      .select("storage_path")
      .eq("id", photoId)
      .eq("user_id", user.id)
      .single();

    const { error } = await admin
      .from("profile_photos")
      .delete()
      .eq("id", photoId)
      .eq("user_id", user.id);

    if (error) throw error;

    if (photo?.storage_path) {
      try {
        await admin.storage.from("post-photos").remove([photo.storage_path]);
      } catch { /* silent */ }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
