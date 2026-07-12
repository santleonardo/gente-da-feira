import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isRoomModeratorOrAbove } from "@/lib/room-auth";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { idempotencyGate, idempotencyStore, idempotencyFail } from "@/lib/idempotency";
import { safeErrorResponse } from "@/lib/safe-error";

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

    const blocked = await rateLimitByRule(req, "rooms:toggle", user?.id);
    if (blocked) return blocked;

    const idemBlock = await idempotencyGate(req, user.id);
    if (idemBlock) return idemBlock;

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
    const responseData = { is_open };
    await idempotencyStore(req, responseData);
    return NextResponse.json(responseData);
  } catch (error: any) {
    await idempotencyFail(req);
    console.error("[SEC-002 toggle-open POST]", error);
    const { message, status } = safeErrorResponse(error, 500, "[rooms/toggle-open POST]");
    return NextResponse.json({ error: message }, { status });
  }
}
