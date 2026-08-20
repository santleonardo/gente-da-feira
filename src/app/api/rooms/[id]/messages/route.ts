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
const MESSAGE_COLS = "id, content, sender_id, room_id, target_type, media_url, media_type, expires_at, is_deleted, created_at";
const SENDER_COLS = "id, display_name, username, avatar_url";

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
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);

    // SEC-009: Explicit columns for messages — no SELECT *
    // (MESSAGE_COLS and SENDER_COLS are defined at module scope below)

    // O RLS em messages garantirá que apenas mensagens de salas do usuário
    // sejam retornadas, mesmo se houver bug no filtro .eq("room_id", id).
    const { data: messages, error } = await supabase.from("messages")
      .select(`${MESSAGE_COLS}, sender:profiles(${SENDER_COLS})`)
      .eq("room_id", id)
      .eq("target_type", "room")
      .eq("is_deleted", false)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (error) {
      console.error("[SEC-002 room-messages GET query]", error);
      throw error;
    }

    // Defesa extra: se a limpeza em background ainda não rodou,
    // não retorna mídia já expirada ao cliente.
    const now = new Date().toISOString();
    const sanitized = (messages || []).map((m: any) => {
      if (m.media_url && m.expires_at && m.expires_at < now) {
        return { ...m, media_url: null, media_type: null };
      }
      return m;
    });

    // Fire-and-forget: limpa mídia expirada (best effort)
    cleanupExpiredMessageMedia().catch(() => {});

    return NextResponse.json({ messages: sanitized });
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
    const { content, media_url, media_type } = body;

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

    // O RLS em messages validará o INSERT novamente no banco.
    // Se falhar (ex: usuário foi banido entre a checagem e o INSERT),
    // retornamos erro específico.
    const { data: message, error } = await supabase.from("messages")
      .insert(insertData)
      .select(`${MESSAGE_COLS}, sender:profiles(${SENDER_COLS})`)
      .single();

    if (error) {
      console.error("[SEC-002 room-messages POST insert]", error);
      // Se o RLS bloqueou, o erro será de permissão
      if (error.code === "42501" || error.message.includes("row-level security")) {
        return NextResponse.json(
          { error: "Você não tem permissão para enviar mensagens nesta sala" },
          { status: 403 }
        );
      }
      throw error;
    }

    const responseData = { message };
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
