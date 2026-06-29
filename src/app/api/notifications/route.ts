import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getBlockedUserIds } from "@/lib/block-check";
import { rateLimitByRule } from "@/lib/apply-rate-limit";

// GET /api/notifications — Listar notificações
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    const blocked = await rateLimitByRule(req, "notifications:list", user?.id);
    if (blocked) return blocked;

    // SEC-004: Get blocked user IDs to filter notifications
    const blockedIds = await getBlockedUserIds(supabase, user.id);

    // SEC-009: Fixed 'avatar' → 'avatar_url' (was referencing non-existent column)
    // SEC-009: Explicit column selection on notifications — no SELECT *
    const { data: notifications, error } = await supabase
      .from("notifications")
      .select("id, type, is_read, created_at, actor_id, post_id, comment_id, actor:profiles!notifications_actor_id_fkey(id, display_name, username, avatar_url)")
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
    const blocked = await rateLimitByRule(req, "notifications:read", user?.id);
    if (blocked) return blocked;

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