import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isRoomModeratorOrAbove } from "@/lib/room-auth";

// ============================================================
// SEC-002: POST /api/rooms/[id]/toggle-open
// Body: { is_open: boolean }
//
// Regras de autorização:
//   - Usuário autenticado
//   - Moderador ou criador da sala
//
// Defense-in-depth: RLS em rooms bloqueia UPDATE não-autorizado.
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

    const { is_open } = await req.json();
    if (typeof is_open !== "boolean") {
      return NextResponse.json({ error: "is_open deve ser boolean" }, { status: 400 });
    }

    // SEC-002: Verificar permissão
    const auth = await isRoomModeratorOrAbove(roomId, user.id);
    if (!auth.allowed) {
      return NextResponse.json({ error: auth.reason }, { status: 403 });
    }

    // RLS em rooms permite UPDATE porque o caller é moderador/criador
    const { error } = await supabase
      .from("rooms")
      .update({ is_open })
      .eq("id", roomId);

    if (error) {
      console.error("[SEC-002 toggle-open UPDATE]", error);
      throw error;
    }
    return NextResponse.json({ is_open });
  } catch (error: any) {
    console.error("[SEC-002 toggle-open POST]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
