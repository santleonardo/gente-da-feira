import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { checkRoomMembership, formatPublicRoomInfo } from "@/lib/room-auth";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { ROOM_SAFE_COLUMNS, selectCols } from "@/lib/safe-columns";
import { safeErrorResponse } from "@/lib/safe-error";
import { extractStoragePathFromUrl } from "@/lib/storage-security";

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

    const membership = await checkRoomMembership(roomId, user.id);

    if (!membership.roomExists) {
      return NextResponse.json({ error: "Sala não encontrada" }, { status: 404 });
    }

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
      console.error("[room-details GET query]", error);
      throw error;
    }

    const room = _room as any;
    if (!room) {
      return NextResponse.json({ error: "Sala não encontrada" }, { status: 404 });
    }

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

    if (!membership.isMember) {
      const publicInfo = formatPublicRoomInfo(room, membership);
      return NextResponse.json({ room: publicInfo });
    }

    const memberCount = room.member_count ?? 0;
    const isClosed = room.is_open === false;
    const isFull = room.max_members && memberCount >= room.max_members;

    const formatted = {
      ...room,
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

// DELETE /api/rooms/[id]
// REL-006: Exclusão de sala atômica via rpc_delete_room_cascade.
// DELETE messages + DELETE room_members + DELETE rooms em transação única.
// Retorna URLs de mídia para limpeza de storage (best effort).
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

    // REL-006: operação atômica — mensagens + membros + sala
    const { data, error } = await supabase
      .rpc("rpc_delete_room_cascade", { p_room_id: roomId })
      .maybeSingle();

    if (error) throw error;

    if (!data) throw new Error("RPC retornou vazio");
    const result = data as { ok: boolean; error?: string; room_id?: string; room_name?: string; media_urls?: string[] };

    if (!result.ok) {
      switch (result.error) {
        case "not_authenticated":
          return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
        case "room_not_found":
          return NextResponse.json({ error: "Sala não encontrada" }, { status: 404 });
        case "not_creator":
          return NextResponse.json({ error: "Apenas o criador pode excluir esta sala" }, { status: 403 });
        default:
          return NextResponse.json({ error: "Falha ao excluir sala" }, { status: 500 });
      }
    }

    // Limpeza de storage (best effort) — após DB em estado consistente
    if (result.media_urls && result.media_urls.length > 0) {
      const admin = createAdminClient();
      (async () => {
        for (const url of result.media_urls!) {
          try {
            const parsed = extractStoragePathFromUrl(url);
            if (parsed) {
              await admin.storage.from(parsed.bucket).remove([parsed.path]);
            }
          } catch { /* silent — best effort */ }
        }
      })();
    }

    return NextResponse.json({
      deleted: true,
      roomId: result.room_id,
      roomName: result.room_name,
    });
  } catch (error) {
    const { message, status } = safeErrorResponse(error, 500, "[room-delete]");
    return NextResponse.json({ error: message }, { status });
  }
}