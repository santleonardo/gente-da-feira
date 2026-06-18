import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimitByRule } from "@/lib/apply-rate-limit";

// GET /api/blocks — Listar usuários bloqueados
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    const blocked = await rateLimitByRule(req, "blocks:list", user?.id);
    if (blocked) return blocked;

    const { searchParams } = new URL(req.url);
    const targetId = searchParams.get("targetId");

    if (targetId) {
      const { data: blockedByViewer } = await supabase
        .from("blocks")
        .select("id")
        .eq("blocker_id", user.id)
        .eq("blocked_id", targetId)
        .maybeSingle();

      const { data: blockedByTarget } = await supabase
        .from("blocks")
        .select("id")
        .eq("blocker_id", targetId)
        .eq("blocked_id", user.id)
        .maybeSingle();

      return NextResponse.json({
        isBlockedByViewer: !!blockedByViewer,
        isBlockedByTarget: !!blockedByTarget,
      });
    }

    const { data: blocks, error } = await supabase
      .from("blocks")
      .select("id, blocked_id, created_at, blocked:profiles!blocks_blocked_id_fkey(id, display_name, username, avatar_url)")
      .eq("blocker_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ blocks: blocks || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/blocks — Bloquear ou desbloquear
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    const blocked = await rateLimitByRule(req, "blocks:toggle", user?.id);
    if (blocked) return blocked;

    const { targetUserId } = await req.json();
    if (!targetUserId) {
      return NextResponse.json({ error: "targetUserId é obrigatório" }, { status: 400 });
    }

    if (user.id === targetUserId) {
      return NextResponse.json({ error: "Não pode bloquear a si mesmo" }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from("blocks")
      .select("id")
      .eq("blocker_id", user.id)
      .eq("blocked_id", targetUserId)
      .maybeSingle();

    if (existing) {
      const { error: delErr } = await supabase
        .from("blocks")
        .delete()
        .eq("id", existing.id);

      if (delErr) throw delErr;
      return NextResponse.json({ blocked: false });
    } else {
      const { error: insertErr } = await supabase
        .from("blocks")
        .insert({ blocker_id: user.id, blocked_id: targetUserId });

      if (insertErr) throw insertErr;

      // Remover follow nos dois sentidos
      await supabase
        .from("follows")
        .delete()
        .or(`and(follower_id.eq.${user.id},following_id.eq.${targetUserId}),and(follower_id.eq.${targetUserId},following_id.eq.${user.id})`);

      // SEC-004: Soft-delete DM messages between the two users
      // Find any direct_chat between them and mark all messages as deleted
      const [a, b] = user.id < targetUserId ? [user.id, targetUserId] : [targetUserId, user.id];
      const { data: dmChat } = await supabase
        .from("direct_chats")
        .select("id")
        .eq("initiator_id", a)
        .eq("receiver_id", b)
        .maybeSingle();

      if (dmChat) {
        await supabase
          .from("messages")
          .update({ is_deleted: true })
          .eq("dm_id", dmChat.id)
          .eq("target_type", "dm");
      }

      return NextResponse.json({ blocked: true });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
