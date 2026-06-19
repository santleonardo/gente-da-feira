// ============================================================
// API de vídeos do perfil
// Máximo: 5 vídeos por perfil, máximo 30 segundos cada
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { isBlocked } from "@/lib/block-check";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { safeErrorResponse } from "@/lib/safe-error";
import { sanitizeMediaUrl } from "@/lib/sanitize";

const MAX_VIDEOS_PER_PROFILE = 5;
const MAX_VIDEO_DURATION = 30;

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (!userId) return NextResponse.json({ error: "userId necessário" }, { status: 400 });

    // SEC-004: Block access to profile videos if blocked
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser && authUser.id !== userId) {
      const blocked = await isBlocked(supabase, authUser.id, userId);
      if (blocked) {
        return NextResponse.json({ videos: [], _privacy: { isBlocked: true } });
      }
    }

    const blocked = await rateLimitByRule(req, "videos:list", authUser?.id);
    if (blocked) return blocked;

    // SEC-003: Select explícito de colunas
    const { data: videos, error } = await supabase
      .from("profile_videos")
      .select("id, user_id, url, storage_path, thumbnail_url, duration, created_at")
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

    const { url, storagePath, thumbnailUrl, duration } = await req.json();
    if (!url) return NextResponse.json({ error: "URL do vídeo é obrigatória" }, { status: 400 });

    // SEC-007: Validar URLs de mídia
    const safeUrl = sanitizeMediaUrl(url, process.env.NEXT_PUBLIC_SUPABASE_URL);
    if (!safeUrl) return NextResponse.json({ error: "URL do vídeo inválida" }, { status: 400 });
    const safeThumb = thumbnailUrl ? sanitizeMediaUrl(thumbnailUrl, process.env.NEXT_PUBLIC_SUPABASE_URL) : "";

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

    // SEC-003: Select explícito no retorno
    const { data: video, error } = await supabase
      .from("profile_videos")
      .insert({
        user_id: user.id,
        url: safeUrl,
        storage_path: storagePath || "",
        thumbnail_url: safeThumb,
        duration: duration || 0,
      })
      .select("id, user_id, url, storage_path, thumbnail_url, duration, created_at")
      .single();

    if (error) throw error;
    return NextResponse.json({ video });
  } catch (error: any) {
    const { message, status } = safeErrorResponse(error, 500, "[profile-videos POST]");
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const blocked = await rateLimitByRule(req, "videos:delete", user?.id);
    if (blocked) return blocked;

    const { searchParams } = new URL(req.url);
    const videoId = searchParams.get("id");
    if (!videoId) return NextResponse.json({ error: "ID necessário" }, { status: 400 });

    const admin = createAdminClient();

    const { data: _video } = await admin
      .from("profile_videos")
      .select("storage_path, thumbnail_url")
      .eq("id", videoId)
      .eq("user_id", user.id)
      .single();

    // Type assertion necessário pois sem tipos gerados o retorno é genérico
    const video = _video as any;

    const { error } = await admin
      .from("profile_videos")
      .delete()
      .eq("id", videoId)
      .eq("user_id", user.id);

    if (error) throw error;

    if (video?.storage_path) {
      try {
        await admin.storage.from("profile-videos").remove([video.storage_path]);
      } catch { /* silent */ }
    }

    if (video?.thumbnail_url) {
      try {
        const thumbPath = video.thumbnail_url.split("/post-photos/")[1];
        if (thumbPath) {
          await admin.storage.from("post-photos").remove([thumbPath]);
        }
      } catch { /* silent */ }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    const { message, status } = safeErrorResponse(error, 500, "[profile-videos DELETE]");
    return NextResponse.json({ error: message }, { status });
  }
}
