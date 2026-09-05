import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getBlockedUserIds } from "@/lib/block-check";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { selectCols } from "@/lib/safe-columns";
import { safeErrorResponse } from "@/lib/safe-error";
import { idempotencyGate, idempotencyStore, idempotencyFail } from "@/lib/idempotency";

// SEC-009: Explicit columns for DM conversation list — no SELECT * on direct_chats
// initiator_last_read_at / receiver_last_read_at são opcionais (migration)
const DM_CHAT_COLUMNS =
  "id, initiator_id, receiver_id, updated_at, initiator_last_read_at, receiver_last_read_at";
const DM_CHAT_COLUMNS_FALLBACK = "id, initiator_id, receiver_id, updated_at";
// SEC-009: Minimal profile columns for DM participant display
const DM_PROFILE_COLS = selectCols([
  "id",
  "display_name",
  "username",
  "avatar_url",
] as const);

const LAST_MSG_COLS =
  "id, dm_id, content, sender_id, media_type, created_at, is_deleted";

function previewFromMessage(m: any | null | undefined): string {
  if (!m) return "";
  if (m.content && String(m.content).trim()) {
    const t = String(m.content).replace(/\s+/g, " ").trim();
    return t.length > 80 ? t.slice(0, 77) + "…" : t;
  }
  if (m.media_type === "image") return "📷 Foto";
  if (m.media_type === "video") return "🎬 Vídeo";
  if (m.media_type === "audio") return "🎵 Áudio";
  if (m.media_type) return "Anexo";
  return "";
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const blocked = await rateLimitByRule(req, "dm:list", user?.id);
    if (blocked) return blocked;

    // Tenta colunas de last_read; se a migration não rodou, cai no fallback
    let conversationsRaw: any[] = [];
    let hasReadColumns = true;
    {
      const res = await supabase
        .from("direct_chats")
        .select(
          `
          ${DM_CHAT_COLUMNS},
          initiator:profiles!direct_chats_initiator_id_fkey(${DM_PROFILE_COLS}),
          receiver:profiles!direct_chats_receiver_id_fkey(${DM_PROFILE_COLS})
        `
        )
        .or(`initiator_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order("updated_at", { ascending: false });

      if (res.error) {
        hasReadColumns = false;
        const fallback = await supabase
          .from("direct_chats")
          .select(
            `
            ${DM_CHAT_COLUMNS_FALLBACK},
            initiator:profiles!direct_chats_initiator_id_fkey(${DM_PROFILE_COLS}),
            receiver:profiles!direct_chats_receiver_id_fkey(${DM_PROFILE_COLS})
          `
          )
          .or(`initiator_id.eq.${user.id},receiver_id.eq.${user.id}`)
          .order("updated_at", { ascending: false });
        if (fallback.error) throw fallback.error;
        conversationsRaw = fallback.data || [];
      } else {
        conversationsRaw = res.data || [];
      }
    }

    const blockedIds = await getBlockedUserIds(supabase, user.id);

    let conversations = (conversationsRaw || []).filter((c: any) => {
      const otherId = c.initiator_id === user.id ? c.receiver_id : c.initiator_id;
      return !blockedIds.has(otherId);
    });

    // Última mensagem + não lidas por conversa
    const chatIds = conversations.map((c: any) => c.id).filter(Boolean);
    const lastByChat = new Map<string, any>();
    const unreadByChat = new Map<string, number>();

    if (chatIds.length > 0) {
      // Busca mensagens recentes dos chats (limitado) e agrega no app
      const { data: recentMsgs, error: msgErr } = await supabase
        .from("messages")
        .select(LAST_MSG_COLS)
        .in("dm_id", chatIds)
        .eq("target_type", "dm")
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(Math.min(chatIds.length * 30, 300));

      if (!msgErr && recentMsgs) {
        for (const m of recentMsgs as any[]) {
          if (!m?.dm_id) continue;
          if (!lastByChat.has(m.dm_id)) {
            lastByChat.set(m.dm_id, m);
          }
        }

        if (hasReadColumns) {
          for (const c of conversations) {
            const isInitiator = c.initiator_id === user.id;
            const lastRead = isInitiator
              ? c.initiator_last_read_at
              : c.receiver_last_read_at;
            let unread = 0;
            for (const m of recentMsgs as any[]) {
              if (m.dm_id !== c.id) continue;
              if (m.sender_id === user.id) continue;
              if (!lastRead || new Date(m.created_at) > new Date(lastRead)) {
                unread += 1;
              }
            }
            unreadByChat.set(c.id, unread);
          }
        }
      }
    }

    conversations = conversations.map((c: any) => {
      const last = lastByChat.get(c.id) || null;
      return {
        ...c,
        lastMessage: last
          ? {
              id: last.id,
              content: last.content,
              sender_id: last.sender_id,
              media_type: last.media_type,
              created_at: last.created_at,
              preview: previewFromMessage(last),
            }
          : null,
        unreadCount: unreadByChat.get(c.id) || 0,
      };
    });

    // Ordena por última mensagem (ou updated_at)
    conversations.sort((a: any, b: any) => {
      const ta = a.lastMessage?.created_at || a.updated_at || "";
      const tb = b.lastMessage?.created_at || b.updated_at || "";
      return tb.localeCompare(ta);
    });

    return NextResponse.json({ conversations });
  } catch (error) {
    const { message, status } = safeErrorResponse(error, 500, "[dm GET]");
    return NextResponse.json({ error: message }, { status });
  }
}

// REL-004: Criação de conversa DM totalmente atômica via RPC
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const blocked = await rateLimitByRule(req, "dm:create", user?.id);
    if (blocked) return blocked;

    const idemBlock = await idempotencyGate(req, user.id);
    if (idemBlock) return idemBlock;

    const { receiverId } = await req.json();
    if (!receiverId) return NextResponse.json({ error: "receiverId obrigatório" }, { status: 400 });
    if (user.id === receiverId)
      return NextResponse.json({ error: "Não pode conversar consigo" }, { status: 400 });

    const { data, error } = await supabase
      .rpc("rpc_get_or_create_dm", { p_other_user_id: receiverId })
      .maybeSingle();

    if (error) throw error;

    if (!data) throw new Error("RPC retornou vazio");
    const result = data as { ok: boolean; error?: string; chat_id?: string };

    if (!result.ok) {
      if (result.error === "not_authenticated") {
        return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
      }
      if (result.error === "blocked") {
        return NextResponse.json(
          { error: "Não é possível iniciar conversa com este usuário" },
          { status: 403 }
        );
      }
      if (result.error === "cannot_dm_self") {
        return NextResponse.json({ error: "Não pode conversar consigo" }, { status: 400 });
      }
      return NextResponse.json({ error: "Não foi possível iniciar a conversa" }, { status: 400 });
    }

    let conversation: any = null;
    const full = await supabase
      .from("direct_chats")
      .select(
        `${DM_CHAT_COLUMNS}, initiator:profiles!direct_chats_initiator_id_fkey(${DM_PROFILE_COLS}), receiver:profiles!direct_chats_receiver_id_fkey(${DM_PROFILE_COLS})`
      )
      .eq("id", result.chat_id as string)
      .maybeSingle();

    if (full.error) {
      const fb = await supabase
        .from("direct_chats")
        .select(
          `${DM_CHAT_COLUMNS_FALLBACK}, initiator:profiles!direct_chats_initiator_id_fkey(${DM_PROFILE_COLS}), receiver:profiles!direct_chats_receiver_id_fkey(${DM_PROFILE_COLS})`
        )
        .eq("id", result.chat_id as string)
        .maybeSingle();
      if (fb.error) throw fb.error;
      conversation = fb.data;
    } else {
      conversation = full.data;
    }

    const responseData = { conversation };
    await idempotencyStore(req, responseData);
    return NextResponse.json(responseData);
  } catch (error) {
    await idempotencyFail(req);
    const { message, status } = safeErrorResponse(error, 500, "[dm POST]");
    return NextResponse.json({ error: message }, { status });
  }
}
