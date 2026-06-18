// ============================================================
// API de reações nos vídeos do perfil
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { isBlocked, getProfileVideoOwnerId } from "@/lib/block-check";
import { rateLimitByRule } from "@/lib/apply-rate-limit";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const blocked = await rateLimitByRule(req, "videos:react", user?.id);
    if (blocked) return blocked;

    const { videoId, type } = await req.json();
    if (!videoId || !type) {
      return NextResponse.json({ error: "videoId e type são obrigatórios" }, { status: 400 });
    }

    // SEC-004: Check bidirectional block with video owner
    const ownerId = await getProfileVideoOwnerId(supabase, videoId);
    if (ownerId && ownerId !== user.id) {
      const blocked = await isBlocked(supabase, user.id, ownerId);
      if (blocked) {
        return NextResponse.json({ error: "Não é possível reagir a este vídeo" }, { status: 403 });
      }
    }

    const { data: existing } = await supabase
      .from("profile_video_reactions")
      .select("id")
      .eq("video_id", videoId)
      .eq("user_id", user.id)
      .eq("type", type)
      .maybeSingle();

    if (existing) {
      const admin = createAdminClient();
      const { error } = await admin
        .from("profile_video_reactions")
        .delete()
        .eq("id", existing.id);

      if (error) throw error;
      return NextResponse.json({ reacted: false });
    } else {
      const { error } = await supabase
        .from("profile_video_reactions")
        .insert({
          video_id: videoId,
          user_id: user.id,
          type,
        });

      if (error) throw error;
      return NextResponse.json({ reacted: true });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}