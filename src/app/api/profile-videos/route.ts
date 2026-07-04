// ============================================================
// API de vídeos do perfil
// Máximo: 5 vídeos por perfil, máximo 30 segundos cada
// SEC-009: Added privacy check for private profiles
// REL-006: Delete atômico via rpc_delete_profile_video
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { isBlocked } from "@/lib/block-check";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { idempotencyGate, idempotencyStore, idempotencyFail } from "@/lib/idempotency";
import { safeErrorResponse } from "@/lib/safe-error";
import { validateMediaUrl, extractStoragePathFromUrl } from "@/lib/storage-security";

const MAX_VIDEOS_PER_PROFILE = 5;
const MAX_VIDEO_DURATION = 30;

// SEC-009: Explicit columns for profile_videos — no SELECT *
const VIDEO_COLUMNS = "id, user_id, url, thumbnail_url, duration, created_at";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (!userId) return NextResponse.json({ error: "userId necessário" }, { status: 400 });

    const { data: { user: authUser } } = await supabase.auth.getUser();
    const isOwnProfile = authUser?.id === userId;

    // SEC-004: Block access to profile videos if blocked
    if (authUser && !isOwnProfile) {
      const blocked = await isBlocked(supabase, authUser.id, userId);
      if (blocked) {
        return NextResponse.json({ videos: [], _privacy: { isBlocked: true } });
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
          return NextResponse.json({ videos: [], _privacy: { isRestricted: true } });
        }
      } else {
        return NextResponse.json({ videos: [], _privacy: { isRestricted: true } });
      }
    }

    const blocked = await rateLimitByRule(req, "videos:list", authUser?.id);
    if (blocked) return blocked;

    const { data: videos, error } = await supabase
      .from("profile_videos")
      .select(VIDEO_COLUMNS)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ videos: videos || [] });
  } catch (error: any) {
    const { message, status } = safeErrorResponse(error, 500, "[profile-videos GET]");
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const blocked = await rateLimitByRule(req, "videos:create", user?.id);
    if (blocked) return blocked;

    const idemBlock = await idempotencyGate(req, user.id);
    if (idemBlock) return idemBlock;

    const { url, storagePath, thumbnailUrl, duration } = await req.json();
    if (!url) return NextResponse.json({ error: "URL do vídeo é obrigatória" }, { status: 400 });

    // SEC-008: Validar URL do vídeo
    const VIDEO_BUCKETS = new Set(["profile-videos"]);
    const safeUrl = validateMediaUrl(url, {
      allowedBuckets: VIDEO_BUCKETS,
      requireUserId: user.id,
    });
    if (!safeUrl) return NextResponse.json({ error: "URL do vídeo inválida" }, { status: 400 });

    // SEC-008: Derivar storagePath da URL
    const parsedPath = extractStoragePathFromUrl(safeUrl);
    const derivedStoragePath = parsedPath?.path || "";

    // SEC-008: Validar thumbnail
    let safeThumb = "";
    if (thumbnailUrl) {
      safeThumb = validateMediaUrl(thumbnailUrl, {
        allowedBuckets: new Set(["post-photos"]),
        requireUserId: user.id,
      }) || "";
    }

    if (duration > MAX_VIDEO_DURATION) {
      return NextResponse.json({
        error: `Vídeo muito longo. Máximo ${MAX_VIDEO_DURATION} segundos.`
      }, { status: 400 });
    }

    const { count, error: countError } = await supabase
      .from("profile_videos")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);

    if (countError) throw countError;

    if (count !== null && count >= MAX_VIDEOS_PER_PROFILE) {
      return NextResponse.json({
        error: `Limite de ${MAX_VIDEOS_PER_PROFILE} vídeos no perfil atingido. Remova um vídeo para adicionar outro.`
      }, { status: 400 });
    }

    const { data: video, error } = await supabase
      .from("profile_videos")
      .insert({
        user_id: user.id,
        url: safeUrl,
        storage_path: derivedStoragePath,
        thumbnail_url: safeThumb,
        duration: duration || 0,
      })
      .select(VIDEO_COLUMNS)
      .single();

    if (error) throw error;
    const videoData = { video };
    await idempotencyStore(req, videoData);
    return NextResponse.json(videoData);
  } catch (error: any) {
    await idempotencyFail(req);
    const { message, status } = safeErrorResponse(error, 500, "[profile-videos POST]");
    return NextResponse.json({ error: message }, { status });
  }
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