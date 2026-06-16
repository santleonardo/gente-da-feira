import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

// GET /api/rooms/[id] — Buscar dados completos de uma sala
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: roomId } = await params;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    // Tentar com admin client primeiro para dados completos
    const fetchRoom = async (client: any) => {
      const { data: room, error } = await client
        .from("rooms")
        .select(`
          *,
          room_members(count),
          creator:profiles!rooms_created_by_fkey(id, display_name, username, avatar_url)
        `)
        .eq("id", roomId)
        .single();

      if (error) throw error;
      return room;
    };

    let room: any;
    try {
      const admin = createAdminClient();
      room = await fetchRoom(admin);
    } catch {
      room = await fetchRoom(supabase);
    }

    if (!room) return NextResponse.json({ error: "Sala não encontrada" }, { status: 404 });

    // Verificar se o usuário é membro e qual é o seu role
    const { data: memberRecord } = await supabase
      .from("room_members")
      .select("id, role, is_banned")
      .eq("room_id", roomId)
      .eq("user_id", user.id)
      .maybeSingle();

    const memberCount = room.member_count || room.room_members?.[0]?.count || 0;
    const isClosed = room.is_open === false;
    const isFull = room.max_members && memberCount >= room.max_members;

    const isBanned = memberRecord?.is_banned || false;
    const isMember = !!memberRecord && !memberRecord.is_banned;
    const formatted = {
      ...room,
      password_hash: undefined,
      has_password: !!room.password_hash,
      _count: { members: room.room_members?.[0]?.count || 0 },
      memberCount,
      room_members: undefined,
      myRole: memberRecord?.role || null,
      isBanned,
      isMember,
      canJoin: !isMember && !isBanned && room.is_active && !isClosed && !isFull,
      isOpen: room.is_open !== false,
      creator: room.creator,
    };

    return NextResponse.json({ room: formatted });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/rooms/[id] — Excluir sala (somente creator)
// Exclusão em cascata: messages → room_members → room
// (room_bans é uma VIEW sobre room_members; convites foram removidos do schema)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: roomId } = await params;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    // 1. Buscar a sala e verificar se é o criador
    const { data: room, error: roomErr } = await supabase
      .from("rooms")
      .select("id, name, created_by, is_active")
      .eq("id", roomId)
      .single();

    if (roomErr || !room) {
      return NextResponse.json({ error: "Sala não encontrada" }, { status: 404 });
    }

    if (room.created_by !== user.id) {
      // Verificar via role no room_members como fallback
      const { data: memberRecord } = await supabase
        .from("room_members")
        .select("role")
        .eq("room_id", roomId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (!memberRecord || memberRecord.role !== "creator") {
        return NextResponse.json({ error: "Apenas o criador pode excluir esta sala" }, { status: 403 });
      }
    }

    // Rastrear progresso da exclusão para relatório de erros parciais
    const deletionLog: string[] = [];
    const deletionErrors: string[] = [];

    // Helper para tentar excluir com fallback para admin client
    const deleteWithFallback = async (table: string, column: string, value: string, label: string) => {
      const { error } = await supabase.from(table).delete().eq(column, value);
      if (error) {
        console.error(`Erro ao excluir ${label}:`, error.message);
        try {
          const admin = createAdminClient();
          const { error: adminErr } = await admin.from(table).delete().eq(column, value);
          if (adminErr) throw adminErr;
          deletionLog.push(`${label}: excluído via admin`);
        } catch (adminErr: any) {
          console.error(`Erro admin ao excluir ${label}:`, adminErr.message);
          deletionErrors.push(`${label}: ${adminErr.message}`);
        }
      } else {
        deletionLog.push(`${label}: excluído`);
      }
    };

    // 2. Excluir em cascata na ordem correta para evitar erros de FK
    // Ordem: messages → room_members → room
    // Observação: "room_bans" é uma VIEW derivada de room_members (não é mais
    // uma tabela própria), então é esvaziada automaticamente ao excluir os
    // registros de room_members abaixo — não requer exclusão separada.
    // A tabela "room_invites" foi removida do schema por estar órfã (nunca era
    // populada pelas APIs de convite, que inserem direto em room_members).

    // 2a. Excluir mensagens da sala
    await deleteWithFallback("messages", "room_id", roomId, "mensagens");

    // 2b. Excluir membros da sala (inclui banidos, moderadores, etc.)
    await deleteWithFallback("room_members", "room_id", roomId, "membros");

    // 2c. Excluir a sala propriamente dita
    const { error: deleteErr } = await supabase
      .from("rooms")
      .delete()
      .eq("id", roomId);

    if (deleteErr) {
      try {
        const admin = createAdminClient();
        const { error: adminDeleteErr } = await admin
          .from("rooms")
          .delete()
          .eq("id", roomId);
        if (adminDeleteErr) throw adminDeleteErr;
        deletionLog.push("sala: excluída via admin");
      } catch (adminErr: any) {
        return NextResponse.json({
          error: `Falha ao excluir sala: ${adminErr.message}`,
          partial: true,
          deletionLog,
          deletionErrors,
        }, { status: 500 });
      }
    } else {
      deletionLog.push("sala: excluída");
    }

    // Se houve erros parciais mas a sala foi excluída, avisar
    if (deletionErrors.length > 0) {
      console.warn("Exclusão parcial — erros:", deletionErrors);
    }

    return NextResponse.json({
      deleted: true,
      roomId,
      roomName: room.name,
      deletionLog,
      deletionErrors: deletionErrors.length > 0 ? deletionErrors : undefined,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
