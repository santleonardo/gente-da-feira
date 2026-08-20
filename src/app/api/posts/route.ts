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
import { sanitizeRichContent, sanitizeShortText } from "@/lib/sanitize";
import { validateMediaUrl, validateMediaUrlArray, ALLOWED_BUCKETS } from "@/lib/storage-security";
import { selectCols, AUTHOR_PROFILE_COLUMNS_FULL, POST_COLUMNS, SHARED_POST_COLUMNS } from "@/lib/safe-columns";
import {
  filterPostsAuthorNeighborhood,
  batchFetchPrivacyFlags,
} from "@/lib/privacy-filter";
import { getViewerFollowingIds, filterByVisibility } from "@/lib/content-visibility";

// ── Versão Light / Supabase Free ─────────────────────────────
// Limites agressivos para beta público em plano gratuito
// (1 GB storage / 2 GB egress). Vídeo e áudio desabilitados.
const MAX_PHOTOS_PER_POST = 1;
const MAX_ACTIVE_MEDIA_POSTS = 2;
const MEDIA_EXPIRATION_HOURS = 6;
const MAX_VIDEO_POSTS_PER_12H = 0; // desabilitado
const MAX_AUDIO_DURATION_SECONDS = 0;
const MAX_VIDEO_DURATION_SECONDS = 0;
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

    // SEC-009: Use AUTHOR_PROFILE_COLUMNS_FULL for author join
    // (neighborhood is filtered after query)
    const authorCols = selectCols(AUTHOR_PROFILE_COLUMNS_FULL);

    const postCols = selectCols(POST_COLUMNS);
    const sharedPostCols = selectCols(SHARED_POST_COLUMNS);

    let query = supabase
      .from("posts")
      .select(`
        ${postCols},
        author:profiles(${authorCols}),
        reactions(user_id, type),
        comments(count),
        shared_post:posts!shared_post_id(
          ${sharedPostCols},
          author:profiles(${authorCols})
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
    // Cast to any[] — Supabase cannot infer types for complex nested joins
    const posts    = (hasMore ? rawPosts!.slice(0, limit) : (rawPosts ?? [])) as any[];
    const nextCursor = hasMore ? posts[posts.length - 1].created_at : null;

    const now = new Date().toISOString();

    let viewerFollowingIds = new Set<string>();
    let blockedUserIds     = new Set<string>();

    // SEC-010: Always fetch following IDs when authenticated (needed for
    // both feed visibility AND authorId-filtered queries)
    if (authUser) {
      viewerFollowingIds = await getViewerFollowingIds(supabase, authUser.id);
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
        // SEC-010: Centralized visibility enforcement
        // "public" → allowed, "followers" → viewer follows author (accepted), "private" → author only
        return filterByVisibility([p], authUser?.id ?? null, viewerFollowingIds).length === 1;
      });

    // SEC-009: Batch-fetch privacy flags for all post authors and strip neighborhood
    const allAuthorIds = new Set<string>();
    for (const post of filteredPosts) {
      if (post.author?.id) allAuthorIds.add(post.author.id);
      if (post.shared_post?.author?.id) allAuthorIds.add(post.shared_post.author.id);
    }
    const { hiddenNeighborhoodIds } = await batchFetchPrivacyFlags(
      supabase,
      Array.from(allAuthorIds)
    );
    const privacyFilteredPosts = filterPostsAuthorNeighborhood(filteredPosts, hiddenNeighborhoodIds);

    cleanupExpiredPosts().catch(() => {});

    return NextResponse.json({ posts: privacyFilteredPosts, nextCursor, hasMore });
  } catch (error: any) {
    const { message, status } = safeErrorResponse(error, 500, "[posts GET]");
    return NextResponse.json({ error: message }, { status });
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
      cleanupPostMedia(admin, post);
    }
  } catch { /* silent */ }
}

// SEC-008: Usa extractStoragePathFromUrl centralizado — cobre todos os buckets
import { extractStoragePathFromUrl } from "@/lib/storage-security";
import { safeErrorResponse } from "@/lib/safe-error";

function cleanupPostMedia(admin: any, post: any) {
  const IMAGE_BUCKETS = ["post-photos", "post-images"];
  if (post.image_urls?.length > 0) {
    for (const url of post.image_urls) {
      const parsed = extractStoragePathFromUrl(url);
      if (parsed && IMAGE_BUCKETS.includes(parsed.bucket)) {
        admin.storage.from(parsed.bucket).remove([parsed.path]).catch(() => {});
      }
    }
  }
  if (post.video_url) {
    const parsed = extractStoragePathFromUrl(post.video_url);
    if (parsed) admin.storage.from(parsed.bucket).remove([parsed.path]).catch(() => {});
  }
  if (post.audio_url) {
    const parsed = extractStoragePathFromUrl(post.audio_url);
    if (parsed) admin.storage.from(parsed.bucket).remove([parsed.path]).catch(() => {});
  }
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

    // Light / Free: vídeo e áudio desabilitados em posts
    if (hasVideo || hasAudio) {
      return NextResponse.json(
        { error: "Upload de vídeo e áudio está desabilitado nesta versão beta." },
        { status: 403 }
      );
    }

    const hasMedia = hasPhotos;

    // SEC-008: Validar TODAS as URLs de mídia — rejeitar externas
    const IMAGE_BUCKETS = new Set(["post-photos", "post-images"]);

    let validatedImageUrls: string[] | null = null;
    if (hasPhotos) {
      validatedImageUrls = validateMediaUrlArray(imageUrls, {
        allowedBuckets: IMAGE_BUCKETS,
        requireUserId: user.id,
      });
      if (!validatedImageUrls) {
        return NextResponse.json({ error: "URL de imagem inválida" }, { status: 400 });
      }
    }

    const validatedVideoUrl: string | null = null;
    const validatedAudioUrl: string | null = null;

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

    // SEC-009: Use AUTHOR_PROFILE_COLUMNS_FULL for author in new post response
    const authorCols = selectCols(AUTHOR_PROFILE_COLUMNS_FULL);

    const { data: post, error } = await supabase
      .from("posts")
      .insert({
        content: sanitizeRichContent((content || "").trim()),
        neighborhood: sanitizeShortText(neighborhood || "", 100) || null,
        author_id: user.id,
        image_urls: validatedImageUrls || [],
        video_url: validatedVideoUrl,
        audio_url: validatedAudioUrl,
        audio_duration: hasAudio && audioDuration ? audioDuration : null,
        video_duration: hasVideo && videoDuration ? videoDuration : null,
        visibility: validVisibility,
        expires_at: expiresAt,
        shared_post_id: validSharedPostId,
        post_style: validatedStyle,
        post_type: postType === "rich" ? "rich" : "simple",
      })
      .select(`
        ${selectCols(POST_COLUMNS)},
        author:profiles(${authorCols}),
        reactions(user_id, type),
        shared_post:posts!shared_post_id(
          ${selectCols(SHARED_POST_COLUMNS)},
          author:profiles(${authorCols})
        )
      `)
      .single();

    if (error) throw error;

    // Cast to any — Supabase cannot infer types for complex nested joins
    const p = post as any;

    // Self-referencing FK (shared_post_id → posts.id) faz o PostgREST às vezes
    // devolver `shared_post` como array (mesmo vazio) em vez de objeto/null.
    // Um array vazio [] é truthy em JS, então sem essa normalização o front
    // renderiza o box "Compartilhado de" com dados de fallback mesmo quando
    // o post não tem shared_post_id nenhum. (Mesmo tratamento do GET acima
    // e de posts/[id]/route.ts.)
    p.shared_post = Array.isArray(p.shared_post)
      ? (p.shared_post[0] ?? null)
      : (p.shared_post ?? null);

    // SEC-009: Filter neighborhood from the new post's author
    const { hiddenNeighborhoodIds } = await batchFetchPrivacyFlags(
      supabase,
      [p.author_id, p.shared_post?.author_id].filter(Boolean)
    );
    const filteredPost = filterPostsAuthorNeighborhood([p], hiddenNeighborhoodIds)[0];

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
                  actor_id: user.id, post_id: p.id, is_read: false,
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
        ...filteredPost,
        comment_count: 0,
      },
    });
  } catch (error: any) {
    const { message, status } = safeErrorResponse(error, 500, "[posts POST]");
    return NextResponse.json({ error: message }, { status });
  }
}

// ─── DELETE ──────────────────────────────────────────────────────────────────
// REL-006: Soft-delete atômico via rpc_delete_post.
// Marca post como deletado e retorna URLs de mídia para limpeza de storage.
// A operação DB é atômica; storage cleanup é best effort após sucesso.

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const blocked = await rateLimitByRule(req, "posts:delete", user?.id);
    if (blocked) return blocked;

    const postId = new URL(req.url).searchParams.get("id");
    if (!postId) return NextResponse.json({ error: "ID necessário" }, { status: 400 });

    // REL-006: operação atômica no banco
    const { data, error } = await supabase
      .rpc("rpc_delete_post", { p_post_id: postId })
      .maybeSingle();

    if (error) throw error;

    if (!data) throw new Error("RPC retornou vazio");
    const result = data as { ok: boolean; error?: string; media_urls?: string[] };

    if (!result.ok) {
      switch (result.error) {
        case "not_authenticated":
          return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
        case "post_not_found":
          return NextResponse.json({ error: "Post não encontrado" }, { status: 404 });
        default:
          return NextResponse.json({ error: "Não foi possível excluir o post" }, { status: 400 });
      }
    }

    // Limpeza de storage (best effort) — após DB em estado consistente
    if (result.media_urls && result.media_urls.length > 0) {
      const admin = createAdminClient();
      (async () => {
        for (const url of result.media_urls!) {
          const parsed = extractStoragePathFromUrl(url);
          if (parsed) {
            admin.storage.from(parsed.bucket).remove([parsed.path]).catch(() => {});
          }
        }
      })();
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    const { message, status } = safeErrorResponse(error, 500, "[posts DELETE]");
    return NextResponse.json({ error: message }, { status });
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
