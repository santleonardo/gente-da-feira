import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { dispatchPushForNotification } from "@/lib/push-dispatch";
import { isBlocked, getPostAuthorId } from "@/lib/block-check";
import { rateLimitByRule } from "@/lib/apply-rate-limit";

const VALID_TYPES = ["like", "laugh", "sad", "wow", "angry", "love"];

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

    const { data: existing } = await supabase
      .from("reactions")
      .select("id")
      .eq("post_id", postId)
      .eq("user_id", user.id)
      .eq("type", type)
      .maybeSingle();

    if (existing) {
      await supabase.from("reactions").delete().eq("id", existing.id);
      return NextResponse.json({ reacted: false });
    }

    // Insere reação
    await supabase.from("reactions").insert({ post_id: postId, user_id: user.id, type });

    // Busca notificação criada pelo trigger para disparar push
    // O trigger notify_new_reaction() cria a notificação — aguardamos até 500ms
    // para ela aparecer antes de disparar o push
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

    return NextResponse.json({ reacted: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
