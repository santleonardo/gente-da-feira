import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isBlocked } from "@/lib/block-check";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { safeErrorResponse } from "@/lib/safe-error";

// ============================================================
// SEC-002/REL-005: POST /api/rooms/[id]/invite
// Body: { user_id }
//
// REL-005: A inserção do convidado é executada inteiramente dentro
// da RPC public.rpc_admin_add_room_member, que trava a MESMA linha
// de rooms usada por rpc_join_room (SELECT ... FOR UPDATE). Isso
// serializa "moderador convida X" contra "X se auto-junta" — não
// importa qual caminho vence a corrida, nunca há estouro de
// max_members nem filiação duplicada.
//
// A função também reautoriza o chamador internamente (defense-in-depth),
// então a checagem feita aqui na API é a primeira camada (resposta
// rápida e amigável), e a RPC é a garantia final.
// ============================================================
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: roomId } = await params;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const blocked = await rateLimitByRule(req, "rooms:invite", user?.id);
    if (blocked) return blocked;

    const { user_id: targetId } = await req.json();
    if (!targetId) return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 });
    if (targetId === user.id) return NextResponse.json({ error: "Você não pode convidar a si mesmo" }, { status: 400 });

    // SEC-004: Check bidirectional block with target
    const isUserBlocked = await isBlocked(supabase, user.id, targetId);
    if (isUserBlocked) {
      return NextResponse.json({ error: "Não é possível convidar este usuário" }, { status: 403 });
    }

    // REL-005: convite + checagem de capacidade + reautorização do
    // chamador, tudo atômico dentro da RPC.
    const { data, error } = await supabase
      .rpc("rpc_admin_add_room_member", { p_room_id: roomId, p_target_user_id: targetId })
      .maybeSingle();

    if (error) throw error;

    if (!data) throw new Error("RPC retornou vazio");
    const result = data as { ok: boolean; invited?: boolean; error?: string };

    if (result.ok) {
      return NextResponse.json({ invited: true });
    }

    switch (result.error) {
      case "not_authenticated":
        return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

      case "cannot_invite_self":
        return NextResponse.json({ error: "Você não pode convidar a si mesmo" }, { status: 400 });

      case "room_not_found":
        return NextResponse.json({ error: "Sala não encontrada ou inativa" }, { status: 404 });

      case "room_inactive":
        return NextResponse.json({ error: "Sala não encontrada ou inativa" }, { status: 404 });

      case "caller_not_member":
        return NextResponse.json({ error: "Você precisa ser membro para convidar" }, { status: 403 });

      case "closed_room_requires_moderator":
        return NextResponse.json(
          { error: "Sala fechada — apenas moderadores podem convidar" },
          { status: 403 }
        );

      case "target_banned":
        return NextResponse.json({ error: "Este usuário está banido da sala" }, { status: 403 });

      case "already_member":
        return NextResponse.json({ error: "Usuário já é membro desta sala" }, { status: 400 });

      case "room_full":
        return NextResponse.json({ error: "Sala lotada" }, { status: 403 });

      default:
        return NextResponse.json(
          { error: "Não foi possível convidar este usuário (permissão negada)" },
          { status: 403 }
        );
    }
  } catch (error) {
    const { message, status } = safeErrorResponse(error, 500, "[SEC-002 invite POST]");
    return NextResponse.json({ error: message }, { status });
  }
}
