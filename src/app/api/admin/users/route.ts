import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { isModerator } from "@/lib/report-auth";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { safeErrorResponse } from "@/lib/safe-error";
import { dispatchPushForNotification } from "@/lib/push-dispatch";

/** Cria notificação de moderação e dispara push (best-effort). */
async function notifyModeration(
  admin: ReturnType<typeof createAdminClient>,
  targetUserId: string,
  actorId: string,
  type:
    | "moderation_suspend"
    | "moderation_unsuspend"
    | "moderation_ban"
    | "moderation_unban"
) {
  try {
    const { data: notif, error } = await admin
      .from("notifications")
      .insert({
        user_id: targetUserId,
        type,
        actor_id: actorId,
        is_read: false,
      })
      .select("id")
      .single();
    if (error || !notif?.id) {
      console.error("[admin/users] falha ao criar notificação", type, error);
      return;
    }
    // Fire-and-forget
    void dispatchPushForNotification(notif.id);
  } catch (e) {
    console.error("[admin/users] notifyModeration", e);
  }
}

/**
 * GET  /api/admin/users?q=&page=&limit=&filter=
 * POST /api/admin/users  { action, user_id, reason?, days? }
 *
 * Actions: ban | unban | suspend | unsuspend | delete | message
 * Acesso: is_moderator === true
 */

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const blocked = await rateLimitByRule(req, "admin:reports:list", user.id);
    if (blocked) return blocked;

    if (!(await isModerator(supabase, user.id))) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    const q = (req.nextUrl.searchParams.get("q") || "").trim().slice(0, 80);
    const filter = req.nextUrl.searchParams.get("filter") || "all";
    const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") || "30", 10) || 30));
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const admin = createAdminClient();

    let query = admin
      .from("profiles")
      .select(
        "id, username, display_name, avatar_url, bio, neighborhood, is_moderator, is_banned, banned_at, banned_reason, is_suspended, suspended_until, suspend_reason, deletion_requested_at, deletion_scheduled_at, created_at",
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(from, to);

    if (q) {
      const safe = q.replace(/[%_,]/g, "").slice(0, 50);
      if (safe) {
        query = query.or(
          `username.ilike.%${safe}%,display_name.ilike.%${safe}%`
        );
      }
    }

    if (filter === "banned") query = query.eq("is_banned", true);
    else if (filter === "suspended") query = query.eq("is_suspended", true);
    else if (filter === "moderators") query = query.eq("is_moderator", true);
    else if (filter === "deletion") query = query.not("deletion_requested_at", "is", null);

    const { data, error, count } = await query;
    if (error) throw error;

    return NextResponse.json({
      users: data || [],
      total: count ?? 0,
      page,
      limit,
    });
  } catch (error) {
    const { message, status } = safeErrorResponse(error, 500, "[admin/users GET]");
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const blocked = await rateLimitByRule(req, "admin:reports:list", user.id);
    if (blocked) return blocked;

    if (!(await isModerator(supabase, user.id))) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "";
    const targetId = typeof body.user_id === "string" ? body.user_id.trim() : "";
    const reason =
      typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
    const days =
      typeof body.days === "number" && body.days > 0
        ? Math.min(365, Math.floor(body.days))
        : null;

    if (!targetId) {
      return NextResponse.json({ error: "user_id obrigatório" }, { status: 400 });
    }
    if (targetId === user.id) {
      return NextResponse.json(
        { error: "Você não pode aplicar esta ação a si mesmo" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    const { data: target, error: tErr } = await admin
      .from("profiles")
      .select("id, username, display_name, is_moderator, is_banned, is_suspended")
      .eq("id", targetId)
      .maybeSingle();

    if (tErr) throw tErr;
    if (!target) {
      return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
    }

    // Não permitir banir/excluir outro moderador (exceto ações leves)
    if (
      target.is_moderator &&
      ["ban", "suspend", "delete"].includes(action)
    ) {
      return NextResponse.json(
        { error: "Não é possível banir, suspender ou excluir outro moderador" },
        { status: 403 }
      );
    }

    switch (action) {
      case "ban": {
        const { error } = await admin
          .from("profiles")
          .update({
            is_banned: true,
            banned_at: new Date().toISOString(),
            banned_reason: reason || null,
            is_suspended: false,
            suspended_until: null,
            suspend_reason: null,
          })
          .eq("id", targetId);
        if (error) throw error;
        await notifyModeration(admin, targetId, user.id, "moderation_ban");
        return NextResponse.json({ ok: true, banned: true });
      }

      case "unban": {
        const { error } = await admin
          .from("profiles")
          .update({
            is_banned: false,
            banned_at: null,
            banned_reason: null,
          })
          .eq("id", targetId);
        if (error) throw error;
        await notifyModeration(admin, targetId, user.id, "moderation_unban");
        return NextResponse.json({ ok: true, unbanned: true });
      }

      case "suspend": {
        let until: string | null = null;
        if (days) {
          const d = new Date();
          d.setDate(d.getDate() + days);
          until = d.toISOString();
        } else {
          // padrão 7 dias se não informar
          const d = new Date();
          d.setDate(d.getDate() + 7);
          until = d.toISOString();
        }
        const { error } = await admin
          .from("profiles")
          .update({
            is_suspended: true,
            suspended_until: until,
            suspend_reason: reason || null,
          })
          .eq("id", targetId);
        if (error) throw error;
        await notifyModeration(admin, targetId, user.id, "moderation_suspend");
        return NextResponse.json({
          ok: true,
          suspended: true,
          suspended_until: until,
        });
      }

      case "unsuspend": {
        const { error } = await admin
          .from("profiles")
          .update({
            is_suspended: false,
            suspended_until: null,
            suspend_reason: null,
          })
          .eq("id", targetId);
        if (error) throw error;
        await notifyModeration(admin, targetId, user.id, "moderation_unsuspend");
        return NextResponse.json({ ok: true, unsuspended: true });
      }

      case "delete": {
        // Exclusão imediata via service role (auth + cascade)
        const { error: delErr } = await admin.auth.admin.deleteUser(targetId);
        if (delErr) throw delErr;
        return NextResponse.json({ ok: true, deleted: true });
      }

      case "message": {
        // Cria/obtém DM entre o admin logado e o alvo
        const { data, error } = await supabase
          .rpc("rpc_get_or_create_dm", { p_other_user_id: targetId })
          .maybeSingle();
        if (error) throw error;
        const result = data as { ok?: boolean; chat_id?: string; error?: string };
        if (!result?.ok && result?.error) {
          const map: Record<string, string> = {
            blocked: "Há bloqueio entre vocês",
            cannot_dm_self: "Não é possível conversar consigo mesmo",
          };
          return NextResponse.json(
            { error: map[result.error] || "Não foi possível abrir conversa" },
            { status: 400 }
          );
        }
        return NextResponse.json({
          ok: true,
          chat_id: (result as any)?.chat_id || (result as any)?.id || null,
          dm: result,
        });
      }

      default:
        return NextResponse.json(
          {
            error:
              "action inválida (ban|unban|suspend|unsuspend|delete|message)",
          },
          { status: 400 }
        );
    }
  } catch (error) {
    const { message, status } = safeErrorResponse(
      error,
      500,
      "[admin/users POST]"
    );
    return NextResponse.json({ error: message }, { status });
  }
}
