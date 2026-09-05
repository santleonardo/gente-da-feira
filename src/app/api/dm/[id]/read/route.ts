import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { safeErrorResponse } from "@/lib/safe-error";

/**
 * POST /api/dm/[id]/read
 * Marca a conversa como lida para o usuário atual
 * (atualiza initiator_last_read_at ou receiver_last_read_at).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const blocked = await rateLimitByRule(req, "dm:list", user.id);
    if (blocked) return blocked;

    const { data: chat, error } = await supabase
      .from("direct_chats")
      .select("id, initiator_id, receiver_id")
      .eq("id", id)
      .or(`initiator_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .maybeSingle();

    if (error) throw error;
    if (!chat) return NextResponse.json({ error: "Conversa não encontrada" }, { status: 404 });

    const now = new Date().toISOString();
    const field =
      chat.initiator_id === user.id ? "initiator_last_read_at" : "receiver_last_read_at";

    const { error: upErr } = await supabase
      .from("direct_chats")
      .update({ [field]: now })
      .eq("id", id);

    // Se a coluna ainda não existe, não quebra o app
    if (upErr) {
      const msg = String(upErr.message || "");
      if (msg.includes("initiator_last_read_at") || msg.includes("receiver_last_read_at") || msg.includes("column")) {
        return NextResponse.json({ ok: true, skipped: true });
      }
      throw upErr;
    }

    return NextResponse.json({ ok: true, readAt: now });
  } catch (error) {
    const { message, status } = safeErrorResponse(error, 500, "[dm/read POST]");
    return NextResponse.json({ error: message }, { status });
  }
}
