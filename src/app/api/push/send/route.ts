// POST /api/push/send
// Rota interna — dispara Web Push para o dono de uma notificação recém-criada.
// Chamada pelas rotas de reação, comentário, follow, mention após inserir
// na tabela notifications.
//
// Body: { notificationId: string }
//
// Segurança (SEC-001):
//   - INTERNAL_API_SECRET é OBRIGATÓRIO (fail-closed).
//   - Validação via constant-time comparison (timingSafeEqual).
//   - Rate limit: máx 60 dispatches por minuto.
//   - Validação estrita do notificationId (UUID v4).
//   - Verifica que a notificação existe e pertence a um usuário real.
//   - Não aceita notificações com mais de 5 minutos (anti-replay).

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { sendPushToUser, PushPayload } from "@/lib/push";
import { validateInternalAuth } from "@/lib/internal-auth";
import { checkRateLimit } from "@/lib/rate-limit";

// Mapa de tipo de notificação → texto legível
function buildPayload(
  type: string,
  actorName: string,
  postId: string | null,
  extra?: { suspendUntil?: string | null; reason?: string | null }
): PushPayload {
  const url = postId ? `/?post=${postId}` : "/";

  const messages: Record<string, { title: string; body: string; tag: string }> = {
    reaction:        { title: "Nova reação",          body: `${actorName} reagiu ao seu post`,          tag: "reaction"        },
    comment:         { title: "Novo comentário",       body: `${actorName} comentou no seu post`,        tag: "comment"         },
    reply:           { title: "Nova resposta",         body: `${actorName} respondeu seu comentário`,    tag: "reply"           },
    follow_request:  { title: "Pedido de seguir",      body: `${actorName} quer te seguir`,              tag: "follow_request"  },
    follow_accepted: { title: "Seguindo você",         body: `${actorName} aceitou seu pedido`,          tag: "follow_accepted" },
    follow:          { title: "Novo seguidor",         body: `${actorName} começou a te seguir`,         tag: "follow"          },
    mention:         { title: "Você foi mencionado",   body: `${actorName} te mencionou em um post`,     tag: "mention"         },
    moderation_suspend: {
      title: "Conta suspensa",
      body: extra?.suspendUntil
        ? `Sua conta foi suspensa até ${extra.suspendUntil}.${extra.reason ? ` Motivo: ${extra.reason}` : ""}`
        : `Sua conta foi suspensa pela moderação.${extra?.reason ? ` Motivo: ${extra.reason}` : ""}`,
      tag: "moderation_suspend",
    },
    moderation_unsuspend: {
      title: "Suspensão encerrada",
      body: "Sua conta foi reativada. Você já pode usar o app normalmente.",
      tag: "moderation_unsuspend",
    },
    moderation_ban: {
      title: "Conta banida",
      body: extra?.reason
        ? `Sua conta foi banida. Motivo: ${extra.reason}`
        : "Sua conta foi banida pela moderação.",
      tag: "moderation_ban",
    },
    moderation_unban: {
      title: "Banimento removido",
      body: "O banimento da sua conta foi removido. Você já pode usar o app.",
      tag: "moderation_unban",
    },
  };

  const msg = messages[type] ?? {
    title: "Gente da Feira",
    body: `${actorName} interagiu com você`,
    tag: "general",
  };

  return { ...msg, url };
}

// Valida formato de UUID v4 (estrito)
function isValidUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}

// Tipos de notificação permitidos (whitelist)
const ALLOWED_NOTIF_TYPES = new Set([
  "reaction", "comment", "reply", "follow_request",
  "follow_accepted", "follow", "mention",
  "moderation_suspend", "moderation_unsuspend",
  "moderation_ban", "moderation_unban",
]);

export async function POST(req: NextRequest) {
  // ── 1. Autenticação interna fail-closed (SEC-001) ───────────────────
  const authError = validateInternalAuth(req);
  if (authError) return authError;

  // ── 2. Rate limit: 60 dispatches/minuto ──────────────────────────────
  const rl = await checkRateLimit("push:dispatch", 60, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit de push atingido" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
        },
      }
    );
  }

  try {
    // ── 3. Validação estrita do body ────────────────────────────────────
    let notificationId: string;
    try {
      const body = await req.json();
      notificationId = body?.notificationId;
    } catch {
      return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
    }

    if (!notificationId || typeof notificationId !== "string") {
      return NextResponse.json({ error: "notificationId obrigatório" }, { status: 400 });
    }

    if (!isValidUUID(notificationId)) {
      return NextResponse.json({ error: "notificationId inválido" }, { status: 400 });
    }

    // ── 4. Buscar notificação (com validação de idade) ─────────────────
    const admin = createAdminClient();

    const { data: notif, error } = await admin
      .from("notifications")
      .select(`
        id, type, user_id, post_id, actor_id, created_at,
        actor:profiles!notifications_actor_id_fkey(display_name)
      `)
      .eq("id", notificationId)
      .single();

    if (error || !notif) {
      // Não revela se a notificação existe ou não (anti-enumeration)
      return NextResponse.json({ ok: true, dispatched: false });
    }

    // Anti-replay: rejeitar notificações com mais de 5 minutos
    const notifAge = Date.now() - new Date(notif.created_at).getTime();
    if (notifAge > 5 * 60 * 1000) {
      console.warn(`[SEC-001] Notificação ${notificationId} muito antiga (${Math.round(notifAge / 1000)}s) — dispatch ignorado`);
      return NextResponse.json({ ok: true, dispatched: false, reason: "expired" });
    }

    // Validar tipo de notificação (whitelist)
    if (!ALLOWED_NOTIF_TYPES.has(notif.type)) {
      console.warn(`[SEC-001] Tipo de notificação desconhecido: "${notif.type}" — ignorado`);
      return NextResponse.json({ ok: true, dispatched: false, reason: "unknown_type" });
    }

    // Não enviar push para o próprio autor da ação
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const actorName = (notif.actor as any)?.display_name ?? "Moderação";

    // Para moderação, incluir motivo/prazo no corpo do push
    let extra: { suspendUntil?: string | null; reason?: string | null } | undefined;
    if (
      notif.type === "moderation_suspend" ||
      notif.type === "moderation_ban"
    ) {
      const { data: targetProf } = await admin
        .from("profiles")
        .select("suspend_reason, suspended_until, banned_reason")
        .eq("id", notif.user_id)
        .maybeSingle();
      if (notif.type === "moderation_suspend" && targetProf) {
        extra = {
          reason: targetProf.suspend_reason,
          suspendUntil: targetProf.suspended_until
            ? new Date(targetProf.suspended_until).toLocaleString("pt-BR", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })
            : null,
        };
      }
      if (notif.type === "moderation_ban" && targetProf) {
        extra = { reason: targetProf.banned_reason };
      }
    }

    const payload = buildPayload(notif.type, actorName, notif.post_id, extra);

    await sendPushToUser(notif.user_id, payload);

    // Marcar como dispatchada (evita duplicação em retry)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((notif as any).dispatched_push === false) {
      (async () => {
        try { await admin.rpc("mark_notification_push_dispatched", { p_notif_id: notificationId }); } catch { /* silent */ }
      })();
    }

    return NextResponse.json({ ok: true, dispatched: true });
  } catch (err: any) {
    console.error("[push/send]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}