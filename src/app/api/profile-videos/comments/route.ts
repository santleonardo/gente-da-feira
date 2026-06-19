// ============================================================
// API de comentários nos vídeos do perfil
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { isBlocked, getProfileVideoOwnerId } from "@/lib/block-check";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { sanitizePlainText } from "@/lib/sanitize";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    const videoId = searchParams.get("videoId");

    if (!videoId) return NextResponse.json({ error: "videoId necessário" }, { status: 400 });

    const { data: comments, error } = await supabase
      .from("profile_video_comments")
      .select(`
        *,
        author:profiles(id, display_name, username, avatar_url)
      `)
      .eq("video_id", videoId)
      .order("created_at", { ascending: true });

    if (error) throw error;
    return NextResponse.json({ comments: comments || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const blocked = await rateLimitByRule(req, "videos:comment", user?.id);
    if (blocked) return blocked;

    const { videoId, content, parentId } = await req.json();
    if (!videoId || !content?.trim()) {
      return NextResponse.json({ error: "videoId e conteúdo são obrigatórios" }, { status: 400 });
    }
    if (content.trim().length > 300) {
      return NextResponse.json({ error: "Comentário muito longo (máx 300 chars)" }, { status: 400 });
    }

    // SEC-004: Check bidirectional block with video owner
    const ownerId = await getProfileVideoOwnerId(supabase, videoId);
    if (ownerId && ownerId !== user.id) {
      const blocked = await isBlocked(supabase, user.id, ownerId);
      if (blocked) {
        return NextResponse.json({ error: "Não é possível comentar neste vídeo" }, { status: 403 });
      }
    }

    const { data: comment, error } = await supabase
      .from("profile_video_comments")
      .insert({
        video_id: videoId,
        user_id: user.id,
        content: sanitizePlainText(content.trim()),
        parent_id: parentId || null,
      })
      .select(`
        *,
        author:profiles(id, display_name, username, avatar_url)
      `)
      .single();

    if (error) throw error;
    return NextResponse.json({ comment });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const blocked = await rateLimitByRule(req, "comments:delete", user?.id);
    if (blocked) return blocked;

    const { searchParams } = new URL(req.url);
    const commentId = searchParams.get("commentId");
    if (!commentId) return NextResponse.json({ error: "commentId necessário" }, { status: 400 });

    const admin = createAdminClient();
    const { error } = await admin
      .from("profile_video_comments")
      .delete()
      .eq("id", commentId)
      .eq("user_id", user.id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
