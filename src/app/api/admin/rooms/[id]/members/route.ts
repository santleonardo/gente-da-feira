import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { isModerator } from "@/lib/report-auth";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { safeErrorResponse } from "@/lib/safe-error";

/**
 * Gestão de membros de salas OFICIAIS pelo painel /admin.
 *
 * GET  — lista membros ativos e banidos
 * POST — actions: invite | kick | ban | unban
 *
 * Acesso: profiles.is_moderator === true
 * Escopo: apenas rooms.type = 'official'
 */

async function assertOfficialRoomAdmin(
  userId: string,
  roomId: string
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const supabase = await createClient();

  if (!(await isModerator(supabase, userId))) {
    return { ok: false, status: 403, error: "Acesso negado" };
  }

  const admin = createAdminClient();
  const { data: room, error } = await admin
    .from("rooms")
    .select("id, type, is_active, max_members, member_count")
    .eq("id", roomId)
    .maybeSingle();

  if (error) throw error;
  if (!room || !room.is_active) {
    return { ok: false, status: 404, error: "Sala não encontrada" };
  }
  if (room.type !== "official") {
    return {
      ok: false,
      status: 403,
      error: "Só é possível gerenciar membros de salas oficiais pelo painel",
    };
  }

  return { ok: true };
}

export async function GET(
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

    const blocked = await rateLimitByRule(req, "admin:reports:list", user.id);
    if (blocked) return blocked;

    const gate = await assertOfficialRoomAdmin(user.id, roomId);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const admin = createAdminClient();

    const { data: rawMembers, error: memErr } = await admin
      .from("room_members")
      .select("id, user_id, role, created_at, is_banned, banned_until")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true });

    if (memErr) throw memErr;

    const rows = rawMembers || [];
    const userIds = [...new Set(rows.map((m) => m.user_id))];

    let profileMap = new Map<
      string,
      { id: string; display_name: string; username: string; avatar_url: string | null }
    >();

    if (userIds.length > 0) {
      const { data: profiles } = await admin
        .from("profiles")
        .select("id, display_name, username, avatar_url")
        .in("id", userIds);
      profileMap = new Map((profiles || []).map((p) => [p.id, p]));
    }

    const roleOrder: Record<string, number> = {
      creator: 0,
      moderator: 1,
      member: 2,
    };

    const members = rows
      .filter((m) => !m.is_banned)
      .map((m) => ({
        id: m.id,
        user_id: m.user_id,
        role: m.role,
        joined_at: m.created_at,
        profile: profileMap.get(m.user_id) || null,
      }))
      .sort(
        (a, b) => (roleOrder[a.role] ?? 2) - (roleOrder[b.role] ?? 2)
      );

    const banned = rows
      .filter((m) => m.is_banned)
      .map((m) => ({
        id: m.id,
        user_id: m.user_id,
        role: m.role,
        banned_until: m.banned_until,
        joined_at: m.created_at,
        profile: profileMap.get(m.user_id) || null,
      }));

    return NextResponse.json({ members, banned });
  } catch (error) {
    const { message, status } = safeErrorResponse(
      error,
      500,
      "[admin/rooms/members GET]"
    );
    return NextResponse.json({ error: message }, { status });
  }
}

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

    const blocked = await rateLimitByRule(req, "admin:reports:list", user.id);
    if (blocked) return blocked;

    const gate = await assertOfficialRoomAdmin(user.id, roomId);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "";
    const targetId =
      typeof body.user_id === "string" ? body.user_id.trim() : "";
    const username =
      typeof body.username === "string"
        ? body.username.trim().toLowerCase().replace(/[^a-z0-9_]/g, "")
        : "";

    if (!["invite", "kick", "ban", "unban"].includes(action)) {
      return NextResponse.json(
        { error: "action inválida (invite|kick|ban|unban)" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // Resolver alvo por user_id ou username
    let resolvedTargetId = targetId;
    if (!resolvedTargetId && username) {
      const { data: prof } = await admin
        .from("profiles")
        .select("id")
        .eq("username", username)
        .maybeSingle();
      if (!prof) {
        return NextResponse.json(
          { error: "Usuário não encontrado" },
          { status: 404 }
        );
      }
      resolvedTargetId = prof.id;
    }

    if (!resolvedTargetId) {
      return NextResponse.json(
        { error: "Informe user_id ou username" },
        { status: 400 }
      );
    }

    if (resolvedTargetId === user.id && action !== "unban") {
      return NextResponse.json(
        { error: "Você não pode aplicar esta ação a si mesmo" },
        { status: 400 }
      );
    }

    // Dados da sala (capacidade)
    const { data: room } = await admin
      .from("rooms")
      .select("id, max_members, member_count")
      .eq("id", roomId)
      .single();

    const { data: membership } = await admin
      .from("room_members")
      .select("id, role, is_banned, banned_until")
      .eq("room_id", roomId)
      .eq("user_id", resolvedTargetId)
      .maybeSingle();

    if (action === "invite") {
      if (membership && !membership.is_banned) {
        return NextResponse.json(
          { error: "Usuário já é membro desta sala" },
          { status: 400 }
        );
      }
      if (membership?.is_banned) {
        return NextResponse.json(
          { error: "Usuário está banido. Desbanha antes de convidar." },
          { status: 403 }
        );
      }
      if (
        room?.max_members != null &&
        (room.member_count ?? 0) >= room.max_members
      ) {
        return NextResponse.json({ error: "Sala lotada" }, { status: 403 });
      }

      const { error: insErr } = await admin.from("room_members").insert({
        room_id: roomId,
        user_id: resolvedTargetId,
        role: "member",
        is_banned: false,
      });
      if (insErr) {
        if (insErr.code === "23505") {
          return NextResponse.json(
            { error: "Usuário já é membro desta sala" },
            { status: 400 }
          );
        }
        throw insErr;
      }
      return NextResponse.json({ ok: true, invited: true, user_id: resolvedTargetId });
    }

    if (action === "kick") {
      if (!membership || membership.is_banned) {
        return NextResponse.json(
          { error: "Usuário não é membro ativo desta sala" },
          { status: 404 }
        );
      }
      if (membership.role === "creator") {
        return NextResponse.json(
          { error: "Não é possível expulsar o criador da sala" },
          { status: 403 }
        );
      }
      const { error: delErr } = await admin
        .from("room_members")
        .delete()
        .eq("room_id", roomId)
        .eq("user_id", resolvedTargetId);
      if (delErr) throw delErr;
      return NextResponse.json({ ok: true, kicked: true, user_id: resolvedTargetId });
    }

    if (action === "ban") {
      if (membership?.role === "creator") {
        return NextResponse.json(
          { error: "Não é possível banir o criador da sala" },
          { status: 403 }
        );
      }

      let bannedUntil: string | null = null;
      const days =
        typeof body.duration_days === "number" ? body.duration_days : null;
      if (days != null && days > 0) {
        const d = new Date();
        d.setDate(d.getDate() + days);
        bannedUntil = d.toISOString();
      }

      if (membership) {
        const { error: upErr } = await admin
          .from("room_members")
          .update({ is_banned: true, banned_until: bannedUntil })
          .eq("room_id", roomId)
          .eq("user_id", resolvedTargetId);
        if (upErr) throw upErr;
      } else {
        const { error: insErr } = await admin.from("room_members").insert({
          room_id: roomId,
          user_id: resolvedTargetId,
          role: "member",
          is_banned: true,
          banned_until: bannedUntil,
        });
        if (insErr) throw insErr;
      }
      return NextResponse.json({
        ok: true,
        banned: true,
        permanent: bannedUntil == null,
        banned_until: bannedUntil,
        user_id: resolvedTargetId,
      });
    }

    // unban
    if (!membership || !membership.is_banned) {
      return NextResponse.json(
        { error: "Usuário não está banido nesta sala" },
        { status: 404 }
      );
    }
    // Desbanir: remove a linha de ban (não reinstala como membro)
    // Para voltar, o usuário precisa entrar de novo ou ser convidado.
    // Se quiser manter como membro ao desbanir, troque por update is_banned=false.
    const { error: unbanErr } = await admin
      .from("room_members")
      .update({ is_banned: false, banned_until: null })
      .eq("room_id", roomId)
      .eq("user_id", resolvedTargetId);
    if (unbanErr) throw unbanErr;

    return NextResponse.json({
      ok: true,
      unbanned: true,
      user_id: resolvedTargetId,
    });
  } catch (error) {
    const { message, status } = safeErrorResponse(
      error,
      500,
      "[admin/rooms/members POST]"
    );
    return NextResponse.json({ error: message }, { status });
  }
}
