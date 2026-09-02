import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canReadRoomMessages } from "@/lib/room-auth";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { safeErrorResponse } from "@/lib/safe-error";
import { dispatchPushForNotification } from "@/lib/push-dispatch";

/** Emojis permitidos em reações de salas */
export const ROOM_REACTION_EMOJIS = ["👍", "❤️", "😂", "🔥", "😮", "😢"] as const;
export type RoomReactionEmoji = (typeof ROOM_REACTION_EMOJIS)[number];

function isValidEmoji(emoji: string): emoji is RoomReactionEmoji {
  return (ROOM_REACTION_EMOJIS as readonly string[]).includes(emoji);
}

// ============================================================
// POST /api/rooms/[id]/messages/reaction
// Body: { messageId: string, emoji: string }
// Toggle: se já reagiu com esse emoji → remove; senão → adiciona.
// ============================================================
export async function POST(
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

    const blocked = await rateLimitByRule(req, "reactions:room_msg", user.id);
    if (blocked) return blocked;

    const body = await req.json().catch(() => ({}));
    const messageId = typeof body.messageId === "string" ? body.messageId : "";
    const emoji = typeof body.emoji === "string" ? body.emoji.trim() : "";

    if (!messageId) {
      return NextResponse.json({ error: "messageId obrigatório" }, { status: 400 });
    }
    if (!isValidEmoji(emoji)) {
      return NextResponse.json(
        { error: "Emoji inválido", allowed: ROOM_REACTION_EMOJIS },
        { status: 400 }
      );
    }

    // Só membros da sala podem reagir
    const auth = await canReadRoomMessages(roomId, user.id);
    if (!auth.allowed) {
      return NextResponse.json({ error: auth.reason }, { status: 403 });
    }

    // Mensagem deve existir, ser da sala e não estar apagada
    const { data: msg, error: msgErr } = await supabase
      .from("messages")
      .select("id, sender_id, room_id, is_deleted")
      .eq("id", messageId)
      .eq("room_id", roomId)
      .eq("target_type", "room")
      .maybeSingle();

    if (msgErr) throw msgErr;
    if (!msg || msg.is_deleted) {
      return NextResponse.json({ error: "Mensagem não encontrada" }, { status: 404 });
    }

    // Toggle: existe? → delete; senão → insert
    const { data: existing } = await supabase
      .from("message_reactions")
      .select("id")
      .eq("message_id", messageId)
      .eq("user_id", user.id)
      .eq("emoji", emoji)
      .maybeSingle();

    let reacted = false;

    if (existing?.id) {
      const { error: delErr } = await supabase
        .from("message_reactions")
        .delete()
        .eq("id", existing.id)
        .eq("user_id", user.id);
      if (delErr) throw delErr;
      reacted = false;
    } else {
      const { error: insErr } = await supabase.from("message_reactions").insert({
        message_id: messageId,
        user_id: user.id,
        emoji,
      });
      if (insErr) {
        // Unique violation = race (já reagiu) → trata como reacted
        if (insErr.code === "23505") {
          reacted = true;
        } else if (
          typeof insErr.message === "string" &&
          /message_reactions|relation|does not exist/i.test(insErr.message)
        ) {
          return NextResponse.json(
            {
              error:
                "Reações ainda não disponíveis no banco. Rode 20260901_message_reactions.sql no Supabase.",
            },
            { status: 500 }
          );
        } else {
          throw insErr;
        }
      } else {
        reacted = true;
      }
    }

    // Contagens atualizadas desta mensagem (para o client reconciliar)
    const { data: allRx } = await supabase
      .from("message_reactions")
      .select("emoji, user_id")
      .eq("message_id", messageId);

    const summary = summarizeReactions(allRx || [], user.id);

    // Notificação ao autor (só ao adicionar, e não a si mesmo)
    if (reacted && msg.sender_id && msg.sender_id !== user.id) {
      void (async () => {
        try {
          const { data: notif } = await supabase
            .from("notifications")
            .insert({
              user_id: msg.sender_id,
              type: "reaction",
              actor_id: user.id,
              is_read: false,
              message_id: messageId,
              room_id: roomId,
            })
            .select("id")
            .single();
          if (notif?.id) {
            dispatchPushForNotification(notif.id).catch(() => {});
          }
        } catch {
          /* silent — notificação é best-effort */
        }
      })();
    }

    return NextResponse.json({
      reacted,
      emoji,
      messageId,
      reactions: summary,
    });
  } catch (error) {
    const { message, status } = safeErrorResponse(error, 500, "[rooms/messages/reaction POST]");
    return NextResponse.json({ error: message }, { status });
  }
}

/** Agrupa reações: [{ emoji, count, me }] */
export function summarizeReactions(
  rows: { emoji: string; user_id: string }[],
  viewerId: string
): { emoji: string; count: number; me: boolean }[] {
  const map = new Map<string, { count: number; me: boolean }>();
  for (const r of rows) {
    const cur = map.get(r.emoji) || { count: 0, me: false };
    cur.count += 1;
    if (r.user_id === viewerId) cur.me = true;
    map.set(r.emoji, cur);
  }
  return Array.from(map.entries())
    .map(([emoji, v]) => ({ emoji, count: v.count, me: v.me }))
    .sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji));
}
