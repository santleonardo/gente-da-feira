// GET /api/users/me/export
// Exporta TODOS os dados do usuário como JSON (LGPD — direito ao portabilidade).
//
// Coleta:
//   - Perfil, posts, comentários, reações
//   - Seguidores, seguindo, bloqueados
//   - Mensagens DM e de salas
//   - Notificações, fotos de perfil, vídeos de perfil
//   - Participações em salas
//
// Usa admin client para bypass RLS e obter dados completos.
// Se uma seção falhar, as demais são incluídas normalmente.

import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { safeErrorResponse } from "@/lib/safe-error";
import { PROFILE_SAFE_COLUMNS, selectCols } from "@/lib/safe-columns";

export async function GET(req: NextRequest) {
  try {
    // ── 1. Autenticação ─────────────────────────────────────────────────
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    // ── 2. Rate limit ───────────────────────────────────────────────────
    const blocked = await rateLimitByRule(req, "account:export", user.id);
    if (blocked) return blocked;

    const admin = createAdminClient();

    // ── 3. Coletar todos os dados em paralelo ──────────────────────────
    const [
      profileResult,
      postsResult,
      commentsResult,
      reactionsResult,
      followersResult,
      followingResult,
      blockedUsersResult,
      dmMessagesResult,
      roomMessagesResult,
      notificationsResult,
      profilePhotosResult,
      profileVideosResult,
      roomMembershipsResult,
    ] = await Promise.allSettled([
      // Perfil
      admin
        .from("profiles")
        .select(selectCols(PROFILE_SAFE_COLUMNS))
        .eq("id", user.id)
        .single(),

      // Posts (não deletados)
      admin
        .from("posts")
        .select("*")
        .eq("author_id", user.id)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false }),

      // Comentários (não deletados)
      admin
        .from("comments")
        .select("*")
        .eq("author_id", user.id)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false }),

      // Reações
      admin
        .from("reactions")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),

      // Seguidores
      admin
        .from("follows")
        .select("id, follower_id, status, created_at, follower:profiles!follows_follower_id_fkey(id, display_name, username, avatar_url)")
        .eq("following_id", user.id)
        .order("created_at", { ascending: false }),

      // Seguindo
      admin
        .from("follows")
        .select("id, following_id, status, created_at, following:profiles!follows_following_id_fkey(id, display_name, username, avatar_url)")
        .eq("follower_id", user.id)
        .order("created_at", { ascending: false }),

      // Usuários bloqueados
      admin
        .from("blocks")
        .select("id, blocked_id, created_at, blocked:profiles!blocks_blocked_id_fkey(id, display_name, username, avatar_url)")
        .eq("blocker_id", user.id)
        .order("created_at", { ascending: false }),

      // Mensagens DM
      admin
        .from("messages")
        .select("id, content, media_type, media_url, created_at, dm_id, sender_id, direct_chat:direct_chats(id, initiator_id, receiver_id)")
        .eq("sender_id", user.id)
        .eq("target_type", "dm")
        .eq("is_deleted", false)
        .order("created_at", { ascending: false }),

      // Mensagens de sala
      admin
        .from("messages")
        .select("id, content, media_type, media_url, created_at, room_id, sender_id, room:rooms(id, name, slug)")
        .eq("sender_id", user.id)
        .eq("target_type", "room")
        .eq("is_deleted", false)
        .order("created_at", { ascending: false }),

      // Notificações (últimas 100)
      admin
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100),

      // Fotos de perfil
      admin
        .from("profile_photos")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),

      // Vídeos de perfil
      admin
        .from("profile_videos")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),

      // Participações em salas
      admin
        .from("room_members")
        .select("id, role, created_at, room_id, room:rooms(id, name, slug, type)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
    ]);

    // ── 4. Montar export com tratamento graceful de erros ───────────────
    function extractData(result: PromiseSettledResult<any>): any[] | null {
      if (result.status === "fulfilled") return result.value?.data || [];
      console.error("[account:export] Seção falhou:", result.reason);
      return null;
    }

    function extractSingle(result: PromiseSettledResult<any>): any | null {
      if (result.status === "fulfilled") return result.value?.data || null;
      console.error("[account:export] Perfil falhou:", result.reason);
      return null;
    }

    const exportData = {
      exported_at: new Date().toISOString(),
      platform: "Gente da Feira",
      account: extractSingle(profileResult),
      posts: extractData(postsResult),
      comments: extractData(commentsResult),
      reactions: extractData(reactionsResult),
      followers: extractData(followersResult),
      following: extractData(followingResult),
      blocked_users: extractData(blockedUsersResult),
      messages: {
        direct_messages: extractData(dmMessagesResult),
        room_messages: extractData(roomMessagesResult),
      },
      notifications: extractData(notificationsResult),
      profile_photos: extractData(profilePhotosResult),
      profile_videos: extractData(profileVideosResult),
      room_memberships: extractData(roomMembershipsResult),
    };

    // ── 5. Retornar como JSON com header de download ───────────────────
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `gente-da-feira-export-${dateStr}.json`;

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    const { message, status } = safeErrorResponse(error, 500, "[account:export]");
    return NextResponse.json({ error: message }, { status });
  }
}
