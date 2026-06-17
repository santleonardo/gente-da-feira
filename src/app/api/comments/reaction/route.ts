import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isBlocked } from "@/lib/block-check";

const VALID_TYPES = ["like", "laugh", "sad", "wow", "angry", "love"];

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const { commentId, type } = await req.json();
    if (!commentId) return NextResponse.json({ error: "commentId obrigatório" }, { status: 400 });
    if (!type || !VALID_TYPES.includes(type)) return NextResponse.json({ error: "Tipo de reação inválido" }, { status: 400 });

    // SEC-004: Check bidirectional block with comment author
    const { data: comment } = await supabase
      .from("comments")
      .select("author_id")
      .eq("id", commentId)
      .eq("is_deleted", false)
      .maybeSingle();

    if (comment && comment.author_id !== user.id) {
      const blocked = await isBlocked(supabase, user.id, comment.author_id);
      if (blocked) {
        return NextResponse.json({ error: "Não é possível reagir a este comentário" }, { status: 403 });
      }
    }

    const { data: existing } = await supabase.from("reactions").select("id").eq("comment_id", commentId).eq("user_id", user.id).eq("type", type).maybeSingle();

    if (existing) {
      const { error } = await supabase.from("reactions").delete().eq("id", existing.id);
      if (error) throw error;
      return NextResponse.json({ reacted: false });
    } else {
      const { error } = await supabase.from("reactions").insert({ comment_id: commentId, user_id: user.id, type });
      if (error) throw error;
      return NextResponse.json({ reacted: true });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}