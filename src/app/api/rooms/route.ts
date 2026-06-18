import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import bcrypt from "bcryptjs";

// ── GET /api/rooms ──────────────────────────────────────────────
// Retorna todas as salas ativas com informações de participação
// do usuário autenticado (isMember, myRole, isBanned, canJoin, isOpen, memberCount)
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const blocked = await rateLimitByRule(req, "rooms:list", user?.id);
    if (blocked) return blocked;

    const { data: rooms, error } = await supabase
      .from("rooms")
      .select(`*, room_members(count)`)
      .eq("is_active", true)
      .order("type", { ascending: true })
      .order("name", { ascending: true });

    if (error) throw error;

    // Buscar todas as participações do usuário autenticado em uma única query
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
        password_hash: undefined,
        _count: { members: r.room_members?.[0]?.count || 0 },
        memberCount,
        has_password: !!r.password_hash,
        isMember,
        myRole: memberRoles[r.id] || null,
        isBanned,
        canJoin: !isMember && !isBanned && r.is_active && !isClosed && !isFull,
        isOpen: r.is_open !== false,
        room_members: undefined,
      };
    });

    return NextResponse.json({ rooms: formatted });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ── POST /api/rooms ─────────────────────────────────────────────
// Body: { name, description, icon, max_members, rules, password, is_open }
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const blocked = await rateLimitByRule(req, "rooms:create", user?.id);
    if (blocked) return blocked;

    const body = await req.json();
    const name        = (body.name || "").trim();
    const description = (body.description || "").trim();
    const icon        = body.icon || "💬";
    const rules       = (body.rules || "").trim() || null;
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

    const { data: room, error } = await supabase
      .from("rooms")
      .insert({
        name,
        slug,
        icon,
        description: description || null,
        rules,
        type: "community",
        is_active: true,
        is_open: isOpen,
        max_members: maxMembers,
        password_hash: passwordHash,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) throw error;

    await supabase.from("room_members").insert({
      room_id: room.id,
      user_id: user.id,
      role: "creator",
    });

    return NextResponse.json({
      room: {
        ...room,
        password_hash: undefined,
        has_password: !!passwordHash,
        memberCount: 1,
        isMember: true,
        myRole: "creator",
        isBanned: false,
        canJoin: false,
        isOpen,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
