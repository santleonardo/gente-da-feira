import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { checkRoomMembership, formatPublicRoomInfo } from "@/lib/room-auth";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { ROOM_SAFE_COLUMNS, selectCols } from "@/lib/safe-columns";
import { safeErrorResponse } from "@/lib/safe-error";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: roomId } = await params;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    const blocked = await rateLimitByRule(req, "rooms:list", user?.id);
    if (blocked) return blocked;
    const membership = await checkRoomMembership(roomId, user.id);
    if (!membership.roomExists) return NextResponse.json({ error: "Sala não encontrada" }, { status: 404 });
    const { data: room, error } = await supabase
      .from("rooms")
      .select(`id, name, slug, icon, description, type, rules, is_active, is_open, max_members, member_count, has_password, created_at, created_by, creator:profiles!rooms_created_by_fkey(id, display_name, username, avatar_url)`)
      .eq("id", roomId).maybeSingle();
    if (error) { console.error("[room-details GET query]", error); throw error; }
    if (!room) return NextResponse.json({ error: "Sala não encontrada" }, { status: 404 });
    if (membership.isBanned) {
      return NextResponse.json({ room: { id: room.id, name: room.name, icon: room.icon, is_active: room.is_active, isBanned: true, isMember: false, canJoin: false } });
    }
    if (!membership.isMember) { const publicInfo = formatPublicRoomInfo(room, membership); return NextResponse.json({ room: publicInfo }); }
    const memberCount = room.member_count ?? 0;
    const isFull = room.max_members && memberCount >= room.max_members;
    const formatted = { ...room, has_password: !!room.has_password, _count: { members: memberCount }, memberCount, myRole: membership.role, isBanned: false, isMember: true, canJoin: false, isOpen: room.is_open !== false, creator: room.creator };
    return NextResponse.json({ room: formatted });
  } catch (error) {
    const { message, status } = safeErrorResponse(error, 500, "[room-details GET]");
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: roomId } = await params;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    const blocked = await rateLimitByRule(req, "rooms:delete", user?.id);
    if (blocked) return blocked;
    const { data: room, error: roomErr } = await supabase.from("rooms").select("id, name, created_by, is_active").eq("id", roomId).maybeSingle();
    if (roomErr || !room) return NextResponse.json({ error: "Sala não encontrada" }, { status: 404 });
    if (room.created_by !== user.id) {
      const { data: memberRecord } = await supabase.from("room_members").select("role").eq("room_id", roomId).eq("user_id", user.id).maybeSingle();
      if (!memberRecord || memberRecord.role !== "creator") return NextResponse.json({ error: "Apenas o criador pode excluir esta sala" }, { status: 403 });
    }
    const deletionLog: string[] = [];
    const deletionErrors: string[] = [];
    const admin = createAdminClient();
    try {
      const { data: msgs } = await admin.from("messages").select("media_url").eq("room_id", roomId).not("media_url", "is", null);
      if (msgs && msgs.length > 0) {
        for (const m of msgs) {
          if (m.media_url) {
            try {
              const url = new URL(m.media_url); const parts = url.pathname.split("/");
              const buckets = ["post-photos", "post-videos", "post-audios", "profile-videos"];
              for (const bucket of buckets) { const idx = parts.indexOf(bucket); if (idx >= 0) { const path = parts.slice(idx + 1).join("/"); if (path) await admin.storage.from(bucket).remove([path]); break; } }
            } catch { /* silent */ }
          }
        }
      }
    } catch (err: any) { console.warn("[room-delete] erro ao buscar mídia para limpeza"); }
    const { error: msgErr } = await admin.from("messages").delete().eq("room_id", roomId);
    if (msgErr) { console.error("[room-delete] erro ao excluir mensagens"); deletionErrors.push("mensagens: falha na exclusão"); } else { deletionLog.push("mensagens: excluídas"); }
    const { error: membersErr } = await admin.from("room_members").delete().eq("room_id", roomId);
    if (membersErr) { console.error("[room-delete] erro ao excluir membros"); deletionErrors.push("membros: falha na exclusão"); } else { deletionLog.push("membros: excluídos"); }
    const { error: deleteErr } = await admin.from("rooms").delete().eq("id", roomId);
    if (deleteErr) { console.error("[room-delete] erro ao excluir sala"); return NextResponse.json({ error: "Falha ao excluir sala", partial: true, deletionLog, deletionErrors: deletionErrors.length > 0 ? deletionErrors : undefined }, { status: 500 }); }
    deletionLog.push("sala: excluída");
    return NextResponse.json({ deleted: true, roomId, roomName: room.name, deletionLog, deletionErrors: deletionErrors.length > 0 ? deletionErrors : undefined });
  } catch (error) {
    const { message, status } = safeErrorResponse(error, 500, "[room-delete]");
    return NextResponse.json({ error: message }, { status });
  }
}
