import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimitByRule } from "@/lib/apply-rate-limit";

// ============================================================
// SEC-002: POST /api/rooms/[id]/leave
//
// Regras de autorização:
//   - Usuário autenticado
//   - Pode sair de qualquer sala da qual é membro
//   - Criador pode sair (deletar a sala é outro endpoint)
//
// Defense-in-depth: RLS em room_members permite DELETE self.
// ============================================================
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: roomId } = await params;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const blocked = await rateLimitByRule(req, "rooms:leave", user?.id);
    if (blocked) return blocked;

    // RLS permite DELETE porque o caller está removendo a própria linha
    const { error } = await supabase
      .from("room_members")
      .delete()
      .eq("room_id", roomId)
      .eq("user_id", user.id);

    if (error) {
      console.error("[SEC-002 leave DELETE]", error);
      throw error;
    }
    return NextResponse.json({ left: true });
  } catch (error: any) {
    console.error("[SEC-002 leave POST]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
