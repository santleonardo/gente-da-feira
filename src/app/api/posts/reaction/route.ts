import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { dispatchPushForNotification } from "@/lib/push-dispatch";
import { isBlocked, getPostAuthorId } from "@/lib/block-check";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { safeErrorResponse } from "@/lib/safe-error";

const VALID_TYPES = ["like", "laugh", "sad", "wow", "angry", "love"];

// REL-003: Toggle de reação totalmente atômico via RPC
// (public.rpc_toggle_post_reaction). Elimina a race condition do
// padrão anterior "SELECT existing → INSERT/DELETE", onde duplo-tap
// concorrente podia gerar reações duplicadas e contadores incorretos.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const blocked = await rateLimitByRule(req, "reactions:post", user?.id);
    if (blocked) return blocked;

    const { postId, type = "like" } = await req.json();
    if (!postId) return NextResponse.json({ error: "postId obrigatório" }, { status: 400 });
    if (!VALID_TYPES.includes(type)) return NextResponse.json({ error: "Tipo de reação inválido" }, { status: 400 });

    // SEC-004: Check bidirectional block with post author
    const authorId = await getPostAuthorId(supabase, postId);
    if (authorId && authorId !== user.id) {
      const isUserBlocked = await isBlocked(supabase, user.id, authorId);
      if (isUserBlocked) {
        return NextResponse.json({ error: "Não é possível reagir a este post" }, { status: 403 });
      }
    }

    // REL-003: operação atômica no banco — sem janela de corrida entre
    // leitura e escrita.
    const { data, error } = await supabase
      .rpc("rpc_toggle_post_reaction", { p_post_id: postId, p_type: type })
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

    // Notificação só existe quando a reação foi adicionada (reacted: true)
    if (result.reacted) {
      // Busca a notificação criada pelo trigger para disparar push.
      // O trigger notify_new_reaction() cria a notificação — buscamos a
      // mais recente para este (actor, post) antes de disparar o push.
      const { data: notif } = await supabase
        .from("notifications")
        .select("id")
        .eq("type", "reaction")
        .eq("actor_id", user.id)
        .eq("post_id", postId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (notif?.id) {
        // Fire-and-forget — não bloqueia a resposta
        dispatchPushForNotification(notif.id).catch(() => {});
      }
    }

    return NextResponse.json({ reacted: !!result.reacted });
  } catch (error) {
    const { message, status } = safeErrorResponse(error, 500, "[posts/reaction POST]");
    return NextResponse.json({ error: message }, { status });
  }
}
