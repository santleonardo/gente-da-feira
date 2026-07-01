import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { safeErrorResponse } from "@/lib/safe-error";

// REL-006: Saída da sala atômica via rpc_leave_room.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: roomId } = await params;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const blocked = await rateLimitByRule(req, "rooms:leave", user?.id);
    if (blocked) return blocked;

    // REL-006: operação atômica no banco
    const { data, error } = await supabase
      .rpc("rpc_leave_room", { p_room_id: roomId })
      .maybeSingle();

    if (error) throw error;

    if (!data) throw new Error("RPC retornou vazio");
    const result = data as { ok: boolean; error?: string; left?: boolean };

    if (!result.ok) {
      switch (result.error) {
        case "not_authenticated":
          return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
        case "creator_cannot_leave":
          return NextResponse.json({ error: "O criador não pode sair da sala" }, { status: 400 });
        case "not_member":
          return NextResponse.json({ error: "Você não é membro desta sala" }, { status: 404 });
        default:
          return NextResponse.json({ error: "Não foi possível sair da sala" }, { status: 400 });
      }
    }

    return NextResponse.json({ left: true });
  } catch (error: any) {
    const { message, status } = safeErrorResponse(error, 500, "[room-leave POST]");
    return NextResponse.json({ error: message }, { status });
  }
}