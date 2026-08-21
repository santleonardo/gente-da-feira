import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isModerator } from "@/lib/report-auth";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { safeErrorResponse } from "@/lib/safe-error";

/**
 * GET /api/admin/rooms
 * Espelho das salas oficiais para o painel /admin.
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

    const onlyOfficial = req.nextUrl.searchParams.get("official") !== "0";

    let query = supabase
      .from("rooms")
      .select(
        "id, name, slug, icon, description, type, rules, is_active, is_open, max_members, member_count, has_password, created_by, created_at, updated_at"
      )
      .eq("is_active", true)
      .order("type", { ascending: true })
      .order("name", { ascending: true });

    if (onlyOfficial) {
      query = query.eq("type", "official");
    }

    const { data: rooms, error } = await query;
    if (error) throw error;

    const roomIds = (rooms || []).map((r) => r.id);
    let bannedByRoom: Record<string, number> = {};
    let myRoles: Record<string, string> = {};

    if (roomIds.length > 0) {
      const { data: bannedRows } = await supabase
        .from("room_members")
        .select("room_id")
        .in("room_id", roomIds)
        .eq("is_banned", true);

      for (const row of bannedRows || []) {
        bannedByRoom[row.room_id] = (bannedByRoom[row.room_id] || 0) + 1;
      }

      const { data: myMemberships } = await supabase
        .from("room_members")
        .select("room_id, role")
        .in("room_id", roomIds)
        .eq("user_id", user.id)
        .eq("is_banned", false);

      for (const m of myMemberships || []) {
        myRoles[m.room_id] = m.role;
      }
    }

    const formatted = (rooms || []).map((r) => ({
      ...r,
      banned_count: bannedByRoom[r.id] || 0,
      my_role: myRoles[r.id] || null,
      is_creator: r.created_by === user.id || myRoles[r.id] === "creator",
    }));

    return NextResponse.json({ rooms: formatted });
  } catch (error) {
    const { message, status } = safeErrorResponse(error, 500, "[admin/rooms GET]");
    return NextResponse.json({ error: message }, { status });
  }
}
