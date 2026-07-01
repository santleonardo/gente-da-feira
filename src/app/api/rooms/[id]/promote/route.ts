import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { safeErrorResponse } from "@/lib/safe-error";

// REL-006: Promote atômico via rpc_promote_room_member.
// Verifica permissões (creator only) e papéis em transação única.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: roomId } = await params;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const blocked = await rateLimitByRule(req, "rooms:promote", user?.id);
    if (blocked) return blocked;

    const { user_id: targetId, role: newRole } = await req.json();
    if (!targetId) return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 });
    if (!["moderator", "member"].includes(newRole)) {
      return NextResponse.json({ error: "role deve ser 'moderator' ou 'member'" }, { status: 400 });
    }
    if (targetId === user.id) return NextResponse.json({ error: "Ação inválida sobre si mesmo" }, { status: 400 });

    // REL-006: operação atômica no banco
    const { data, error } = await supabase
      .rpc("rpc_promote_room_member", {
        p_room_id: roomId,
        p_target_user_id: targetId,
        p_new_role: newRole,
      })
      .maybeSingle();

    if (error) throw error;

    if (!data) throw new Error("RPC retornou vazio");
    const result = data as { ok: boolean; error?: string; promoted?: boolean; role?: string };

    if (!result.ok) {
      switch (result.error) {
        case "not_authenticated":
          return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
        case "cannot_change_self":
          return NextResponse.json({ error: "Ação inválida sobre si mesmo" }, { status: 400 });
        case "invalid_role":
          return NextResponse.json({ error: "role deve ser 'moderator' ou 'member'" }, { status: 400 });
        case "not_creator":
          return NextResponse.json({ error: "Apenas o criador pode alterar papéis" }, { status: 403 });
        case "not_member":
          return NextResponse.json({ error: "Usuário não é membro desta sala" }, { status: 404 });
        case "cannot_change_creator":
          return NextResponse.json({ error: "Não é possível alterar o papel do criador" }, { status: 403 });
        default:
          return NextResponse.json({ error: "Não foi possível alterar o papel" }, { status: 400 });
      }
    }

    return NextResponse.json({ promoted: true, role: result.role });
  } catch (error) {
    const { message, status } = safeErrorResponse(error, 500, "[room-promote POST]");
    return NextResponse.json({ error: message }, { status });
  }
}