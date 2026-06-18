import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canViewRoomMembers } from "@/lib/room-auth";
import { rateLimitByRule } from "@/lib/apply-rate-limit";

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

    // Buscar profiles dos membros (RLS em profiles deve permitir SELECT público)
    const userIds = rawMembers.map((m: any) => m.user_id);
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, display_name, username, avatar_url, neighborhood")
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
