// ============================================================
// API de fotos do perfil (galeria permanente)
// SEC-009: privacy check for private profiles
// REL-006: Delete atômico via rpc_delete_profile_photo
// LIGHT / FREE: POST (criar) desabilitado no beta
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { isBlocked } from "@/lib/block-check";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { idempotencyGate, idempotencyStore, idempotencyFail } from "@/lib/idempotency";
import { stripStoragePaths } from "@/lib/privacy-filter";
import { safeErrorResponse } from "@/lib/safe-error";

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
    const { message, status } = safeErrorResponse(error, 500, "[profile-photos GET]");
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(_req: NextRequest) {
  // Light / Supabase Free: álbum de fotos do perfil desabilitado no beta
  return NextResponse.json(
    { error: "Álbum de fotos do perfil está desabilitado nesta versão beta." },
    { status: 403 }
  );
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

    const idemBlock = await idempotencyGate(req, user.id);
    if (idemBlock) return idemBlock;

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

    const responseData = { success: true };
    await idempotencyStore(req, responseData);
    return NextResponse.json(responseData);
  } catch (error: any) {
    await idempotencyFail(req);
    const { message, status } = safeErrorResponse(error, 500, "[profile-photos DELETE]");
    return NextResponse.json({ error: message }, { status });
  }
}