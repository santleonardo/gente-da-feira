import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isRoomModeratorOrAbove } from "@/lib/room-auth";
import { rateLimitByRule } from "@/lib/apply-rate-limit";

// ============================================================
// SEC-002: POST /api/rooms/[id]/ban
// Body: { user_id, duration_days? }
//
// Regras de autorização:
//   - Usuário autenticado
//   - Moderador ou criador da sala
//
// Defense-in-depth: RLS em room_members bloqueia UPDATE
// não-autorizado.
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

    const blocked = await rateLimitByRule(req, "rooms:ban", user?.id);
    if (blocked) return blocked;

    const { user_id: targetId, duration_days } = await req.json();
    if (!targetId) return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 });
    if (targetId === user.id) return NextResponse.json({ error: "Você não pode banir a si mesmo" }, { status: 400 });

    // SEC-002: Verificar permissão via helper centralizado
    const auth = await isRoomModeratorOrAbove(roomId, user.id);
    if (!auth.allowed) {
      return NextResponse.json({ error: auth.reason }, { status: 403 });
    }

    // Buscar o alvo para validar regras de hierarquia
    const { data: targetMember } = await supabase
      .from("room_members")
      .select("id, role")
      .eq("room_id", roomId)
      .eq("user_id", targetId)
      .maybeSingle();

    if (targetMember?.role === "creator") {
      return NextResponse.json({ error: "Não é possível banir o criador da sala" }, { status: 403 });
    }
    // Moderador não pode banir outro moderador
    if (auth.membership.role === "moderator" && targetMember?.role === "moderator") {
      return NextResponse.json({ error: "Moderadores não podem banir outros moderadores" }, { status: 403 });
    }

    let bannedUntil: string | null = null;
    if (duration_days && Number.isFinite(Number(duration_days)) && Number(duration_days) > 0) {
      const expires = new Date();
      expires.setDate(expires.getDate() + Number(duration_days));
      bannedUntil = expires.toISOString();
    }

    if (targetMember) {
      // RLS permite UPDATE porque o caller é moderador/criador
      const { error: updateErr } = await supabase
        .from("room_members")
        .update({ is_banned: true, banned_until: bannedUntil })
        .eq("room_id", roomId)
        .eq("user_id", targetId);

      if (updateErr) {
        console.error("[SEC-002 ban UPDATE]", updateErr);
        return NextResponse.json({ error: "Falha ao banir usuário" }, { status: 500 });
      }
    } else {
      // Alvo nunca foi membro. Inserir como banido.
      // RLS permite INSERT porque o caller é moderador/criador da sala ativa.
      const { error: insertErr } = await supabase.from("room_members").insert({
        room_id: roomId,
        user_id: targetId,
        role: "member",
        is_banned: true,
        banned_until: bannedUntil,
      });

      if (insertErr) {
        console.error("[SEC-002 ban INSERT]", insertErr);
        return NextResponse.json({ error: "Falha ao banir usuário" }, { status: 500 });
      }
    }

    return NextResponse.json({
      banned: true,
      permanent: !bannedUntil,
      banned_until: bannedUntil,
    });
  } catch (error: any) {
    console.error("[SEC-002 ban POST]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ============================================================
// SEC-002: DELETE /api/rooms/[id]/ban → remover banimento
// Body: { user_id }
// ============================================================
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

    // SEC-002: Verificar permissão
    const auth = await isRoomModeratorOrAbove(roomId, user.id);
    if (!auth.allowed) {
      return NextResponse.json({ error: auth.reason }, { status: 403 });
    }

    const { error: updateErr } = await supabase
      .from("room_members")
      .update({ is_banned: false, banned_until: null })
      .eq("room_id", roomId)
      .eq("user_id", targetId);

    if (updateErr) {
      console.error("[SEC-002 unban UPDATE]", updateErr);
      return NextResponse.json({ error: "Falha ao desbanir usuário" }, { status: 500 });
    }

    return NextResponse.json({ unbanned: true });
  } catch (error: any) {
    console.error("[SEC-002 unban DELETE]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
