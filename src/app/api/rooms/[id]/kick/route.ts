import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { safeErrorResponse } from "@/lib/safe-error";

// REL-006: Kick atômico via rpc_kick_room_member.
// Verifica permissões e papéis em transação única.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: roomId } = await params;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const blocked = await rateLimitByRule(req, "rooms:kick", user?.id);
    if (blocked) return blocked;

    const { user_id: targetId } = await req.json();
    if (!targetId) return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 });
    if (targetId === user.id) return NextResponse.json({ error: "Você não pode expulsar a si mesmo" }, { status: 400 });

    // REL-006: operação atômica no banco
    const { data, error } = await supabase
      .rpc("rpc_kick_room_member", {
        p_room_id: roomId,
        p_target_user_id: targetId,
      })
      .maybeSingle();

    if (error) throw error;

    if (!data) throw new Error("RPC retornou vazio");
    const result = data as { ok: boolean; error?: string; kicked?: boolean };

    if (!result.ok) {
      switch (result.error) {
        case "not_authenticated":
          return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
        case "cannot_kick_self":
          return NextResponse.json({ error: "Você não pode expulsar a si mesmo" }, { status: 400 });
        case "insufficient_role":
          return NextResponse.json({ error: "Permissão insuficiente" }, { status: 403 });
        case "not_member":
          return NextResponse.json({ error: "Usuário não é membro desta sala" }, { status: 404 });
        case "cannot_kick_creator":
          return NextResponse.json({ error: "Não é possível expulsar o criador da sala" }, { status: 403 });
        case "moderator_cannot_kick_moderator":
          return NextResponse.json({ error: "Moderadores só podem expulsar membros comuns" }, { status: 403 });
        default:
          return NextResponse.json({ error: "Não foi possível expulsar" }, { status: 400 });
      }
    }

    return NextResponse.json({ kicked: true });
  } catch (error) {
    const { message, status } = safeErrorResponse(error, 500, "[room-kick POST]");
    return NextResponse.json({ error: message }, { status });
  }
}