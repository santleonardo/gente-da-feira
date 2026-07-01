import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isBlocked } from "@/lib/block-check";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { safeErrorResponse } from "@/lib/safe-error";
import { checkPostVisibility } from "@/lib/content-visibility";

const VALID_TYPES = ["like", "laugh", "sad", "wow", "angry", "love"];

// REL-003: Toggle de reação totalmente atômico via RPC
// (public.rpc_toggle_comment_reaction). Elimina a race condition do
// padrão anterior "SELECT existing → INSERT/DELETE".
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const blocked = await rateLimitByRule(req, "reactions:comment", user?.id);
    if (blocked) return blocked;

    const { commentId, type } = await req.json();
    if (!commentId) return NextResponse.json({ error: "commentId obrigatório" }, { status: 400 });
    if (!type || !VALID_TYPES.includes(type)) return NextResponse.json({ error: "Tipo de reação inválido" }, { status: 400 });

    // SEC-010: Check parent post visibility before allowing comment reaction.
    // Prevents reacting to comments on followers-only / private posts.
    const { data: comment } = await supabase
      .from("comments")
      .select("author_id, post_id")
      .eq("id", commentId)
      .eq("is_deleted", false)
      .maybeSingle();

    if (comment?.post_id) {
      const postVis = await checkPostVisibility(supabase, comment.post_id, user.id);
      if (!postVis.allowed) {
        return NextResponse.json({ error: "Comentário não encontrado" }, { status: 404 });
      }
    }

    // SEC-004: Check bidirectional block with comment author
    if (comment && comment.author_id !== user.id) {
      const blocked = await isBlocked(supabase, user.id, comment.author_id);
      if (blocked) {
        return NextResponse.json({ error: "Não é possível reagir a este comentário" }, { status: 403 });
      }
    }

    // REL-003: operação atômica no banco — sem janela de corrida entre
    // leitura e escrita.
    const { data, error } = await supabase
      .rpc("rpc_toggle_comment_reaction", { p_comment_id: commentId, p_type: type })
      .maybeSingle();

    if (error) throw error;

    if (!data) throw new Error("RPC retornou vazio");
    const result = data as { ok: boolean; error?: string; reacted?: boolean };
    if (!result.ok) {
      if (result.error === "not_authenticated") {
        return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
      }
      return NextResponse.json({ error: "Não foi possível processar a reação" }, { status: 400 });
    }

    return NextResponse.json({ reacted: !!result.reacted });
  } catch (error) {
    const { message, status } = safeErrorResponse(error, 500, "[comments/reaction POST]");
    return NextResponse.json({ error: message }, { status });
  }
}
