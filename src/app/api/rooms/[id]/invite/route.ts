import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRoomMembership } from "@/lib/room-auth";
import { isBlocked } from "@/lib/block-check";
import { rateLimitByRule } from "@/lib/apply-rate-limit";

// ============================================================
// SEC-002: POST /api/rooms/[id]/invite
// Body: { user_id }
//
// Regras de autorização:
//   - Usuário autenticado
//   - Membro ativo da sala (não banido)
//   - Sala ativa
//   - Se sala fechada (is_open=false): apenas criador/moderador
//   - Não exceder max_members
//
// Defense-in-depth: RLS em room_members bloqueia INSERT não-autorizado.
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

    const blocked = await rateLimitByRule(req, "rooms:invite", user?.id);
    if (blocked) return blocked;

    const { user_id: targetId } = await req.json();
    if (!targetId) return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 });
    if (targetId === user.id) return NextResponse.json({ error: "Você não pode convidar a si mesmo" }, { status: 400 });

    // SEC-004: Check bidirectional block with target
    const isUserBlocked = await isBlocked(supabase, user.id, targetId);
    if (isUserBlocked) {
      return NextResponse.json({ error: "Não é possível convidar este usuário" }, { status: 403 });
    }

    // SEC-002: Verificar filiação do caller
    const membership = await checkRoomMembership(roomId, user.id);

    if (!membership.roomExists || !membership.roomIsActive) {
      return NextResponse.json({ error: "Sala não encontrada ou inativa" }, { status: 404 });
    }
    if (membership.isBanned) {
      return NextResponse.json({ error: "Você foi banido desta sala" }, { status: 403 });
    }
    if (!membership.isMember) {
      return NextResponse.json({ error: "Você precisa ser membro para convidar" }, { status: 403 });
    }

    // Sala fechada: só creator/moderator pode convidar
    if (!membership.roomIsOpen && membership.role !== "creator" && membership.role !== "moderator") {
      return NextResponse.json(
        { error: "Sala fechada — apenas moderadores podem convidar" },
        { status: 403 }
      );
    }

    // Verifica capacidade
    if (membership.isFull) {
      return NextResponse.json({ error: "Sala lotada" }, { status: 403 });
    }

    // Verifica se alvo já é membro ou banido
    const { data: existingTarget } = await supabase
      .from("room_members")
      .select("id, is_banned, banned_until, role")
      .eq("room_id", roomId)
      .eq("user_id", targetId)
      .maybeSingle();

    if (existingTarget) {
      if (existingTarget.is_banned) {
        return NextResponse.json({ error: "Este usuário está banido da sala" }, { status: 403 });
      }
      return NextResponse.json({ error: "Usuário já é membro desta sala" }, { status: 400 });
    }

    // Adiciona como membro
    // RLS permite o INSERT porque o caller é moderador/criador da sala ativa
    // (caso sala fechada) OU porque a sala está aberta e ativa (caso sala aberta).
    const { error } = await supabase.from("room_members").insert({
      room_id: roomId,
      user_id: targetId,
      role: "member",
    });

    if (error) {
      console.error("[SEC-002 invite INSERT]", error);
      // Se RLS bloqueou (ex: condições mudaram entre checagem e INSERT)
      if (error.code === "42501" || error.message.includes("row-level security")) {
        return NextResponse.json(
          { error: "Não foi possível convidar este usuário (permissão negada)" },
          { status: 403 }
        );
      }
      throw error;
    }
    return NextResponse.json({ invited: true });
  } catch (error: any) {
    console.error("[SEC-002 invite POST]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
