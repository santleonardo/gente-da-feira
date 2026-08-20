import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canViewRoomMembers } from "@/lib/room-auth";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { safeErrorResponse } from "@/lib/safe-error";

// ============================================================
// SEC-002: GET /api/rooms/[id]/members
//
// Regras de autorização:
//   - Usuário autenticado
//   - Membro ativo da sala (não banido)
//
// Retorna 403 caso o usuário não seja membro.
// NÃO usa createAdminClient() — apenas o client autenticado,
// para que o RLS em room_members seja aplicado.
//
// Defense-in-depth: RLS bloqueia SELECT em room_members de salas
// das quais o usuário não participa.
// ============================================================
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: roomId } = await params;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const blocked = await rateLimitByRule(req, "rooms:members", user?.id);
    if (blocked) return blocked;

    // SEC-002: Verificar filiação antes de listar membros
    const auth = await canViewRoomMembers(roomId, user.id);
    if (!auth.allowed) {
      return NextResponse.json({ error: auth.reason }, { status: 403 });
    }

    const wantBanned = req.nextUrl.searchParams.get("banned") === "1";

    // Lista de banidos: só creator/moderator
    if (wantBanned) {
      const { data: myMembership } = await supabase
        .from("room_members")
        .select("role, is_banned")
        .eq("room_id", roomId)
        .eq("user_id", user.id)
        .maybeSingle();

      const role = myMembership?.role;
      if (
        !myMembership ||
        myMembership.is_banned ||
        (role !== "creator" && role !== "moderator")
      ) {
        return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
      }

      const { data: rawBanned, error: bannedErr } = await supabase
        .from("room_members")
        .select("id, user_id, role, banned_until, created_at, is_banned")
        .eq("room_id", roomId)
        .eq("is_banned", true)
        .order("created_at", { ascending: false });

      if (bannedErr) {
        console.error("[SEC-002 room-members GET banned]", bannedErr);
        throw bannedErr;
      }

      if (!rawBanned || rawBanned.length === 0) {
        return NextResponse.json({ members: [], banned: [] });
      }

      const userIds = rawBanned.map((m: any) => m.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, display_name, username, avatar_url")
        .in("id", userIds);

      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

      const banned = rawBanned.map((m: any) => ({
        id: m.id,
        user_id: m.user_id,
        role: m.role,
        banned_until: m.banned_until,
        is_banned: true,
        profile: profileMap.get(m.user_id) || null,
      }));

      return NextResponse.json({ members: banned, banned });
    }

    // Usa o client autenticado (NÃO admin) — RLS em room_members garante
    // que apenas membros da mesma sala consigam ver a lista.
    const { data: rawMembers, error } = await supabase
      .from("room_members")
      .select("id, user_id, role, created_at, is_banned")
      .eq("room_id", roomId)
      .eq("is_banned", false)
      .order("role", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[SEC-002 room-members GET query]", error);
      throw error;
    }

    if (!rawMembers || rawMembers.length === 0) {
      return NextResponse.json({ members: [] });
    }

    // SEC-009: Buscar profiles dos membros SEM neighborhood
    // (neighborhood é dado privado controlado por hide_neighborhood)
    const userIds = rawMembers.map((m: any) => m.user_id);
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, display_name, username, avatar_url")
      .in("id", userIds);

    if (profilesError) {
      console.error("[SEC-002 room-members GET profiles]", profilesError);
      // Continua mesmo sem profiles — retorna membros com profile null
    }

    const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

    const roleOrder: Record<string, number> = { creator: 0, moderator: 1, member: 2 };
    const members = rawMembers
      .map((m: any) => ({
        id: m.id,
        user_id: m.user_id,
        role: m.role,
        joined_at: m.created_at,
        profile: profileMap.get(m.user_id) || null,
      }))
      .sort((a: any, b: any) => (roleOrder[a.role] ?? 2) - (roleOrder[b.role] ?? 2));

    return NextResponse.json({ members });
  } catch (error: any) {
    console.error("[SEC-002 room-members GET]", error);
    const { message, status } = safeErrorResponse(error, 500, "[rooms/members GET]");
    return NextResponse.json({ error: message }, { status });
  }
}
