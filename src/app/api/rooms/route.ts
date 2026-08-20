import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { isReadOnlyMode, KILL_SWITCH_MESSAGES } from "@/lib/feature-flags";
import { ROOM_SAFE_COLUMNS, selectCols } from "@/lib/safe-columns";
import { safeErrorResponse } from "@/lib/safe-error";
import { sanitizeShortText, sanitizePlainText } from "@/lib/sanitize";
import { idempotencyGate, idempotencyStore, idempotencyFail } from "@/lib/idempotency";
import bcrypt from "bcryptjs";

// ── GET /api/rooms ──────────────────────────────────────────────
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

    if (user) {
      const { data: myMemberships } = await supabase
        .from("room_members")
        .select("room_id, role, is_banned")
        .eq("user_id", user.id);

      if (myMemberships) {
        for (const m of myMemberships) {
          if (m.is_banned) {
            bannedRoomIds.add(m.room_id);
          } else {
            memberRoomIds.add(m.room_id);
            memberRoles[m.room_id] = m.role;
          }
        }
      }
    }

    const formatted = (rooms || []).map((r: any) => {
      const memberCount = r.member_count || r.room_members?.[0]?.count || 0;
      const isMember = memberRoomIds.has(r.id);
      const isBanned = bannedRoomIds.has(r.id);
      const isClosed = r.is_open === false;
      const isFull = r.max_members && memberCount >= r.max_members;

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
        room_members: undefined,
      };
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