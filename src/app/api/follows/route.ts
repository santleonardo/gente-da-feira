import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { dispatchPushForNotification } from "@/lib/push-dispatch";
import { rateLimitByRule } from "@/lib/apply-rate-limit";

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

    const isPrivate = targetProfile?.is_private || false;
    const hideFollowing = targetProfile?.hide_following || false;
    const hideFollowers = targetProfile?.hide_followers || false;
    const hideNeighborhood = targetProfile?.hide_neighborhood || false;
    const approveFollowers = targetProfile?.approve_followers || false;

    // Buscar quem o usuário segue (só aceitos)
    const { data: following, error: fErr } = await supabase
      .from("follows")
      .select("following_id, created_at, following:profiles!follows_following_id_fkey(id, display_name, username, avatar_url, neighborhood, bio)")
      .eq("follower_id", userId)
      .eq("status", "accepted")
      .order("created_at", { ascending: false });

    if (fErr) throw fErr;

    // Buscar quem segue o usuário (só aceitos)
    const { data: followers, error: foErr } = await supabase
      .from("follows")
      .select("follower_id, created_at, follower:profiles!follows_follower_id_fkey(id, display_name, username, avatar_url, neighborhood, bio)")
      .eq("following_id", userId)
      .eq("status", "accepted")
      .order("created_at", { ascending: false });

    if (foErr) throw foErr;

    // Buscar solicitações pendentes (só o dono do perfil vê)
    let pendingRequests: any[] = [];
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const isOwnProfile = authUser?.id === userId;

    if (isOwnProfile) {
      const { data: pending } = await supabase
        .from("follows")
        .select("id, follower_id, created_at, follower:profiles!follows_follower_id_fkey(id, display_name, username, avatar_url, neighborhood, bio)")
        .eq("following_id", userId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      pendingRequests = pending || [];
    }

    // Verificar se o viewer segue o perfil
    let isFollowing = false;
    let isPending = false;

    if (authUser && !isOwnProfile) {
      const { data: followRow } = await supabase
        .from("follows")
        .select("id, status")
        .eq("follower_id", authUser.id)
        .eq("following_id", userId)
        .maybeSingle();
      if (followRow) {
        isFollowing = followRow.status === "accepted";
        isPending = followRow.status === "pending";
      }
    }

    // Contagem (só aceitos)
    const followingCount = following?.length || 0;
    const followersCount = followers?.length || 0;
    const pendingCount = pendingRequests.length;

    // Determinar se o viewer pode ver as listas
    const canSeeFollowing = isOwnProfile || !hideFollowing;
    const canSeeFollowers = isOwnProfile || !hideFollowers;
    const isRestricted = isPrivate && !isOwnProfile && !isFollowing;

    // Filtrar listas de acordo com privacidade
    const filteredFollowing = canSeeFollowing ? (following || []) : [];
    const filteredFollowers = canSeeFollowers ? (followers || []) : [];

    return NextResponse.json({
      followingCount,
      followersCount,
      isFollowing,
      isPending,
      approveFollowers,
      following: filteredFollowing,
      followers: filteredFollowers,
      pendingRequests: isOwnProfile ? pendingRequests : [],
      pendingCount: isOwnProfile ? pendingCount : 0,
      _privacy: {
        hide_following: hideFollowing,
        hide_followers: hideFollowers,
        hide_neighborhood: hideNeighborhood,
        approve_followers: approveFollowers,
        canSeeFollowing,
        canSeeFollowers,
        isRestricted,
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
