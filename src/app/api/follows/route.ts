import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { dispatchPushForNotification } from "@/lib/push-dispatch";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { selectCols, FOLLOW_LIST_PROFILE_COLUMNS_NO_NBH } from "@/lib/safe-columns";
import { safeErrorResponse } from "@/lib/safe-error";
import {
  buildPrivacyContext,
  getSafeFollowCounts,
  filterFollowListItems,
  batchFetchPrivacyFlags,
} from "@/lib/privacy-filter";

// GET /api/follows?userId=xxx — Buscar seguidores e seguindo de um usuário
export async function GET(req: NextRequest) {
  try {
    const blocked = await rateLimitByRule(req, "follows:list", undefined);
    if (blocked) return blocked;
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "userId é obrigatório" }, { status: 400 });
    }

    // Buscar configurações de privacidade do perfil
    const { data: targetProfile } = await supabase
      .from("profiles")
      .select("is_private, hide_following, hide_followers, hide_neighborhood, approve_followers")
      .eq("id", userId)
      .single();

    const { data: { user: authUser } } = await supabase.auth.getUser();
    const viewerId = authUser?.id || null;
    const isOwnProfile = viewerId === userId;

    // Determine follow relationship
    let followRow: { status: string } | null | undefined = undefined;
    if (viewerId && !isOwnProfile) {
      const { data: fr } = await supabase
        .from("follows")
        .select("id, status")
        .eq("follower_id", viewerId)
        .eq("following_id", userId)
        .maybeSingle();
      followRow = fr;
    }

    // SEC-009: Build privacy context
    const ctx = buildPrivacyContext(
      viewerId,
      userId,
      targetProfile || {},
      followRow
    );

    // SEC-009: Use FOLLOW_LIST_PROFILE_COLUMNS_NO_NBH
    const followProfileCols = selectCols(FOLLOW_LIST_PROFILE_COLUMNS_NO_NBH);

    // Buscar quem o usuário segue (só aceitos)
    const { data: following, error: fErr } = await supabase
      .from("follows")
      .select(`following_id, created_at, following:profiles!follows_following_id_fkey(${followProfileCols})`)
      .eq("follower_id", userId)
      .eq("status", "accepted")
      .order("created_at", { ascending: false });

    if (fErr) throw fErr;

    // Buscar quem segue o usuário (só aceitos)
    const { data: followers, error: foErr } = await supabase
      .from("follows")
      .select(`follower_id, created_at, follower:profiles!follows_follower_id_fkey(${followProfileCols})`)
      .eq("following_id", userId)
      .eq("status", "accepted")
      .order("created_at", { ascending: false });

    if (foErr) throw foErr;

    // Buscar solicitações pendentes (só o dono do perfil vê)
    let pendingRequests: any[] = [];
    if (isOwnProfile) {
      const { data: pending } = await supabase
        .from("follows")
        .select(`id, follower_id, created_at, follower:profiles!follows_follower_id_fkey(${followProfileCols})`)
        .eq("following_id", userId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      pendingRequests = pending || [];
    }

    // SEC-009: Batch fetch privacy flags
    const allVisibleUserIds = new Set<string>();
    for (const item of ((following || []) as any[])) {
      if (item.following?.id) allVisibleUserIds.add(item.following.id);
    }
    for (const item of ((followers || []) as any[])) {
      if (item.follower?.id) allVisibleUserIds.add(item.follower.id);
    }
    for (const item of pendingRequests) {
      if (item.follower?.id) allVisibleUserIds.add(item.follower.id);
    }
    if (viewerId) allVisibleUserIds.add(viewerId);

    const { hiddenNeighborhoodIds } = await batchFetchPrivacyFlags(
      supabase,
      Array.from(allVisibleUserIds)
    );

    let filteredFollowing = filterFollowListItems(following || [], hiddenNeighborhoodIds);
    let filteredFollowers = filterFollowListItems(followers || [], hiddenNeighborhoodIds);
    let filteredPending = filterFollowListItems(pendingRequests, hiddenNeighborhoodIds);

    const followingCount = following?.length || 0;
    const followersCount = followers?.length || 0;
    const pendingCount = pendingRequests.length;

    const canSeeFollowing = isOwnProfile || !ctx.privacy.hide_following;
    const canSeeFollowers = isOwnProfile || !ctx.privacy.hide_followers;

    const safeCounts = getSafeFollowCounts(followingCount, followersCount, ctx);

    const isRestricted = ctx.privacy.is_private && !ctx.isOwnProfile && !ctx.isFollowing;

    if (!canSeeFollowing) filteredFollowing = [];
    if (!canSeeFollowers) filteredFollowers = [];

    return NextResponse.json({
      followingCount: safeCounts.followingCount,
      followersCount: safeCounts.followersCount,
      isFollowing: ctx.isFollowing,
      isPending: ctx.isPending,
      approveFollowers: ctx.privacy.approve_followers,
      following: filteredFollowing,
      followers: filteredFollowers,
      pendingRequests: isOwnProfile ? filteredPending : [],
      pendingCount: isOwnProfile ? pendingCount : 0,
      _privacy: {
        hide_following: ctx.privacy.hide_following,
        hide_followers: ctx.privacy.hide_followers,
        hide_neighborhood: ctx.privacy.hide_neighborhood,
        approve_followers: ctx.privacy.approve_followers,
        canSeeFollowing,
        canSeeFollowers,
        isRestricted,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/follows — Seguir ou deixar de seguir
// REL-006: Operação totalmente atômica via rpc_toggle_follow.
// Verifica blocks, duplicidade e approve_followers dentro de uma
// transação no banco, sem janela de corrida.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    const blocked = await rateLimitByRule(req, "follows:toggle", user?.id);
    if (blocked) return blocked;

    const { targetUserId } = await req.json();
    if (!targetUserId) {
      return NextResponse.json({ error: "targetUserId é obrigatório" }, { status: 400 });
    }

    // REL-006: operação atômica no banco
    const { data, error } = await supabase
      .rpc("rpc_toggle_follow", { p_target_user_id: targetUserId })
      .maybeSingle();

    if (error) throw error;

    if (!data) throw new Error("RPC retornou vazio");
    const result = data as { ok: boolean; error?: string; action?: string; following?: boolean; pending?: boolean };

    if (!result.ok) {
      switch (result.error) {
        case "not_authenticated":
          return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
        case "cannot_follow_self":
          return NextResponse.json({ error: "Não pode seguir a si mesmo" }, { status: 400 });
        case "blocked":
          return NextResponse.json({ error: "Não é possível seguir este usuário" }, { status: 403 });
        default:
          return NextResponse.json({ error: "Não foi possível processar" }, { status: 400 });
      }
    }

    // Disparar push para notificação criada pelo trigger (apenas em follow novo)
    if (result.action === "followed") {
      (async () => {
        try {
          await new Promise((r) => setTimeout(r, 200));
          const notifType = result.pending ? "follow_request" : "follow";
          const { data: notif } = await supabase
            .from("notifications")
            .select("id")
            .eq("type", notifType)
            .eq("actor_id", user.id)
            .eq("user_id", targetUserId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (notif?.id) {
            dispatchPushForNotification(notif.id).catch(() => {});
          }
        } catch { /* silent */ }
      })();
    }

    return NextResponse.json({
      following: !!result.following,
      pending: !!result.pending,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/follows?followerId=xxx — Remover um seguidor
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }
    const blocked = await rateLimitByRule(req, "follows:remove", user?.id);
    if (blocked) return blocked;

    const { searchParams } = new URL(req.url);
    const followerId = searchParams.get("followerId");
    if (!followerId) {
      return NextResponse.json({ error: "followerId é obrigatório" }, { status: 400 });
    }

    const { error } = await supabase
      .from("follows")
      .delete()
      .eq("follower_id", followerId)
      .eq("following_id", user.id);

    if (error) throw error;

    return NextResponse.json({ removed: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}