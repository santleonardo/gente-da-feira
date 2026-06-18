import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { checkRoomMembership, formatPublicRoomInfo } from "@/lib/room-auth";
import { rateLimitByRule } from "@/lib/apply-rate-limit";

// ============================================================
// SEC-002: GET /api/rooms/[id] — Buscar dados de uma sala
//
// Regras de autorização:
//   - Usuário autenticado
//   - Membros ativos: recebem dados completos (sem password_hash)
//   - Não-membros: recebem apenas informações PÚBLICAS
//   - Banidos: recebem apenas stub informando banimento
//
// NÃO usa createAdminClient() no GET — apenas o client autenticado
// para que o RLS em rooms seja aplicado.
//
// O password_hash é revogado via RLS (REVOKE SELECT) — defense-in-depth.
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

    // Buscar a sala com o client autenticado (RLS aplica)
    const { data: room, error } = await supabase
      .from("rooms")
      .select(`
        id, name, slug, icon, description, type, rules,
        is_active, is_open, max_members, member_count,
        created_at, created_by,
        creator:profiles!rooms_created_by_fkey(id, display_name, username, avatar_url)
      `)
      .eq("id", roomId)
      .maybeSingle();

    if (error) {
      console.error("[SEC-002 room-details GET query]", error);
      throw error;
    }

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

    // Caso 3: usuário é membro ativo — retornar dados completos (sem password_hash)
    const memberCount = room.member_count ?? 0;
    const isClosed = room.is_open === false;
    const isFull = room.max_members && memberCount >= room.max_members;

    const formatted = {
      ...room,
      // password_hash nunca é retornado (revogado via RLS também)
      password_hash: undefined,
      has_password: !!(room as any).password_hash,
      _count: { members: memberCount },
      memberCount,
      myRole: membership.role,
      isBanned: false,
      isMember: true,
      canJoin: false, // já é membro
      isOpen: room.is_open !== false,
      creator: room.creator,
    };

    return NextResponse.json({ room: formatted });
  } catch (error: any) {
    console.error("[SEC-002 room-details GET]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ============================================================
// SEC-002: DELETE /api/rooms/[id] — Excluir sala
//
// Regras de autorização:
//   - Usuário autenticado
//   - Apenas o CRIADOR da sala pode excluir
//
// Mantém o uso de createAdminClient() APENAS para a limpeza em
// cascata (messages, room_members, sala) porque esses deletes
// precisam bypassar RLS — o criador pode não ter DELETE RLS em
// messages de outros usuários, mas precisa poder limpar a própria sala.
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

    // 1. Buscar a sala (RLS em rooms permite SELECT para salas ativas)
    const { data: room, error: roomErr } = await supabase
      .from("rooms")
      .select("id, name, created_by, is_active")
      .eq("id", roomId)
      .maybeSingle();

    if (roomErr || !room) {
      return NextResponse.json({ error: "Sala não encontrada" }, { status: 404 });
    }

    // 2. Verificar permissão: apenas o criador pode excluir
    if (room.created_by !== user.id) {
      // Verificar via role no room_members como fallback
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
    // Usa admin client para bypassar RLS (criador precisa poder limpar
    // mensagens de OUTROS usuários ao excluir a sala).
    const deletionLog: string[] = [];
    const deletionErrors: string[] = [];

    const admin = createAdminClient();

    // 3a. Buscar mídia das mensagens antes de deletar (para limpar storage)
    try {
      const { data: msgs } = await admin
        .from("messages")
        .select("media_url")
        .eq("room_id", roomId)
        .not("media_url", "is", null);

      if (msgs && msgs.length > 0) {
        // Tentar remover cada mídia do storage
        for (const m of msgs) {
          if (m.media_url) {
            try {
              const url = new URL(m.media_url);
              const parts = url.pathname.split("/");
              const buckets = ["post-photos", "post-videos", "post-audios", "profile-videos"];
              for (const bucket of buckets) {
                const idx = parts.indexOf(bucket);
                if (idx >= 0) {
                  const path = parts.slice(idx + 1).join("/");
                  if (path) {
                    await admin.storage.from(bucket).remove([path]);
                  }
                  break;
                }
              }
            } catch {
              /* silent — best effort */
            }
          }
        }
      }
    } catch (err: any) {
      console.warn("[SEC-002 room-delete] erro ao buscar mídia:", err.message);
    }

    // 3b. Excluir mensagens da sala
    const { error: msgErr } = await admin.from("messages").delete().eq("room_id", roomId);
    if (msgErr) {
      console.error("[SEC-002] erro ao excluir mensagens:", msgErr.message);
      deletionErrors.push(`mensagens: ${msgErr.message}`);
    } else {
      deletionLog.push("mensagens: excluídas");
    }

    // 3c. Excluir membros da sala
    const { error: membersErr } = await admin.from("room_members").delete().eq("room_id", roomId);
    if (membersErr) {
      console.error("[SEC-002] erro ao excluir membros:", membersErr.message);
      deletionErrors.push(`membros: ${membersErr.message}`);
    } else {
      deletionLog.push("membros: excluídos");
    }

    // 3d. Excluir a sala
    const { error: deleteErr } = await admin.from("rooms").delete().eq("id", roomId);
    if (deleteErr) {
      console.error("[SEC-002] erro ao excluir sala:", deleteErr.message);
      return NextResponse.json(
        {
          error: `Falha ao excluir sala: ${deleteErr.message}`,
          partial: true,
          deletionLog,
          deletionErrors,
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
  } catch (error: any) {
    console.error("[SEC-002 room-delete]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
