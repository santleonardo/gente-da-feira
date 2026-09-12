import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getBlockedUserIds } from "@/lib/block-check";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { idempotencyGate, idempotencyStore, idempotencyFail } from "@/lib/idempotency";
import { safeErrorResponse } from "@/lib/safe-error";

type NotifRow = {
  id: string;
  type: string;
  is_read: boolean;
  created_at: string;
  actor_id: string | null;
  post_id: string | null;
  comment_id: string | null;
  actor?: {
    id: string;
    display_name: string | null;
    username: string | null;
    avatar_url: string | null;
  } | null;
};

async function attachActors(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: NotifRow[]
): Promise<NotifRow[]> {
  const actorIds = [
    ...new Set(rows.map((n) => n.actor_id).filter(Boolean) as string[]),
  ];
  if (actorIds.length === 0) return rows;

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name, username, avatar_url")
    .in("id", actorIds);

  const map = new Map((profiles || []).map((p: any) => [p.id, p]));
  return rows.map((n) => ({
    ...n,
    actor: n.actor_id ? map.get(n.actor_id) || null : null,
  }));
}

// GET /api/notifications — Listar notificações
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    const blocked = await rateLimitByRule(req, "notifications:list", user.id);
    if (blocked) return blocked;

    let blockedIds = new Set<string>();
    try {
      blockedIds = await getBlockedUserIds(supabase, user.id);
    } catch (e) {
      console.warn("[notifications GET] getBlockedUserIds", e);
    }

    // Query simples (sem hint de FK) — evita 500 se o nome da constraint mudou
    const { data: notifications, error } = await supabase
      .from("notifications")
      .select("id, type, is_read, created_at, actor_id, post_id, comment_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.warn("[notifications GET]", error.message);
      // Degrada em lista vazia em vez de 500 (ex.: tabela/coluna ausente)
      return NextResponse.json({ notifications: [], unreadCount: 0 });
    }

    let rows = (notifications || []) as NotifRow[];
    if (blockedIds.size > 0) {
      rows = rows.filter((n) => !n.actor_id || !blockedIds.has(n.actor_id));
    }

    try {
      rows = await attachActors(supabase, rows);
    } catch (e) {
      console.warn("[notifications GET] attachActors", e);
    }

    const unreadCount = rows.filter((n) => !n.is_read).length;

    return NextResponse.json({
      notifications: rows,
      unreadCount,
    });
  } catch (error: any) {
    console.warn("[notifications GET]", error?.message || error);
    return NextResponse.json({ notifications: [], unreadCount: 0 });
  }
}

// PUT /api/notifications — Marcar como lida
export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    const blocked = await rateLimitByRule(req, "notifications:read", user.id);
    if (blocked) return blocked;

    const idemBlock = await idempotencyGate(req, user.id);
    if (idemBlock) return idemBlock;

    const { notificationId, markAll } = await req.json();

    if (markAll) {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", user.id)
        .eq("is_read", false);

      if (error) throw error;
      const responseData = { markedAll: true };
      await idempotencyStore(req, responseData);
      return NextResponse.json(responseData);
    }

    if (!notificationId) {
      return NextResponse.json(
        { error: "notificationId ou markAll é obrigatório" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", notificationId)
      .eq("user_id", user.id);

    if (error) throw error;
    const responseData = { marked: true };
    await idempotencyStore(req, responseData);
    return NextResponse.json(responseData);
  } catch (error: any) {
    await idempotencyFail(req);
    const { message, status } = safeErrorResponse(error, 500, "[notifications PUT]");
    return NextResponse.json({ error: message }, { status });
  }
}
