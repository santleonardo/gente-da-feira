import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cleanupExpiredMessageMedia, getMessageMediaExpirationMinutes } from "@/lib/media-expiration";
import { canReadRoomMessages, canSendRoomMessage } from "@/lib/room-auth";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { isReadOnlyMode, KILL_SWITCH_MESSAGES } from "@/lib/feature-flags";
import { sanitizePlainText } from "@/lib/sanitize";
import { validateMediaUrl } from "@/lib/storage-security";
import { idempotencyGate, idempotencyStore, idempotencyFail } from "@/lib/idempotency";
import { safeErrorResponse } from "@/lib/safe-error";

// Mídia em salas expira após 10 minutos (conteúdo efêmero,
// salas são para conversas rápidas, não armazenamento)
const MEDIA_MESSAGE_EXPIRATION_MINUTES = 10;

// SEC-009: Explicit columns for messages — no SELECT *
const MESSAGE_COLS =
  "id, content, sender_id, room_id, target_type, media_url, media_type, expires_at, is_deleted, created_at, reply_to_id";
const SENDER_COLS = "id, display_name, username, avatar_url";
const REPLY_PARENT_COLS =
  "id, content, media_type, sender_id, is_deleted, created_at";

// ============================================================
// SEC-002: GET /api/rooms/[id]/messages
//
// Regras de autorização:
//   - Usuário autenticado
//   - Membro ativo da sala (não banido)
//   - Sala ativa
//
// Retorna 403 caso qualquer regra falhe.
// Defense-in-depth: RLS em messages bloqueia SELECT não-autorizado.
// ============================================================
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const blocked = await rateLimitByRule(req, "rooms:msg:list", user?.id);
    if (blocked) return blocked;

    // SEC-002: Verificar filiação antes de qualquer leitura
    const auth = await canReadRoomMessages(id, user.id);
    if (!auth.allowed) {
      return NextResponse.json({ error: auth.reason }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "40") || 40, 1), 100);
    // Cursor: mensagens mais antigas que este timestamp ISO (infinite scroll para cima)
    const before = searchParams.get("before")?.trim() || null;

    // SEC-009: Explicit columns for messages — no SELECT *
    // Paginação: busca as N mais recentes (ou anteriores a `before`) em ordem DESC
    // e devolve em ordem ASC para o client.
    let query = supabase
      .from("messages")
      .select(`${MESSAGE_COLS}, sender:profiles(${SENDER_COLS})`)
      .eq("room_id", id)
      .eq("target_type", "room")
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (before) {
      // Valida ISO aproximado para evitar filtro inválido
      const t = Date.parse(before);
      if (!Number.isNaN(t)) {
        query = query.lt("created_at", new Date(t).toISOString());
      }
    }

    const { data: messages, error } = await query;

    if (error) {
      console.error("[SEC-002 room-messages GET query]", error);
      throw error;
    }

    // Reverte para ordem cronológica (antiga → recente)
    if (messages && messages.length > 1) {
      messages.reverse();
    }

    // Defesa extra: se a limpeza em background ainda não rodou,
    // não retorna mídia já expirada ao cliente.
    const now = new Date().toISOString();
    let sanitized = (messages || []).map((m: any) => {
      if (m.media_url && m.expires_at && m.expires_at < now) {
        return { ...m, media_url: null, media_type: null };
      }
      return m;
    });

    // Anexa mensagem original (reply) quando reply_to_id existe
    const replyIds = [
      ...new Set(
        sanitized
          .map((m: any) => m.reply_to_id)
          .filter((rid: string | null | undefined): rid is string => !!rid)
      ),
    ];
    if (replyIds.length > 0) {
      const { data: parents } = await supabase
        .from("messages")
        .select(`${REPLY_PARENT_COLS}, sender:profiles(${SENDER_COLS})`)
        .in("id", replyIds)
        .eq("room_id", id);
      const parentMap = new Map((parents || []).map((p: any) => [p.id, p]));
      sanitized = sanitized.map((m: any) => {
        if (!m.reply_to_id) return m;
        const parent = parentMap.get(m.reply_to_id);
        if (!parent) {
          return {
            ...m,
            reply_to: {
              id: m.reply_to_id,
              content: null,
              media_type: null,
              is_deleted: true,
              sender: null,
            },
          };
        }
        return {
          ...m,
          reply_to: parent.is_deleted
            ? {
                id: parent.id,
                content: null,
                media_type: null,
                is_deleted: true,
                sender: parent.sender || null,
              }
            : {
                id: parent.id,
                content: parent.content,
                media_type: parent.media_type,
                is_deleted: false,
                sender_id: parent.sender_id,
                sender: parent.sender || null,
                created_at: parent.created_at,
              },
        };
      });
    }

    // Mark-as-read só na carga “recente” (sem cursor before).
    // Scroll de histórico antigo não deve alterar last_read_at.
    if (!before) {
      void supabase
        .from("room_members")
        .update({ last_read_at: now })
        .eq("room_id", id)
        .eq("user_id", user.id)
        .then(({ error: markErr }) => {
          if (markErr) {
            console.warn("[rooms/messages mark-read]", markErr.message);
          }
        });
    }

    // Fire-and-forget: limpa mídia expirada (best effort)
    cleanupExpiredMessageMedia().catch(() => {});

    const hasMore = (sanitized?.length ?? 0) >= limit;

    return NextResponse.json({ messages: sanitized, hasMore });
  } catch (error: any) {
    console.error("[SEC-002 room-messages GET]", error);
    const { message, status } = safeErrorResponse(error, 500, "[rooms/messages GET]");
    return NextResponse.json({ error: message }, { status });
  }
}

// ============================================================
// SEC-002: POST /api/rooms/[id]/messages
//
// Regras de autorização:
//   - Usuário autenticado
//   - Membro ativo da sala (não banido)
//   - Sala ativa
//
// Retorna 403 caso qualquer regra falhe.
// Defense-in-depth: RLS em messages bloqueia INSERT não-autorizado.
// ============================================================
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const blocked = await rateLimitByRule(req, "rooms:msg:send", user?.id);
    if (blocked) return blocked;

    if (isReadOnlyMode()) {
      return NextResponse.json(
        { error: KILL_SWITCH_MESSAGES.readonly },
        { status: 503 }
      );
    }


    const idemBlock = await idempotencyGate(req, user.id);
    if (idemBlock) return idemBlock;

    // SEC-002: Verificar filiação antes de qualquer escrita
    const auth = await canSendRoomMessage(id, user.id);
    if (!auth.allowed) {
      return NextResponse.json({ error: auth.reason }, { status: 403 });
    }

    const body = await req.json();
    const { content, media_url, media_type, reply_to_id: rawReplyTo } = body;

    // Pelo menos content ou media_url deve ser fornecido
    if ((!content || !content.trim()) && !media_url) {
      return NextResponse.json({ error: "Mensagem vazia" }, { status: 400 });
    }
    if (content && content.length > 2000) {
      return NextResponse.json({ error: "Mensagem muito longa (máx 2000 chars)" }, { status: 400 });
    }

    // Validar media_type
    if (media_url && !["image", "video", "audio"].includes(media_type)) {
      return NextResponse.json({ error: "Tipo de mídia inválido" }, { status: 400 });
    }

    // Nota: validação de media_url agora feita por sanitizeMediaUrl (SEC-007)

    const insertData: any = {
      sender_id: user.id,
      room_id: id,
      target_type: "room",
    };

    // SEC-007: Sanitizar conteúdo de texto e validar URL de mídia
    if (content && content.trim()) {
      insertData.content = sanitizePlainText(content.trim());
    } else {
      insertData.content = null;
    }

    if (media_url) {
      // SEC-008: Validar URL — deve ser do storage autorizado com ownership
      const safeUrl = validateMediaUrl(media_url, { requireUserId: user.id });
      if (!safeUrl) {
        return NextResponse.json({ error: "URL de mídia inválida" }, { status: 400 });
      }
      insertData.media_url = safeUrl;
      insertData.media_type = media_type;
      // Mídia em salas expira em 10 minutos
      insertData.expires_at = getMessageMediaExpirationMinutes(MEDIA_MESSAGE_EXPIRATION_MINUTES);
    }

    // Reply: só aceita se a mensagem original existir, for da mesma sala e não estiver apagada
    let replyParent: any = null;
    if (rawReplyTo && typeof rawReplyTo === "string") {
      const { data: parent } = await supabase
        .from("messages")
        .select(`${REPLY_PARENT_COLS}, sender:profiles(${SENDER_COLS})`)
        .eq("id", rawReplyTo)
        .eq("room_id", id)
        .eq("target_type", "room")
        .eq("is_deleted", false)
        .maybeSingle();
      if (!parent) {
        return NextResponse.json(
          { error: "Mensagem original não encontrada nesta sala" },
          { status: 400 }
        );
      }
      insertData.reply_to_id = parent.id;
      replyParent = parent;
    }

    // O RLS em messages validará o INSERT novamente no banco.
    // Se falhar (ex: usuário foi banido entre a checagem e o INSERT),
    // retornamos erro específico.
    const { data: message, error } = await supabase.from("messages")
      .insert(insertData)
      .select(`${MESSAGE_COLS}, sender:profiles(${SENDER_COLS})`)
      .single();

    if (error) {
      console.error("[SEC-002 room-messages POST insert]", error);
      // Coluna reply_to_id ausente (migration não rodada)
      if (
        typeof error.message === "string" &&
        /reply_to_id|column/i.test(error.message)
      ) {
        return NextResponse.json(
          {
            error:
              "Reply ainda não disponível no banco. Rode 20260901_room_reply_mentions.sql no Supabase.",
          },
          { status: 500 }
        );
      }
      // Se o RLS bloqueou, o erro será de permissão
      if (error.code === "42501" || error.message.includes("row-level security")) {
        return NextResponse.json(
          { error: "Você não tem permissão para enviar mensagens nesta sala" },
          { status: 403 }
        );
      }
      throw error;
    }

    // Anexa reply_to no payload de resposta (evita round-trip no client)
    const messageWithReply = replyParent
      ? {
          ...message,
          reply_to: {
            id: replyParent.id,
            content: replyParent.content,
            media_type: replyParent.media_type,
            is_deleted: false,
            sender_id: replyParent.sender_id,
            sender: replyParent.sender || null,
            created_at: replyParent.created_at,
          },
        }
      : message;

    // ── Notificações: reply ao autor + @menções ──
    // Fire-and-forget; não bloqueia o envio da mensagem.
    void (async () => {
      try {
        const { createAdminClient } = await import("@/lib/supabase/server");
        const { dispatchPushForNotification } = await import("@/lib/push-dispatch");
        const admin = createAdminClient();
        const notified = new Set<string>();

        // 1) Quem foi respondido
        if (replyParent?.sender_id && replyParent.sender_id !== user.id) {
          notified.add(replyParent.sender_id);
          const { data: notif } = await admin
            .from("notifications")
            .insert({
              user_id: replyParent.sender_id,
              type: "reply",
              actor_id: user.id,
              is_read: false,
              message_id: (message as any)?.id ?? null,
              room_id: id,
            })
            .select("id")
            .single();
          if (notif?.id) dispatchPushForNotification(notif.id).catch(() => {});
        }

        // 2) @menções no texto
        const mentionedUsernames = [
          ...new Set(
            [...(insertData.content || "").matchAll(/@(\w+)/g)].map((m) => m[1].toLowerCase())
          ),
        ];
        for (const username of mentionedUsernames) {
          const { data: mentioned } = await admin
            .from("profiles")
            .select("id")
            .eq("username", username)
            .maybeSingle();
          if (!mentioned || mentioned.id === user.id || notified.has(mentioned.id)) continue;

          // Não notificar se houver bloqueio mútuo
          const { count: blockCount } = await admin
            .from("blocks")
            .select("id", { count: "exact", head: true })
            .or(
              `and(blocker_id.eq.${user.id},blocked_id.eq.${mentioned.id}),and(blocker_id.eq.${mentioned.id},blocked_id.eq.${user.id})`
            );
          if ((blockCount ?? 0) > 0) continue;

          notified.add(mentioned.id);
          const { data: notif } = await admin
            .from("notifications")
            .insert({
              user_id: mentioned.id,
              type: "mention",
              actor_id: user.id,
              is_read: false,
              message_id: (message as any)?.id ?? null,
              room_id: id,
            })
            .select("id")
            .single();
          if (notif?.id) dispatchPushForNotification(notif.id).catch(() => {});
        }
      } catch (e) {
        console.warn("[rooms/messages notif]", e);
      }
    })();

    const responseData = { message: messageWithReply };
    await idempotencyStore(req, responseData);
    return NextResponse.json(responseData);
  } catch (error: any) {
    await idempotencyFail(req);
    console.error("[SEC-002 room-messages POST]", error);
    const { message, status } = safeErrorResponse(error, 500, "[rooms/messages POST]");
    return NextResponse.json({ error: message }, { status });
  }
}

// ============================================================
// DELETE /api/rooms/[id]/messages?messageId=...
// Soft-delete: autor OU creator/moderator da sala
// ============================================================
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: roomId } = await params;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const blocked = await rateLimitByRule(req, "rooms:msg:delete", user.id);
    if (blocked) return blocked;

    let resolvedId = req.nextUrl.searchParams.get("messageId");
    if (!resolvedId) {
      try {
        const body = await req.json();
        resolvedId = typeof body?.messageId === "string" ? body.messageId : null;
      } catch {
        /* sem body */
      }
    }

    if (!resolvedId) {
      return NextResponse.json({ error: "messageId obrigatório" }, { status: 400 });
    }

    // Confirma que a mensagem pertence a esta sala (defense-in-depth)
    const { data: msgRow } = await supabase
      .from("messages")
      .select("id, room_id")
      .eq("id", resolvedId)
      .maybeSingle();

    if (!msgRow || msgRow.room_id !== roomId) {
      return NextResponse.json({ error: "Mensagem não encontrada nesta sala" }, { status: 404 });
    }

    const { data, error } = await supabase
      .rpc("rpc_delete_room_message", { p_message_id: resolvedId })
      .maybeSingle();

    if (error) {
      // RPC ainda não aplicada no banco
      if (/function.*rpc_delete_room_message|does not exist/i.test(error.message || "")) {
        return NextResponse.json(
          {
            error:
              "RPC de exclusão não instalada. Rode sql/rpc_delete_room_message.sql no Supabase.",
          },
          { status: 500 }
        );
      }
      throw error;
    }

    if (!data) throw new Error("RPC retornou vazio");
    const result = data as {
      ok: boolean;
      error?: string;
      media_url?: string | null;
      deleted_by_mod?: boolean;
    };

    if (!result.ok) {
      switch (result.error) {
        case "not_authenticated":
          return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
        case "message_not_found":
          return NextResponse.json({ error: "Mensagem não encontrada" }, { status: 404 });
        case "already_deleted":
          return NextResponse.json({ error: "Mensagem já foi apagada" }, { status: 400 });
        case "not_room_message":
          return NextResponse.json({ error: "Não é mensagem de sala" }, { status: 400 });
        case "insufficient_role":
          return NextResponse.json(
            { error: "Sem permissão para apagar esta mensagem" },
            { status: 403 }
          );
        default:
          return NextResponse.json({ error: "Não foi possível apagar a mensagem" }, { status: 400 });
      }
    }

    // Limpeza de storage (best effort)
    if (result.media_url) {
      try {
        const { createAdminClient } = await import("@/lib/supabase/server");
        const { extractStoragePathFromUrl } = await import("@/lib/storage-security");
        const admin = createAdminClient();
        const parsed = extractStoragePathFromUrl(result.media_url);
        if (parsed) {
          await admin.storage.from(parsed.bucket).remove([parsed.path]);
        }
      } catch {
        /* silent */
      }
    }

    return NextResponse.json({
      success: true,
      deletedByMod: !!result.deleted_by_mod,
    });
  } catch (error) {
    const { message, status } = safeErrorResponse(error, 500, "[rooms/messages DELETE]");
    return NextResponse.json({ error: message }, { status });
  }
}
