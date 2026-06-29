// ============================================================
// API de comentários nas fotos do perfil
// SEC-009: Explicit column selection — no SELECT *
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { isBlocked, getProfilePhotoOwnerId } from "@/lib/block-check";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { sanitizePlainText } from "@/lib/sanitize";
import { selectCols } from "@/lib/safe-columns";

// SEC-009: Explicit columns for photo comments and author profiles
const COMMENT_COLUMNS = "id, user_id, photo_id, content, parent_id, created_at";
const AUTHOR_COLS = selectCols(["id", "display_name", "username", "avatar_url"] as const);

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    const photoId = searchParams.get("photoId");

    if (!photoId) return NextResponse.json({ error: "photoId necessário" }, { status: 400 });

    const { data: comments, error } = await supabase
      .from("profile_photo_comments")
      .select(`${COMMENT_COLUMNS}, author:profiles(${AUTHOR_COLS})`)
      .eq("photo_id", photoId)
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

    const blocked = await rateLimitByRule(req, "photos:comment", user?.id);
    if (blocked) return blocked;

    const { photoId, content, parentId } = await req.json();
    if (!photoId || !content?.trim()) {
      return NextResponse.json({ error: "photoId e conteúdo são obrigatórios" }, { status: 400 });
    }
    if (content.trim().length > 300) {
      return NextResponse.json({ error: "Comentário muito longo (máx 300 chars)" }, { status: 400 });
    }

    // SEC-004: Check bidirectional block with photo owner
    const ownerId = await getProfilePhotoOwnerId(supabase, photoId);
    if (ownerId && ownerId !== user.id) {
      const blocked = await isBlocked(supabase, user.id, ownerId);
      if (blocked) {
        return NextResponse.json({ error: "Não é possível comentar nesta foto" }, { status: 403 });
      }
    }

    const { data: comment, error } = await supabase
      .from("profile_photo_comments")
      .insert({
        photo_id: photoId,
        user_id: user.id,
        content: sanitizePlainText(content.trim()),
        parent_id: parentId || null,
      })
      .select(`${COMMENT_COLUMNS}, author:profiles(${AUTHOR_COLS})`)
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
      .from("profile_photo_comments")
      .delete()
      .eq("id", commentId)
      .eq("user_id", user.id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}