import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isRoomModeratorOrAbove } from "@/lib/room-auth";
import { rateLimitByRule } from "@/lib/apply-rate-limit";

// ============================================================
// SEC-002: POST /api/rooms/[id]/kick
// Body: { user_id }
//
// Regras de autorização:
//   - Usuário autenticado
//   - Moderador ou criador da sala
//   - Moderador só pode expulsar membros comuns
//   - Criador pode expulsar qualquer um (exceto a si mesmo)
//
// Defense-in-depth: RLS em room_members bloqueia DELETE não-autorizado.
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

    const blocked = await rateLimitByRule(req, "rooms:kick", user?.id);
    if (blocked) return blocked;

    const { user_id: targetId } = await req.json();
    if (!targetId) return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 });
    if (targetId === user.id) return NextResponse.json({ error: "Você não pode expulsar a si mesmo" }, { status: 400 });

    // SEC-002: Verificar permissão
    const auth = await isRoomModeratorOrAbove(roomId, user.id);
    if (!auth.allowed) {
      return NextResponse.json({ error: auth.reason }, { status: 403 });
    }

    const { data: targetMember } = await supabase
      .from("room_members")
      .select("role")
      .eq("room_id", roomId)
      .eq("user_id", targetId)
      .maybeSingle();

    if (!targetMember) return NextResponse.json({ error: "Usuário não é membro desta sala" }, { status: 404 });

    if (targetMember.role === "creator") {
      return NextResponse.json({ error: "Não é possível expulsar o criador da sala" }, { status: 403 });
    }
    if (auth.membership.role === "moderator" && targetMember.role !== "member") {
      return NextResponse.json({ error: "Moderadores só podem expulsar membros comuns" }, { status: 403 });
    }

    const { error } = await supabase
      .from("room_members")
      .delete()
      .eq("room_id", roomId)
      .eq("user_id", targetId);

    if (error) {
      console.error("[SEC-002 kick DELETE]", error);
      throw error;
    }
    return NextResponse.json({ kicked: true });
  } catch (error: any) {
    console.error("[SEC-002 kick POST]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
