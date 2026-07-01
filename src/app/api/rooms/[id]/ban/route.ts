import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { safeErrorResponse } from "@/lib/safe-error";

// REL-006: Ban/unban atômico via rpc_ban_room_member / rpc_unban_room_member.
// Verifica permissões, papéis e faz update/insert em transação única.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: roomId } = await params;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const blocked = await rateLimitByRule(req, "rooms:ban", user?.id);
    if (blocked) return blocked;

    const { user_id: targetId, duration_days } = await req.json();
    if (!targetId) return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 });
    if (targetId === user.id) return NextResponse.json({ error: "Você não pode banir a si mesmo" }, { status: 400 });

    // REL-006: operação atômica no banco
    const { data, error } = await supabase
      .rpc("rpc_ban_room_member", {
        p_room_id: roomId,
        p_target_user_id: targetId,
        p_duration_days: duration_days || null,
      })
      .maybeSingle();

    if (error) throw error;

    if (!data) throw new Error("RPC retornou vazio");
    const result = data as { ok: boolean; error?: string; banned?: boolean; permanent?: boolean; banned_until?: string | null };

    if (!result.ok) {
      switch (result.error) {
        case "not_authenticated":
          return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
        case "cannot_ban_self":
          return NextResponse.json({ error: "Você não pode banir a si mesmo" }, { status: 400 });
        case "not_member":
          return NextResponse.json({ error: "Você não é membro desta sala" }, { status: 403 });
        case "insufficient_role":
          return NextResponse.json({ error: "Apenas moderadores ou criadores podem banir" }, { status: 403 });
        case "cannot_ban_creator":
          return NextResponse.json({ error: "Não é possível banir o criador da sala" }, { status: 403 });
        case "moderator_cannot_ban_moderator":
          return NextResponse.json({ error: "Moderadores não podem banir outros moderadores" }, { status: 403 });
        default:
          return NextResponse.json({ error: "Falha ao banir usuário" }, { status: 500 });
      }
    }

    return NextResponse.json({
      banned: true,
      permanent: !!result.permanent,
      banned_until: result.banned_until,
    });
  } catch (error) {
    const { message, status } = safeErrorResponse(error, 500, "[room-ban POST]");
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: roomId } = await params;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const blocked = await rateLimitByRule(req, "rooms:ban", user?.id);
    if (blocked) return blocked;

    const { user_id: targetId } = await req.json();

    // REL-006: operação atômica no banco
    const { data, error } = await supabase
      .rpc("rpc_unban_room_member", {
        p_room_id: roomId,
        p_target_user_id: targetId,
      })
      .maybeSingle();

    if (error) throw error;

    if (!data) throw new Error("RPC retornou vazio");
    const result = data as { ok: boolean; error?: string };

    if (!result.ok) {
      switch (result.error) {
        case "insufficient_role":
          return NextResponse.json({ error: "Permissão insuficiente" }, { status: 403 });
        default:
          return NextResponse.json({ error: "Falha ao desbanir usuário" }, { status: 500 });
      }
    }

    return NextResponse.json({ unbanned: true });
  } catch (error) {
    const { message, status } = safeErrorResponse(error, 500, "[room-unban DELETE]");
    return NextResponse.json({ error: message }, { status });
  }
}