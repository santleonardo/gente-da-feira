// ============================================================
// API de fotos do perfil (galeria permanente)
// SEC-009: privacy check for private profiles
// REL-006: Delete atômico via rpc_delete_profile_photo
// LIGHT / FREE: POST (criar) desabilitado no beta
// PERF-002: paginação cursor-based (keyset), mesmo padrão de /api/posts
//
// Parâmetros GET:
//   userId  — dono do álbum (obrigatório)
//   limit   — quantas fotos retornar (padrão 24, máx 48)
//   cursor  — created_at da última foto vista (ISO 8601)
//             Se ausente, retorna as mais recentes.
//
// Resposta:
//   { photos, nextCursor, hasMore }
//   nextCursor é null quando não há mais fotos.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { isBlocked } from "@/lib/block-check";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { idempotencyGate, idempotencyStore, idempotencyFail } from "@/lib/idempotency";
import { stripStoragePaths } from "@/lib/privacy-filter";
import { safeErrorResponse } from "@/lib/safe-error";

const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 48;

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const cursor = searchParams.get("cursor"); // created_at da última foto vista
    const rawLimit = parseInt(searchParams.get("limit") || String(DEFAULT_PAGE_SIZE));
    const limit = Math.min(Math.max(1, rawLimit), MAX_PAGE_SIZE);

    if (!userId) return NextResponse.json({ error: "userId necessário" }, { status: 400 });

    const { data: { user: authUser } } = await supabase.auth.getUser();
    const isOwnProfile = authUser?.id === userId;

    // SEC-004: Block access to profile photos if blocked
    if (authUser && !isOwnProfile) {
      const blocked = await isBlocked(supabase, authUser.id, userId);
      if (blocked) {
        return NextResponse.json({ photos: [], nextCursor: null, hasMore: false, _privacy: { isBlocked: true } });
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
          return NextResponse.json({ photos: [], nextCursor: null, hasMore: false, _privacy: { isRestricted: true } });
        }
      } else {
        return NextResponse.json({ photos: [], nextCursor: null, hasMore: false, _privacy: { isRestricted: true } });
      }
    }

    const blocked = await rateLimitByRule(req, "photos:list", authUser?.id);
    if (blocked) return blocked;

    let query = supabase
      .from("profile_photos")
      .select("id, user_id, url, caption, created_at, reactions:profile_photo_reactions(user_id, type), comment_count:profile_photo_comments(count)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit + 1); // +1 para detectar se há mais páginas

    // Keyset cursor — retorna fotos anteriores ao cursor
    if (cursor) {
      query = query.lt("created_at", cursor);
    }

    const { data: rawPhotos, error } = await query;
    if (error) throw error;

    const hasMore = (rawPhotos?.length ?? 0) > limit;
    const photos = hasMore ? rawPhotos!.slice(0, limit) : (rawPhotos ?? []);
    const nextCursor = hasMore ? photos[photos.length - 1].created_at : null;

    const formatted = stripStoragePaths(photos).map((p: any) => ({
      ...p,
      reactions: p.reactions || [],
      comment_count: p.comment_count?.[0]?.count || 0,
    }));

    return NextResponse.json({ photos: formatted, nextCursor, hasMore });
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