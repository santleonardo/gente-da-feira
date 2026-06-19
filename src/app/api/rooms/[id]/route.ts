import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { checkRoomMembership, formatPublicRoomInfo } from "@/lib/room-auth";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { ROOM_SAFE_COLUMNS, selectCols } from "@/lib/safe-columns";
import { safeErrorResponse } from "@/lib/safe-error";
import { extractStoragePathFromUrl } from "@/lib/storage-security";

// ============================================================
// SEC-002/SEC-003: GET /api/rooms/[id] — Buscar dados de uma sala
//
// Regras de autorização:
//   - Usuário autenticado
//   - Membros ativos: recebem dados completos (sem password_hash)
//   - Não-membros: recebem apenas informações PÚBLICAS
//   - Banidos: recebem apenas stub informando banimento
//
// SEC-003: Usa select explícito de colunas — password_hash nunca
// é solicitado ao banco (além do REVOKE via SQL).
// ============================================================
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: roomId } = await params;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const blocked = await rateLimitByRule(req, "rooms:list", user?.id);
    if (blocked) return blocked;

    // Verificar filiação do usuário
    const membership = await checkRoomMembership(roomId, user.id);

    // Se a sala não existe ou está inativa e o usuário não é o criador, 404
    if (!membership.roomExists) {
      return NextResponse.json({ error: "Sala não encontrada" }, { status: 404 });
    }

    // SEC-003: Select explícito — nunca SELECT *
    const { data: _room, error } = await supabase
      .from("rooms")
      .select(`
        id, name, slug, icon, description, type, rules,
        is_active, is_open, max_members, member_count, has_password,
        created_at, created_by,
        creator:profiles!rooms_created_by_fkey(id, display_name, username, avatar_url)
      `)
      .eq("id", roomId)
      .maybeSingle();

    if (error) {
      console.error("[SEC-002 room-details GET query]", error);
      throw error;
    }

    // Type assertion necessário porque select string não é literal inferível
    const room = _room as any;
    if (!room) {
      return NextResponse.json({ error: "Sala não encontrada" }, { status: 404 });
    }

    // Caso 1: usuário banido — retornar stub mínimo
    if (membership.isBanned) {
      return NextResponse.json({
        room: {
          id: room.id,
          name: room.name,
          icon: room.icon,
          is_active: room.is_active,
          isBanned: true,
          isMember: false,
          canJoin: false,
        },
      });
    }

    // Caso 2: usuário não é membro — retornar apenas info pública
    if (!membership.isMember) {
      const publicInfo = formatPublicRoomInfo(room, membership);
      return NextResponse.json({ room: publicInfo });
    }

    // Caso 3: usuário é membro ativo — retornar dados completos
    const memberCount = room.member_count ?? 0;
    const isClosed = room.is_open === false;
    const isFull = room.max_members && memberCount >= room.max_members;

    const formatted = {
      ...room,
      // SEC-003: has_password vem da coluna computada do banco
      has_password: !!room.has_password,
      _count: { members: memberCount },
      memberCount,
      myRole: membership.role,
      isBanned: false,
      isMember: true,
      canJoin: false,
      isOpen: room.is_open !== false,
      creator: room.creator,
    };

    return NextResponse.json({ room: formatted });
  } catch (error) {
    const { message, status } = safeErrorResponse(error, 500, "[room-details GET]");
    return NextResponse.json({ error: message }, { status });
  }
}

// ============================================================
// SEC-002/SEC-003: DELETE /api/rooms/[id] — Excluir sala
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

    const blocked = await rateLimitByRule(req, "rooms:delete", user?.id);
    if (blocked) return blocked;

    // 1. Buscar a sala (apenas colunas seguras)
    const { data: _room, error: roomErr } = await supabase
      .from("rooms")
      .select("id, name, created_by, is_active")
      .eq("id", roomId)
      .maybeSingle();

    // Type assertion necessário
    const room = _room as any;
    if (roomErr || !room) {
      return NextResponse.json({ error: "Sala não encontrada" }, { status: 404 });
    }

    // 2. Verificar permissão: apenas o criador pode excluir
    if (room.created_by !== user.id) {
      const { data: memberRecord } = await supabase
        .from("room_members")
        .select("role")
        .eq("room_id", roomId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (!memberRecord || memberRecord.role !== "creator") {
        return NextResponse.json(
          { error: "Apenas o criador pode excluir esta sala" },
          { status: 403 }
        );
      }
    }

    // 3. Excluir em cascata: messages → room_members → room
    const deletionLog: string[] = [];
    const deletionErrors: string[] = [];

    const admin = createAdminClient();

    // 3a. Buscar mídia das mensagens antes de deletar
    try {
      const { data: msgs } = await admin
        .from("messages")
        .select("media_url")
        .eq("room_id", roomId)
        .not("media_url", "is", null);

      if (msgs && msgs.length > 0) {
        for (const m of msgs) {
          if (m.media_url) {
            try {
              const parsed = extractStoragePathFromUrl(m.media_url);
              if (parsed) {
                await admin.storage.from(parsed.bucket).remove([parsed.path]);
              }
            } catch {
              /* silent — best effort */
            }
          }
        }
      }
    } catch (err: any) {
      // SEC-003: Não expor detalhes do erro no log
      console.warn("[room-delete] erro ao buscar mídia para limpeza");
    }

    // 3b. Excluir mensagens da sala
    const { error: msgErr } = await admin.from("messages").delete().eq("room_id", roomId);
    if (msgErr) {
      console.error("[room-delete] erro ao excluir mensagens");
      deletionErrors.push("mensagens: falha na exclusão");
    } else {
      deletionLog.push("mensagens: excluídas");
    }

    // 3c. Excluir membros da sala
    const { error: membersErr } = await admin.from("room_members").delete().eq("room_id", roomId);
    if (membersErr) {
      console.error("[room-delete] erro ao excluir membros");
      deletionErrors.push("membros: falha na exclusão");
    } else {
      deletionLog.push("membros: excluídos");
    }

    // 3d. Excluir a sala
    const { error: deleteErr } = await admin.from("rooms").delete().eq("id", roomId);
    if (deleteErr) {
      console.error("[room-delete] erro ao excluir sala");
      // SEC-003: Não expor detalhes do erro do banco
      return NextResponse.json(
        {
          error: "Falha ao excluir sala",
          partial: true,
          deletionLog,
          deletionErrors: deletionErrors.length > 0 ? deletionErrors : undefined,
        },
        { status: 500 }
      );
    }
    deletionLog.push("sala: excluída");

    return NextResponse.json({
      deleted: true,
      roomId,
      roomName: room.name,
      deletionLog,
      deletionErrors: deletionErrors.length > 0 ? deletionErrors : undefined,
    });
  } catch (error) {
    const { message, status } = safeErrorResponse(error, 500, "[room-delete]");
    return NextResponse.json({ error: message }, { status });
  }
}