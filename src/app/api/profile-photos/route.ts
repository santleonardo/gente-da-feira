// ============================================================
// API de fotos do perfil (galeria permanente)
// Máximo: 20 fotos por perfil
// SEC-009: Added privacy check for private profiles
// REL-006: Delete atômico via rpc_delete_profile_photo
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { isBlocked } from "@/lib/block-check";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { sanitizePlainText } from "@/lib/sanitize";
import { validateMediaUrl, extractStoragePathFromUrl } from "@/lib/storage-security";
import { stripStoragePaths } from "@/lib/privacy-filter";

const MAX_PHOTOS_PER_PROFILE = 20;

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (!userId) return NextResponse.json({ error: "userId necessário" }, { status: 400 });

    const { data: { user: authUser } } = await supabase.auth.getUser();
    const isOwnProfile = authUser?.id === userId;

    // SEC-004: Block access to profile photos if blocked
    if (authUser && !isOwnProfile) {
      const blocked = await isBlocked(supabase, authUser.id, userId);
      if (blocked) {
        return NextResponse.json({ photos: [], _privacy: { isBlocked: true } });
      }
    }

    // SEC-009: Check if target profile is private
    const { data: targetProfile } = await supabase
      .from("profiles")
      .select("is_private")
      .eq("id", userId)
      .single();

    if (targetProfile?.is_private && !isOwnProfile) {
      if (authUser) {
        const { data: followRow } = await supabase
          .from("follows")
          .select("status")
          .eq("follower_id", authUser.id)
          .eq("following_id", userId)
          .maybeSingle();

        if (!followRow || followRow.status !== "accepted") {
          return NextResponse.json({ photos: [], _privacy: { isRestricted: true } });
        }
      } else {
        return NextResponse.json({ photos: [], _privacy: { isRestricted: true } });
      }
    }

    const blocked = await rateLimitByRule(req, "photos:list", authUser?.id);
    if (blocked) return blocked;

    const { data: photos, error } = await supabase
      .from("profile_photos")
      .select("id, user_id, url, caption, created_at, reactions:profile_photo_reactions(user_id, type), comment_count:profile_photo_comments(count)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const formatted = stripStoragePaths(photos || []).map((p: any) => ({
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

    const safeUrl = validateMediaUrl(url, {
      allowedBuckets: new Set(["post-photos"]),
      requireUserId: user.id,
    });
    if (!safeUrl) return NextResponse.json({ error: "URL da foto inválida" }, { status: 400 });

    const parsedPath = extractStoragePathFromUrl(safeUrl);
    const derivedStoragePath = parsedPath?.path || "";

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
        url: safeUrl,
        caption: sanitizePlainText(caption || ""),
        storage_path: derivedStoragePath,
      })
      .select("id, user_id, url, caption, created_at")
      .single();

    if (error) throw error;
    return NextResponse.json({ photo });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/profile-photos?id=xxx
// REL-006: Exclusão atômica via rpc_delete_profile_photo.
// Deleta foto + comentários + reações em transação única.
// Retorna storage_path para limpeza de storage (best effort).
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

    // REL-006: operação atômica no banco
    const { data, error } = await supabase
      .rpc("rpc_delete_profile_photo", { p_photo_id: photoId })
      .maybeSingle();

    if (error) throw error;

    if (!data) throw new Error("RPC retornou vazio");
    const result = data as { ok: boolean; error?: string; storage_path?: string; bucket?: string };

    if (!result.ok) {
      switch (result.error) {
        case "not_authenticated":
          return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
        case "photo_not_found":
          return NextResponse.json({ error: "Foto não encontrada" }, { status: 404 });
        default:
          return NextResponse.json({ error: "Não foi possível excluir a foto" }, { status: 400 });
      }
    }

    // Limpeza de storage (best effort) — após DB em estado consistente
    if (result.storage_path) {
      const admin = createAdminClient();
      (async () => {
        try {
          await admin.storage.from(result.bucket || "post-photos").remove([result.storage_path!]);
        } catch { /* silent — best effort */ }
      })();
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}