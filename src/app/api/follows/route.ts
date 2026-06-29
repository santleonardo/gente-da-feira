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

    // SEC-009: Use FOLLOW_LIST_PROFILE_COLUMNS_NO_NBH — neighborhood is added
    // conditionally after checking hide_neighborhood for each user
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

    // SEC-009: Batch fetch privacy flags for all visible profile users
    const allVisibleUserIds = new Set<string>();
    for (const item of (following || [])) {
      if (item.following?.id) allVisibleUserIds.add(item.following.id);
    }
    for (const item of (followers || [])) {
      if (item.follower?.id) allVisibleUserIds.add(item.follower.id);
    }
    for (const item of pendingRequests) {
      if (item.follower?.id) allVisibleUserIds.add(item.follower.id);
    }

    // Add the viewer themselves (in case they see their own data)
    if (viewerId) allVisibleUserIds.add(viewerId);

    const { hiddenNeighborhoodIds } = await batchFetchPrivacyFlags(
      supabase,
      Array.from(allVisibleUserIds)
    );

    // SEC-009: Filter neighborhood from list items
    let filteredFollowing = filterFollowListItems(following || [], hiddenNeighborhoodIds);
    let filteredFollowers = filterFollowListItems(followers || [], hiddenNeighborhoodIds);
    let filteredPending = filterFollowListItems(pendingRequests, hiddenNeighborhoodIds);

    // Contagem (só aceitos)
    const followingCount = following?.length || 0;
    const followersCount = followers?.length || 0;
    const pendingCount = pendingRequests.length;

    // SEC-009: Determine visibility of lists
    const canSeeFollowing = isOwnProfile || !ctx.privacy.hide_following;
    const canSeeFollowers = isOwnProfile || !ctx.privacy.hide_followers;

    // SEC-009: Get safe counts (null when hidden from viewer)
    const safeCounts = getSafeFollowCounts(followingCount, followersCount, ctx);

    // Apply list visibility
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
        isRestricted: ctx.isRestricted,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/follows — Seguir, solicitar ou deixar de seguir
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

    if (user.id === targetUserId) {
      return NextResponse.json({ error: "Não pode seguir a si mesmo" }, { status: 400 });
    }

    // Verificar bloqueio em ambos os sentidos
    const { data: blockedByViewer } = await supabase
      .from("blocks")
      .select("id")
      .eq("blocker_id", user.id)
      .eq("blocked_id", targetUserId)
      .maybeSingle();

    const { data: blockedByTarget } = await supabase
      .from("blocks")
      .select("id")
      .eq("blocker_id", targetUserId)
      .eq("blocked_id", user.id)
      .maybeSingle();

    if (blockedByViewer || blockedByTarget) {
      return NextResponse.json({ error: "Não é possível seguir este usuário" }, { status: 403 });
    }

    // Verificar se já segue ou tem solicitação pendente
    const { data: existing } = await supabase
      .from("follows")
      .select("id, status")
      .eq("follower_id", user.id)
      .eq("following_id", targetUserId)
      .maybeSingle();

    if (existing) {
      // Deixar de seguir ou cancelar solicitação
      const { error: delErr } = await supabase
        .from("follows")
        .delete()
        .eq("id", existing.id);

      if (delErr) throw delErr;
      return NextResponse.json({ following: false, pending: false });
    } else {
      // Verificar se o alvo exige aprovação
      const { data: targetProfile } = await supabase
        .from("profiles")
        .select("approve_followers")
        .eq("id", targetUserId)
        .single();

      const approveFollowers = targetProfile?.approve_followers || false;
      const status = approveFollowers ? "pending" : "accepted";

      const { error: insertErr } = await supabase
        .from("follows")
        .insert({ follower_id: user.id, following_id: targetUserId, status });

      if (insertErr) throw insertErr;

      // Notificação é criada pelo TRIGGER notify_new_follow().
      // SEC-001: Disparar push para a notificação criada pelo trigger.
      (async () => {
        try {
          // Aguardar um breve momento para o trigger completar
          await new Promise((r) => setTimeout(r, 200));
          const notifType = approveFollowers ? "follow_request" : "follow";
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

      if (approveFollowers) {
        return NextResponse.json({ following: false, pending: true });
      } else {
        return NextResponse.json({ following: true, pending: false });
      }
    }
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