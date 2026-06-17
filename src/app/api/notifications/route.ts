import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getBlockedUserIds } from "@/lib/block-check";

// GET /api/notifications — Listar notificações
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    // SEC-004: Get blocked user IDs to filter notifications
    const blockedIds = await getBlockedUserIds(supabase, user.id);

    const { data: notifications, error } = await supabase
      .from("notifications")
      .select("id, type, is_read, created_at, actor:profiles!notifications_actor_id_fkey(id, display_name, username, avatar), post_id, comment_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    // SEC-004: Filter out notifications from blocked users
    const filteredNotifications = blockedIds.size > 0
      ? (notifications || []).filter((n: any) => !blockedIds.has(n.actor_id))
      : (notifications || []);

    const unreadCount = filteredNotifications.filter((n: any) => !n.is_read).length;

    return NextResponse.json({
      notifications: filteredNotifications,
      unreadCount,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PUT /api/notifications — Marcar como lida
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const { notificationId, markAll } = await req.json();

    if (markAll) {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", user.id)
        .eq("is_read", false);

      if (error) throw error;
      return NextResponse.json({ markedAll: true });
    }

    if (!notificationId) {
      return NextResponse.json({ error: "notificationId ou markAll é obrigatório" }, { status: 400 });
    }

    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", notificationId)
      .eq("user_id", user.id);

    if (error) throw error;
    return NextResponse.json({ marked: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
