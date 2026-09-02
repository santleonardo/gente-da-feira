import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { isReadOnlyMode, KILL_SWITCH_MESSAGES } from "@/lib/feature-flags";
import { ROOM_SAFE_COLUMNS, selectCols } from "@/lib/safe-columns";
import { safeErrorResponse } from "@/lib/safe-error";
import { sanitizeShortText, sanitizePlainText } from "@/lib/sanitize";
import { idempotencyGate, idempotencyStore, idempotencyFail } from "@/lib/idempotency";
import bcrypt from "bcryptjs";

// SEC-009: colunas mínimas para prévia da última mensagem na lista de salas
const LAST_MSG_COLS =
  "id, room_id, content, media_type, media_url, sender_id, created_at, is_deleted";
const LAST_MSG_SENDER_COLS = "id, display_name, username";

// ── GET /api/rooms ──────────────────────────────────────────────
// Enriquecido com lastMessage + unreadCount para salas em que o usuário é membro.
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const blocked = await rateLimitByRule(req, "rooms:list", user?.id);
    if (blocked) return blocked;

    const { data: rooms, error } = await supabase
      .from("rooms")
      .select(`${selectCols(ROOM_SAFE_COLUMNS)}, room_members(count)`)
      .eq("is_active", true)
      .order("type", { ascending: true })
      .order("name", { ascending: true });

    if (error) throw error;

    let memberRoomIds: Set<string> = new Set();
    let memberRoles: Record<string, string> = {};
    let bannedRoomIds: Set<string> = new Set();
    /** last_read_at por room_id (só membros ativos) */
    const lastReadByRoom: Record<string, string | null> = {};

    if (user) {
      const { data: myMemberships } = await supabase
        .from("room_members")
        .select("room_id, role, is_banned, last_read_at")
        .eq("user_id", user.id);

      if (myMemberships) {
        for (const m of myMemberships) {
          if (m.is_banned) {
            bannedRoomIds.add(m.room_id);
          } else {
            memberRoomIds.add(m.room_id);
            memberRoles[m.room_id] = m.role;
            lastReadByRoom[m.room_id] = m.last_read_at ?? null;
          }
        }
      }
    }

    // ── Prévia da última mensagem + contagem de não lidas (só salas membro) ──
    const lastMessageByRoom: Record<
      string,
      {
        id: string;
        content: string | null;
        media_type: string | null;
        sender_id: string;
        sender_name: string | null;
        created_at: string;
      }
    > = {};
    const unreadCountByRoom: Record<string, number> = {};

    const memberIds = Array.from(memberRoomIds);
    if (user && memberIds.length > 0) {
      // Últimas mensagens: busca as mais recentes e agrupa por room_id em JS.
      // Limite generoso para cobrir N salas (ex.: 50 salas × ~2 = 100 linhas).
      const { data: recentMsgs } = await supabase
        .from("messages")
        .select(`${LAST_MSG_COLS}, sender:profiles(${LAST_MSG_SENDER_COLS})`)
        .in("room_id", memberIds)
        .eq("target_type", "room")
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(Math.min(memberIds.length * 3, 150));

      if (recentMsgs) {
        for (const msg of recentMsgs as any[]) {
          if (lastMessageByRoom[msg.room_id]) continue; // já pegamos a mais recente
          lastMessageByRoom[msg.room_id] = {
            id: msg.id,
            content: msg.content ?? null,
            media_type: msg.media_type ?? null,
            sender_id: msg.sender_id,
            sender_name: msg.sender?.display_name ?? null,
            created_at: msg.created_at,
          };
        }
      }

      // Contagem de não lidas: mensagens após last_read_at (ou todas se null).
      // Faz uma query por sala em paralelo (N pequeno — tipicamente < 20).
      await Promise.all(
        memberIds.map(async (roomId) => {
          const since = lastReadByRoom[roomId];
          let q = supabase
            .from("messages")
            .select("id", { count: "exact", head: true })
            .eq("room_id", roomId)
            .eq("target_type", "room")
            .eq("is_deleted", false)
            .neq("sender_id", user.id); // não conta as próprias mensagens

          if (since) {
            q = q.gt("created_at", since);
          }
          // se last_read_at é null: conta todas as mensagens de outros
          // (backfill SQL opcional evita badge gigante em salas antigas)

          const { count } = await q;
          unreadCountByRoom[roomId] = count ?? 0;
        })
      );
    }

    const formatted = (rooms || []).map((r: any) => {
      const memberCount = r.member_count || r.room_members?.[0]?.count || 0;
      const isMember = memberRoomIds.has(r.id);
      const isBanned = bannedRoomIds.has(r.id);
      const isClosed = r.is_open === false;
      const isFull = r.max_members && memberCount >= r.max_members;
      const lastMessage = isMember ? lastMessageByRoom[r.id] ?? null : null;
      const unreadCount = isMember ? unreadCountByRoom[r.id] ?? 0 : 0;

      return {
        ...r,
        _count: { members: r.room_members?.[0]?.count || 0 },
        memberCount,
        has_password: !!r.has_password,
        isMember,
        myRole: memberRoles[r.id] || null,
        isBanned,
        canJoin: !isMember && !isBanned && r.is_active && !isClosed && !isFull,
        isOpen: r.is_open !== false,
        lastMessage,
        unreadCount,
        last_read_at: isMember ? lastReadByRoom[r.id] ?? null : null,
        room_members: undefined,
      };
    });

    // Ordena "Minhas Salas" implicitamente no cliente; aqui mantém order estável.
    // Preferência: salas com unread primeiro, depois por última atividade.
    formatted.sort((a: any, b: any) => {
      // Só reordena entre membros; oficiais/comunidade ficam como estavam
      if (a.isMember && b.isMember) {
        const ua = a.unreadCount || 0;
        const ub = b.unreadCount || 0;
        if (ua > 0 && ub === 0) return -1;
        if (ub > 0 && ua === 0) return 1;
        const ta = a.lastMessage?.created_at || a.created_at || "";
        const tb = b.lastMessage?.created_at || b.created_at || "";
        return tb.localeCompare(ta);
      }
      return 0;
    });

    return NextResponse.json({ rooms: formatted });
  } catch (error) {
    const { message, status } = safeErrorResponse(error, 500, "[rooms GET]");
    return NextResponse.json({ error: message }, { status });
  }
}

// ── POST /api/rooms ─────────────────────────────────────────────
// REL-006: Criação de sala atômica via rpc_create_room_with_creator.
// INSERT rooms + INSERT room_members (creator) em transação única.
// Previne sala órfã sem criador.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const blocked = await rateLimitByRule(req, "rooms:create", user?.id);
    if (blocked) return blocked;

    if (isReadOnlyMode()) {
      return NextResponse.json(
        { error: KILL_SWITCH_MESSAGES.readonly },
        { status: 503 }
      );
    }


    const idemBlock = await idempotencyGate(req, user.id);
    if (idemBlock) return idemBlock;

    const body = await req.json();
    const name        = sanitizeShortText((body.name || ""), 50);
    const description = sanitizePlainText((body.description || ""));
    const icon        = sanitizeShortText(body.icon || "💬", 10);
    const rules       = sanitizePlainText((body.rules || "").trim()) || null;
    const maxMembers  = Math.min(50, Math.max(10, parseInt(body.max_members) || 50));
    const isOpen      = body.is_open !== false;
    const rawPassword = (body.password || "").trim();

    if (!name) return NextResponse.json({ error: "Nome da sala é obrigatório" }, { status: 400 });
    if (name.length > 50) return NextResponse.json({ error: "Nome muito longo" }, { status: 400 });

    let passwordHash: string | null = null;
    if (rawPassword) {
      passwordHash = await bcrypt.hash(rawPassword, 10);
    }

    const slug =
      name.toLowerCase().normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") +
      "-" + Date.now().toString(36);

    // REL-006: operação atômica — sala + membership do criador
    const { data, error } = await supabase
      .rpc("rpc_create_room_with_creator", {
        p_name: name,
        p_slug: slug,
        p_icon: icon,
        p_description: description || null,
        p_rules: rules,
        p_is_open: isOpen,
        p_max_members: maxMembers,
        p_password_hash: passwordHash,
      })
      .maybeSingle();

    if (error) {
      console.error("[rooms POST] RPC error:", error.message, error.code, error.details);
      // Erro clássico: RPC antiga tentando INSERT em has_password (coluna GENERATED)
      if (
        typeof error.message === "string" &&
        /has_password|generated/i.test(error.message)
      ) {
        return NextResponse.json(
          {
            error:
              "Falha ao criar sala no banco (RPC desatualizada). Rode FIX_rpc_create_room.sql no Supabase.",
          },
          { status: 500 }
        );
      }
      throw error;
    }

    if (!data) throw new Error("RPC retornou vazio");
    const result = data as { ok: boolean; error?: string; room_id?: string; has_password?: boolean };

    if (!result.ok) {
      switch (result.error) {
        case "not_authenticated":
          return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
        default:
          return NextResponse.json({ error: "Não foi possível criar a sala" }, { status: 400 });
      }
    }

    // Buscar a sala criada para retornar dados completos
    const { data: _room } = await supabase
      .from("rooms")
      .select(selectCols(ROOM_SAFE_COLUMNS))
      .eq("id", result.room_id)
      .single();

    const room = _room as any;

    const responseData = {
      room: {
        ...room,
        has_password: !!result.has_password,
        memberCount: 1,
        isMember: true,
        myRole: "creator",
        isBanned: false,
        canJoin: false,
        isOpen,
      },
    };
    await idempotencyStore(req, responseData);
    return NextResponse.json(responseData);
  } catch (error) {
    await idempotencyFail(req);
    const { message, status } = safeErrorResponse(error, 500, "[rooms POST]");
    return NextResponse.json({ error: message }, { status });
  }
}