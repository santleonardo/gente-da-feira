// ============================================================
// API de Posts — com paginação cursor-based (keyset pagination)
//
// Parâmetros GET:
//   neighborhood  — filtra por bairro ("all" ignora o filtro)
//   limit         — quantos posts retornar (padrão 20, máx 50)
//   cursor        — created_at do último post visto (ISO 8601)
//                   Se ausente, retorna os mais recentes.
//   authorId      — filtra posts de um usuário específico
//
// Resposta:
//   { posts, nextCursor, hasMore }
//   nextCursor é null quando não há mais posts.
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getBlockedUserIds, isBlocked } from "@/lib/block-check";
import { dispatchPushForNotification } from "@/lib/push-dispatch";
import { rateLimitByRule } from "@/lib/apply-rate-limit";

const MAX_PHOTOS_PER_POST = 5;
const MAX_ACTIVE_MEDIA_POSTS = 5;
const MEDIA_EXPIRATION_HOURS = 12;
const MAX_VIDEO_POSTS_PER_12H = 5;
const MAX_AUDIO_DURATION_SECONDS = 60;
const MAX_VIDEO_DURATION_SECONDS = 30;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);

    const neighborhood = searchParams.get("neighborhood");
    const authorId     = searchParams.get("authorId");
    const cursor       = searchParams.get("cursor"); // created_at do último post
    const rawLimit     = parseInt(searchParams.get("limit") || String(DEFAULT_PAGE_SIZE));
    const limit        = Math.min(Math.max(1, rawLimit), MAX_PAGE_SIZE);

    const { data: { user: authUser } } = await supabase.auth.getUser();

    const blocked = await rateLimitByRule(req, "posts:list", authUser?.id);
    if (blocked) return blocked;

    let query = supabase
      .from("posts")
      .select(`
        *,
        author:profiles(id, display_name, username, avatar_url, neighborhood),
        reactions(user_id, type),
        comments(count),
        shared_post:posts!shared_post_id(
          id, content, image_urls, video_url, audio_url, created_at,
          author:profiles(id, display_name, username, avatar_url, neighborhood)
        )
      `)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .limit(limit + 1); // +1 para detectar se há mais páginas

    // Keyset cursor — retorna posts anteriores ao cursor
    if (cursor) {
      query = query.lt("created_at", cursor);
    }

    if (authorId) {
      query = query.eq("author_id", authorId);
    }

    if (neighborhood && neighborhood !== "all") {
      query = query.or(`neighborhood.eq.${neighborhood},neighborhood.is.null`);
    }

    const { data: rawPosts, error } = await query;
    if (error) throw error;

    // Detectar hasMore e nextCursor
    const hasMore  = (rawPosts?.length ?? 0) > limit;
    const posts    = hasMore ? rawPosts!.slice(0, limit) : (rawPosts ?? []);
    const nextCursor = hasMore ? posts[posts.length - 1].created_at : null;

    const now = new Date().toISOString();

    let viewerFollowingIds = new Set<string>();
    let viewerFollowerIds  = new Set<string>();
    let blockedUserIds     = new Set<string>();

    if (authUser && !authorId) {
      const [followingRes, followersRes] = await Promise.all([
        supabase
          .from("follows")
          .select("following_id")
          .eq("follower_id", authUser.id)
          .eq("status", "accepted"),
        supabase
          .from("follows")
          .select("follower_id")
          .eq("following_id", authUser.id)
          .eq("status", "accepted"),
      ]);
      if (followingRes.data) viewerFollowingIds = new Set(followingRes.data.map((f: any) => f.following_id));
      if (followersRes.data) viewerFollowerIds  = new Set(followersRes.data.map((f: any) => f.follower_id));
      blockedUserIds = await getBlockedUserIds(supabase, authUser.id);
    }

    const filteredPosts = posts
      .map((p: any) => ({
        ...p,
        comment_count: p.comments?.[0]?.count ?? 0,
        comments: undefined,
        shared_post: Array.isArray(p.shared_post)
          ? (p.shared_post[0] ?? null)
          : (p.shared_post ?? null),
      }))
      .filter((p: any) => {
        if (p.expires_at && p.expires_at < now) return false;
        // SEC-004: Filter out posts from blocked users
        if (blockedUserIds.size > 0 && blockedUserIds.has(p.author_id)) return false;
        if (p.shared_post && blockedUserIds.size > 0 && blockedUserIds.has(p.shared_post.author_id)) return false;
        if (p.visibility === "followers") {
          if (!authUser) return false;
          if (p.author_id === authUser.id) return true;
          return viewerFollowingIds.has(p.author_id) && viewerFollowerIds.has(p.author_id);
        }
        return true;
      });

    cleanupExpiredPosts().catch(() => {});

    return NextResponse.json({ posts: filteredPosts, nextCursor, hasMore });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function cleanupExpiredPosts() {
  try {
    const admin = createAdminClient();
    const now = new Date().toISOString();

    const { data: expiredPosts } = await admin
      .from("posts")
      .select("id, image_urls, video_url, audio_url")
      .lt("expires_at", now)
      .eq("is_deleted", false)
      .limit(100);

    if (!expiredPosts || expiredPosts.length === 0) return;

    const expiredIds = expiredPosts.map((p: any) => p.id);
    await admin.from("posts").update({ is_deleted: true }).in("id", expiredIds);

    for (const post of expiredPosts) {
      if (post.image_urls?.length > 0) {
        const paths = extractStoragePaths(post.image_urls, "post-photos");
        if (paths.length > 0) await admin.storage.from("post-photos").remove(paths).catch(() => {});
      }
      if (post.video_url) {
        const paths = extractStoragePaths([post.video_url], "post-videos");
        if (paths.length > 0) await admin.storage.from("post-videos").remove(paths).catch(() => {});
      }
      if (post.audio_url) {
        const paths = extractStoragePaths([post.audio_url], "post-audios");
        if (paths.length > 0) await admin.storage.from("post-audios").remove(paths).catch(() => {});
      }
    }
  } catch { /* silent */ }
}

function extractStoragePaths(urls: string[], bucket: string): string[] {
  return urls
    .map((url: string) => {
      try {
        const parts = new URL(url).pathname.split("/");
        const idx = parts.indexOf(bucket);
        if (idx >= 0) return parts.slice(idx + 1).join("/");
        return null;
      } catch { return null; }
    })
    .filter(Boolean) as string[];
}

// ─── POST ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const blocked = await rateLimitByRule(req, "posts:create", user?.id);
    if (blocked) return blocked;

    const {
      content, neighborhood, imageUrls, videoUrl, audioUrl, postType,
      audioDuration, videoDuration, visibility, sharedPostId, postStyle,
    } = await req.json();

    const hasPhotos = imageUrls && imageUrls.length > 0;
    const hasVideo  = !!videoUrl;
    const hasAudio  = !!audioUrl;
    const hasMedia  = hasPhotos || hasVideo || hasAudio;

    if (!hasMedia && (!content || !content.trim())) {
      return NextResponse.json({ error: "Conteúdo é obrigatório" }, { status: 400 });
    }

    if (content?.trim()) {
      const plainText = content.replace(/<[^>]*>/g, "").replace(/&\w+;/g, " ");
      if (plainText.trim().length > 1000) {
        return NextResponse.json({ error: "Post muito longo (máx 1000 chars)" }, { status: 400 });
      }
    }

    const validFonts      = ["Nunito","Quicksand","Poppins","Inter","Comfortaa","Montserrat","Lato","Raleway","DM Sans","Work Sans"];
    const validAlignments = ["left","center","right","justify"];
    let validatedStyle: any = null;

    if (postStyle && typeof postStyle === "object") {
      validatedStyle = {
        font:        validFonts.includes(postStyle.font) ? postStyle.font : null,
        bold:        typeof postStyle.bold === "boolean" ? postStyle.bold : false,
        italic:      typeof postStyle.italic === "boolean" ? postStyle.italic : false,
        alignment:   validAlignments.includes(postStyle.alignment) ? postStyle.alignment : "left",
        postItColor: typeof postStyle.postItColor === "number" && postStyle.postItColor >= 0 && postStyle.postItColor <= 11 ? postStyle.postItColor : null,
        fontColor:   typeof postStyle.fontColor === "string" && /^#[0-9a-fA-F]{6}$/.test(postStyle.fontColor) ? postStyle.fontColor : null,
      };
      if (!validatedStyle.font)             delete validatedStyle.font;
      if (validatedStyle.postItColor === null) delete validatedStyle.postItColor;
      if (!validatedStyle.fontColor)        delete validatedStyle.fontColor;
    }

    const validVisibility = visibility === "followers" ? "followers" : "public";
    let expiresAt: string | null = null;

    if (hasPhotos && imageUrls.length > MAX_PHOTOS_PER_POST) {
      return NextResponse.json({ error: `Máximo ${MAX_PHOTOS_PER_POST} fotos por post` }, { status: 400 });
    }
    if (hasVideo && videoDuration && videoDuration > MAX_VIDEO_DURATION_SECONDS) {
      return NextResponse.json({ error: `Vídeo muito longo (máx ${MAX_VIDEO_DURATION_SECONDS}s)` }, { status: 400 });
    }
    if (hasAudio && audioDuration && audioDuration > MAX_AUDIO_DURATION_SECONDS) {
      return NextResponse.json({ error: `Áudio muito longo (máx ${MAX_AUDIO_DURATION_SECONDS}s)` }, { status: 400 });
    }

    if (hasVideo) {
      const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
      const { data: recentVideoPosts } = await supabase
        .from("posts").select("id")
        .eq("author_id", user.id).eq("is_deleted", false)
        .not("video_url", "is", null).gte("created_at", twelveHoursAgo);
      if (recentVideoPosts && recentVideoPosts.length >= MAX_VIDEO_POSTS_PER_12H) {
        return NextResponse.json({
          error: `Você já postou ${MAX_VIDEO_POSTS_PER_12H} vídeos nas últimas 12h. Aguarde para postar mais.`
        }, { status: 400 });
      }
    }

    if (hasMedia) {
      const now = new Date().toISOString();
      const { data: activeMediaPosts } = await supabase
        .from("posts").select("id")
        .eq("author_id", user.id).eq("is_deleted", false).gt("expires_at", now);
      if (activeMediaPosts && activeMediaPosts.length >= MAX_ACTIVE_MEDIA_POSTS) {
        const { data: nextExpiring } = await supabase
          .from("posts").select("expires_at")
          .eq("author_id", user.id).eq("is_deleted", false).gt("expires_at", now)
          .order("expires_at", { ascending: true }).limit(1);
        const expiresIn = nextExpiring?.[0]?.expires_at ? getTimeUntil(nextExpiring[0].expires_at) : "em breve";
        return NextResponse.json({
          error: `Você já tem ${MAX_ACTIVE_MEDIA_POSTS} posts com mídia ativos. Próximo expira ${expiresIn}.`
        }, { status: 400 });
      }
      const expires = new Date();
      expires.setHours(expires.getHours() + MEDIA_EXPIRATION_HOURS);
      expiresAt = expires.toISOString();
    }

    let validSharedPostId: string | null = null;
    if (sharedPostId) {
      const { data: sharedPost } = await supabase
        .from("posts").select("id").eq("id", sharedPostId).eq("is_deleted", false).single();
      if (sharedPost) validSharedPostId = sharedPostId;
    }

    const { data: post, error } = await supabase
      .from("posts")
      .insert({
        content: (content || "").trim(),
        neighborhood: neighborhood || null,
        author_id: user.id,
        image_urls: hasPhotos ? imageUrls : [],
        video_url: hasVideo ? videoUrl : null,
        audio_url: hasAudio ? audioUrl : null,
        audio_duration: hasAudio && audioDuration ? audioDuration : null,
        video_duration: hasVideo && videoDuration ? videoDuration : null,
        visibility: validVisibility,
        expires_at: expiresAt,
        shared_post_id: validSharedPostId,
        post_style: validatedStyle,
        post_type: postType === "rich" ? "rich" : "simple",
      })
      .select(`
        *,
        author:profiles(id, display_name, username, avatar_url, neighborhood),
        reactions(user_id, type),
        shared_post:posts!shared_post_id(
          id, content, image_urls, video_url, audio_url, created_at,
          author:profiles(id, display_name, username, avatar_url, neighborhood)
        )
      `)
      .single();

    if (error) throw error;

    const mentionedUsernames = [
      ...new Set([...(content || "").matchAll(/@(\w+)/g)].map((m) => m[1])),
    ];

    if (mentionedUsernames.length > 0) {
      (async () => {
        try {
          const adminClient = createAdminClient();
          for (const username of mentionedUsernames) {
            const { data: mentioned } = await adminClient
              .from("profiles").select("id").eq("username", username).single();
            if (mentioned && mentioned.id !== user.id) {
              // SEC-004: Don't notify if blocked
              const { count: mentionBlockCount } = await adminClient
                .from("blocks")
                .select("id", { count: "exact", head: true })
                .or(
                  `and(blocker_id.eq.${user.id},blocked_id.eq.${mentioned.id}),and(blocker_id.eq.${mentioned.id},blocked_id.eq.${user.id})`
                );
              if ((mentionBlockCount ?? 0) > 0) continue;

              const { data: notif } = await adminClient
                .from("notifications")
                .insert({
                  user_id: mentioned.id, type: "mention",
                  actor_id: user.id, post_id: post.id, is_read: false,
                })
                .select("id")
                .single();

              // SEC-001: Dispatch push para menções
              if (notif?.id) {
                dispatchPushForNotification(notif.id).catch(() => {});
              }
            }
          }
        } catch { /* silent */ }
      })();
    }

    return NextResponse.json({
      post: {
        ...post,
        comment_count: 0,
        shared_post: Array.isArray(post.shared_post)
          ? (post.shared_post[0] ?? null)
          : (post.shared_post ?? null),
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ─── DELETE ──────────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const blocked = await rateLimitByRule(req, "posts:delete", user?.id);
    if (blocked) return blocked;

    const postId = new URL(req.url).searchParams.get("id");
    if (!postId) return NextResponse.json({ error: "ID necessário" }, { status: 400 });

    const admin = createAdminClient();
    const { data: post, error: fetchError } = await admin
      .from("posts").select("image_urls, video_url, audio_url")
      .eq("id", postId).eq("author_id", user.id).single();

    if (fetchError || !post) {
      return NextResponse.json({ error: "Post não encontrado" }, { status: 404 });
    }

    const { error } = await admin
      .from("posts").update({ is_deleted: true })
      .eq("id", postId).eq("author_id", user.id);

    if (error) throw error;

    if (post.image_urls && post.image_urls.length > 0) {
      const paths = extractStoragePaths(post.image_urls, "post-photos");
      if (paths.length > 0) await admin.storage.from("post-photos").remove(paths).catch(() => {});
    }
    if (post.video_url) {
      const paths = extractStoragePaths([post.video_url], "post-videos");
      if (paths.length > 0) await admin.storage.from("post-videos").remove(paths).catch(() => {});
    }
    if (post.audio_url) {
      const paths = extractStoragePaths([post.audio_url], "post-audios");
      if (paths.length > 0) await admin.storage.from("post-audios").remove(paths).catch(() => {});
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function getTimeUntil(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return "agora";
  const hours = Math.floor(diff / 3600000);
  const mins  = Math.floor((diff % 3600000) / 60000);
  if (hours > 0) return `em ${hours}h${mins > 0 ? ` ${mins}min` : ""}`;
  return `em ${mins}min`;
}
