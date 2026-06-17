import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isRoomCreator } from "@/lib/room-auth";

// ============================================================
// SEC-002: POST /api/rooms/[id]/promote
// Body: { user_id, role: 'moderator' | 'member' }
//
// Regras de autorização:
//   - Usuário autenticado
//   - Apenas o CRIADOR pode promover/rebaixar moderadores
//
// Defense-in-depth: RLS em room_members bloqueia UPDATE
// não-autorizado. Mesmo se um moderador chamar este endpoint,
// o banco rejeitará o UPDATE.
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

    const { user_id: targetId, role: newRole } = await req.json();
    if (!targetId) return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 });
    if (!["moderator", "member"].includes(newRole)) {
      return NextResponse.json({ error: "role deve ser 'moderator' ou 'member'" }, { status: 400 });
    }
    if (targetId === user.id) return NextResponse.json({ error: "Ação inválida sobre si mesmo" }, { status: 400 });

    // SEC-002: Apenas o criador pode promover
    const auth = await isRoomCreator(roomId, user.id);
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
    if (targetMember.role === "creator") return NextResponse.json({ error: "Não é possível alterar o papel do criador" }, { status: 403 });

    const { error } = await supabase
      .from("room_members")
      .update({ role: newRole })
      .eq("room_id", roomId)
      .eq("user_id", targetId);

    if (error) {
      console.error("[SEC-002 promote UPDATE]", error);
      throw error;
    }
    return NextResponse.json({ promoted: true, role: newRole });
  } catch (error: any) {
    console.error("[SEC-002 promote POST]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
