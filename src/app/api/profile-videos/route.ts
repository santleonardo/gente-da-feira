// ============================================================
// API de vídeos do perfil
// SEC-009: privacy check for private profiles
// REL-006: Delete atômico via rpc_delete_profile_video
// LIGHT / FREE: POST (criar) desabilitado no beta
// PERF-002: paginação cursor-based (keyset), mesmo padrão de /api/posts
//
// Parâmetros GET:
//   userId  — dono do álbum (obrigatório)
//   limit   — quantos vídeos retornar (padrão 8, máx 20)
//   cursor  — created_at do último vídeo visto (ISO 8601)
//             Se ausente, retorna os mais recentes.
//
// Resposta:
//   { videos, nextCursor, hasMore }
//   nextCursor é null quando não há mais vídeos.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { isBlocked } from "@/lib/block-check";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { idempotencyGate, idempotencyStore, idempotencyFail } from "@/lib/idempotency";
import { safeErrorResponse } from "@/lib/safe-error";
import { extractStoragePathFromUrl } from "@/lib/storage-security";

// SEC-009: Explicit columns for profile_videos — no SELECT *
const VIDEO_COLUMNS = "id, user_id, url, thumbnail_url, duration, created_at";

const DEFAULT_PAGE_SIZE = 8;
const MAX_PAGE_SIZE = 20;

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const cursor = searchParams.get("cursor"); // created_at do último vídeo visto
    const rawLimit = parseInt(searchParams.get("limit") || String(DEFAULT_PAGE_SIZE));
    const limit = Math.min(Math.max(1, rawLimit), MAX_PAGE_SIZE);

    if (!userId) return NextResponse.json({ error: "userId necessário" }, { status: 400 });

    const { data: { user: authUser } } = await supabase.auth.getUser();
    const isOwnProfile = authUser?.id === userId;

    // SEC-004: Block access to profile videos if blocked
    if (authUser && !isOwnProfile) {
      const blocked = await isBlocked(supabase, authUser.id, userId);
      if (blocked) {
        return NextResponse.json({ videos: [], nextCursor: null, hasMore: false, _privacy: { isBlocked: true } });
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
          return NextResponse.json({ videos: [], nextCursor: null, hasMore: false, _privacy: { isRestricted: true } });
        }
      } else {
        return NextResponse.json({ videos: [], nextCursor: null, hasMore: false, _privacy: { isRestricted: true } });
      }
    }

    const blocked = await rateLimitByRule(req, "videos:list", authUser?.id);
    if (blocked) return blocked;

    let query = supabase
      .from("profile_videos")
      .select(VIDEO_COLUMNS)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit + 1); // +1 para detectar se há mais páginas

    // Keyset cursor — retorna vídeos anteriores ao cursor
    if (cursor) {
      query = query.lt("created_at", cursor);
    }

    const { data: rawVideos, error } = await query;
    if (error) throw error;

    const hasMore = (rawVideos?.length ?? 0) > limit;
    const videos = hasMore ? rawVideos!.slice(0, limit) : (rawVideos ?? []);
    const nextCursor = hasMore ? (videos[videos.length - 1] as any).created_at : null;

    return NextResponse.json({ videos, nextCursor, hasMore });
  } catch (error: any) {
    const { message, status } = safeErrorResponse(error, 500, "[profile-videos GET]");
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(_req: NextRequest) {
  // Light / Supabase Free: álbum de vídeos do perfil desabilitado no beta
  return NextResponse.json(
    { error: "Álbum de vídeos do perfil está desabilitado nesta versão beta." },
    { status: 403 }
  );
}

// DELETE /api/profile-videos?id=xxx
// REL-006: Exclusão atômica via rpc_delete_profile_video.
// Deleta vídeo + comentários + reações em transação única.
// Retorna storage_paths para limpeza de storage (best effort).
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const blocked = await rateLimitByRule(req, "videos:delete", user?.id);
    if (blocked) return blocked;

    const idemBlock = await idempotencyGate(req, user.id);
    if (idemBlock) return idemBlock;

    const { searchParams } = new URL(req.url);
    const videoId = searchParams.get("id");
    if (!videoId) return NextResponse.json({ error: "ID necessário" }, { status: 400 });

    // REL-006: operação atômica no banco
    const { data, error } = await supabase
      .rpc("rpc_delete_profile_video", { p_video_id: videoId })
      .maybeSingle();

    if (error) throw error;

    if (!data) throw new Error("RPC retornou vazio");
    const result = data as { ok: boolean; error?: string; storage_path?: string; video_bucket?: string; thumbnail_url?: string };

    if (!result.ok) {
      switch (result.error) {
        case "not_authenticated":
          return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
        case "video_not_found":
          return NextResponse.json({ error: "Vídeo não encontrado" }, { status: 404 });
        default:
          return NextResponse.json({ error: "Não foi possível excluir o vídeo" }, { status: 400 });
      }
    }

    // Limpeza de storage (best effort) — após DB em estado consistente
    const admin = createAdminClient();
    (async () => {
      // Remover vídeo
      if (result.storage_path) {
        try {
          await admin.storage.from(result.video_bucket || "profile-videos").remove([result.storage_path!]);
        } catch { /* silent */ }
      }
      // Remover thumbnail
      if (result.thumbnail_url) {
        try {
          const thumbParsed = extractStoragePathFromUrl(result.thumbnail_url);
          if (thumbParsed) {
            await admin.storage.from(thumbParsed.bucket).remove([thumbParsed.path]);
          }
        } catch { /* silent */ }
      }
    })();

    const responseData = { success: true };
    await idempotencyStore(req, responseData);
    return NextResponse.json(responseData);
  } catch (error: any) {
    await idempotencyFail(req);
    const { message, status } = safeErrorResponse(error, 500, "[profile-videos DELETE]");
    return NextResponse.json({ error: message }, { status });
  }
}