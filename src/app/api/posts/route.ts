// ============================================================
// API de Posts — paginação cursor-based (keyset) + filtros
//
// Parâmetros GET:
//   neighborhood  — filtra por bairro ("all" ignora o filtro)
//   limit         — quantos posts retornar (padrão 20, máx 50)
//   cursor        — created_at do último post visto (ISO 8601)
//   authorId      — filtra posts de um usuário específico
//   hashtag       — filtra posts que contêm #hashtag no conteúdo
//   content_flag  — categoria: aviso | achados_e_perdidos |
//                   pedido_de_ajuda | publicidade | outro
//   sort          — recent (padrão) | relevance
//                   relevance = engajamento + frescor + mesmo bairro
//
// Resposta:
//   { posts, nextCursor, hasMore, filters }
//   nextCursor é null quando não há mais posts.
//   Paginação preenche a página após filtros de visibilidade/
//   bloqueio/expiração (até algumas rodadas de over-fetch).
// ============================================================

import { NextRequest, NextResponse, after } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getBlockedUserIds, isBlocked } from "@/lib/block-check";
import { dispatchPushForNotification } from "@/lib/push-dispatch";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { sanitizeRichContent, sanitizeShortText } from "@/lib/sanitize";
import {
  validateMediaUrl,
  validateMediaUrlArray,
  ALLOWED_BUCKETS,
  extractStoragePathFromUrl,
} from "@/lib/storage-security";
import { selectCols, AUTHOR_PROFILE_COLUMNS_FULL, POST_COLUMNS, SHARED_POST_COLUMNS } from "@/lib/safe-columns";
import { redactDeletedSharedPost } from "@/lib/shared-post";
import {
  filterPostsAuthorNeighborhood,
  batchFetchPrivacyFlags,
} from "@/lib/privacy-filter";
import { getViewerFollowingIds, filterByVisibility } from "@/lib/content-visibility";
import { isReadOnlyMode, KILL_SWITCH_MESSAGES } from "@/lib/feature-flags";
import { sanitizePostStyle, isMeaningfulPostStyle } from "@/lib/post-style";
import { checkSpam, spamBlockResponse, isValidContentFlag } from "@/lib/spam-check";
import { autoReportSpam } from "@/lib/auto-report";
import { validateText, TEXT_LIMITS } from "@/lib/text-validation";
import {
  MAX_PHOTOS_PER_POST,
  MAX_ACTIVE_MEDIA_POSTS,
  MEDIA_EXPIRATION_HOURS,
} from "@/lib/upload-limits";
import { safeErrorResponse } from "@/lib/safe-error";

// ── Versão Light / Supabase Free ─────────────────────────────
// Limites agressivos para beta público em plano gratuito
// (1 GB storage / 2 GB egress). Vídeo e áudio desabilitados.
const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 30;

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);

    const neighborhood = searchParams.get("neighborhood");
    const authorId     = searchParams.get("authorId");
    const cursor       = searchParams.get("cursor"); // created_at do último post
    const contentFlag  = searchParams.get("content_flag"); // aviso | achados_e_perdidos | ...
    const sortParam    = (searchParams.get("sort") || "recent").toLowerCase();
    const sortMode: "recent" | "relevance" =
      sortParam === "relevance" || sortParam === "relevante" ? "relevance" : "recent";
    const rawHashtag   = searchParams.get("hashtag") || "";
    const hashtag      = rawHashtag
      .replace(/^#/, "")
      .normalize("NFC")
      .replace(/[^\p{L}\p{N}_]/gu, "")
      .slice(0, 40)
      .toLowerCase();
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

    const validFlags = new Set([
      "aviso",
      "achados_e_perdidos",
      "pedido_de_ajuda",
      "publicidade",
      "outro",
    ]);
    const activeContentFlag =
      contentFlag && validFlags.has(contentFlag) ? contentFlag : null;

    const buildQuery = (cols: string, pageCursor: string | null, pageLimit: number) => {
      let q = supabase
        .from("posts")
        .select(`
          ${cols},
          author:profiles(${authorCols}),
          reactions(user_id, type),
          comments(count),
          shared_post:posts!shared_post_id(
            ${sharedPostCols},
            author:profiles(${authorCols})
          )
        `)
        .eq("is_deleted", false)
        .neq("post_type", "about") // posts "about" só aparecem na aba Sobre
        .order("created_at", { ascending: false })
        .limit(pageLimit + 1); // +1 para detectar se há mais páginas

      // Keyset cursor — retorna posts anteriores ao cursor
      if (pageCursor) q = q.lt("created_at", pageCursor);
      if (authorId) q = q.eq("author_id", authorId);
      if (neighborhood && neighborhood !== "all") {
        q = q.or(`neighborhood.eq.${neighborhood},neighborhood.is.null`);
      }
      if (activeContentFlag) {
        q = q.eq("content_flag", activeContentFlag);
      }
      // Hashtag: busca #tag no conteúdo (case-insensitive). Escapa curingas ILIKE.
      if (hashtag) {
        const escaped = hashtag.replace(/[%_\\]/g, "\\$&");
        q = q.ilike("content", `%#${escaped}%`);
      }
      return q;
    };

    let viewerFollowingIds = new Set<string>();
    let blockedUserIds = new Set<string>();
    if (authUser) {
      const [following, blocked] = await Promise.all([
        getViewerFollowingIds(supabase, authUser.id),
        getBlockedUserIds(supabase, authUser.id),
      ]);
      viewerFollowingIds = following;
      blockedUserIds = blocked;
    }

    const now = new Date().toISOString();
    let useCols = postCols;
    let contentFlagColumnMissing = false;

    const fetchRawPage = async (pageCursor: string | null, pageLimit: number) => {
      let { data, error } = await buildQuery(useCols, pageCursor, pageLimit);

      // Coluna content_flag ausente: sem filtro de categoria, lista normal;
      // com filtro de categoria, não inventa resultados — página vazia.
      if (error && error.code === "42703" && /content_flag/i.test(`${error.message} ${error.details ?? ""}`)) {
        contentFlagColumnMissing = true;
        console.warn(
          "[posts GET] coluna content_flag ausente (rode scripts/20260912_posts_content_flag.sql)"
        );
        if (activeContentFlag) {
          return { raw: [] as any[], error: null as any, hasMoreRaw: false };
        }
        useCols = selectCols(POST_COLUMNS.filter((c) => c !== "content_flag"));
        ({ data, error } = await buildQuery(useCols, pageCursor, pageLimit));
      }
      if (error) throw error;
      const raw = (data ?? []) as any[];
      const hasMoreRaw = raw.length > pageLimit;
      const page = hasMoreRaw ? raw.slice(0, pageLimit) : raw;
      return { raw: page, error: null, hasMoreRaw };
    };

    const applyVisibility = (batch: any[]) =>
      batch
        .map((p: any) => ({
          ...p,
          comment_count: p.comments?.[0]?.count ?? 0,
          comments: undefined,
          shared_post: redactDeletedSharedPost(p.shared_post),
        }))
        .filter((p: any) => {
          if (p.expires_at && p.expires_at < now) return false;
          if (blockedUserIds.size > 0 && blockedUserIds.has(p.author_id)) return false;
          if (
            p.shared_post &&
            blockedUserIds.size > 0 &&
            blockedUserIds.has(p.shared_post.author_id)
          )
            return false;
          return filterByVisibility([p], authUser?.id ?? null, viewerFollowingIds).length === 1;
        });

    // Bairro do viewer (bônus de relevância local)
    let viewerNeighborhood: string | null = null;
    if (authUser && sortMode === "relevance") {
      const { data: me } = await supabase
        .from("profiles")
        .select("neighborhood")
        .eq("id", authUser.id)
        .maybeSingle();
      viewerNeighborhood = (me as { neighborhood?: string | null } | null)?.neighborhood || null;
    }

    // Preenche posts visíveis, mantendo filtros e keyset.
    // Em relevância, busca um pool maior e ordena por score.
    const MAX_FILL_ROUNDS = sortMode === "relevance" ? 6 : 4;
    const poolTarget = sortMode === "relevance" ? Math.min(limit * 3, MAX_PAGE_SIZE) : limit;
    const collected: any[] = [];
    let walkCursor: string | null = cursor;
    let hasMore = false;
    let nextCursor: string | null = null;

    for (let round = 0; round < MAX_FILL_ROUNDS; round++) {
      const { raw, hasMoreRaw } = await fetchRawPage(walkCursor, limit);
      if (raw.length === 0) {
        hasMore = false;
        nextCursor = null;
        break;
      }

      const visible = applyVisibility(raw);
      for (const p of visible) {
        if (collected.length >= poolTarget) break;
        collected.push(p);
      }

      // Cursor avança pelo último item bruto da rodada (keyset estável)
      const lastRaw = raw[raw.length - 1];
      walkCursor = lastRaw?.created_at ?? null;

      if (collected.length >= poolTarget) {
        hasMore = hasMoreRaw;
        nextCursor = hasMoreRaw ? walkCursor : null;
        break;
      }
      if (!hasMoreRaw) {
        hasMore = false;
        nextCursor = null;
        break;
      }
      // Ainda precisamos de mais itens visíveis: continua com o próximo cursor
      hasMore = true;
      nextCursor = walkCursor;
    }

    const scorePost = (p: any): number => {
      const reactions = Array.isArray(p.reactions) ? p.reactions.length : 0;
      const comments = typeof p.comment_count === "number" ? p.comment_count : 0;
      const created = p.created_at ? new Date(p.created_at).getTime() : Date.now();
      const hours = Math.max(0, (Date.now() - created) / 3_600_000);
      // Frescor: ~1.0 nas primeiras horas, cai ao longo de ~3 dias
      const recency = 1 / (1 + hours / 18);
      const engagement = Math.log1p(reactions) * 2.2 + Math.log1p(comments) * 3.4;
      let local = 0;
      if (viewerNeighborhood && p.neighborhood) {
        const a = String(viewerNeighborhood).trim().toLowerCase();
        const b = String(p.neighborhood).trim().toLowerCase();
        if (a && b && a === b) local = 2.5;
      }
      // Leve empurrão se tem mídia (mais útil no Descobrir)
      const media =
        (Array.isArray(p.image_urls) && p.image_urls.length > 0 ? 0.35 : 0) +
        (p.video_url ? 0.25 : 0) +
        (p.audio_url ? 0.15 : 0);
      return engagement * 1.15 + recency * 4 + local + media;
    };

    let ranked = collected;
    if (sortMode === "relevance" && ranked.length > 1) {
      ranked = [...ranked].sort((a, b) => {
        const d = scorePost(b) - scorePost(a);
        if (d !== 0) return d;
        // desempate: mais recente
        return String(b.created_at).localeCompare(String(a.created_at));
      });
    }

    const pagePosts = ranked.slice(0, limit);

    // SEC-009: Batch-fetch privacy flags for all post authors and strip neighborhood
    const allAuthorIds = new Set<string>();
    for (const post of pagePosts) {
      if (post.author?.id) allAuthorIds.add(post.author.id);
      if (post.shared_post?.author?.id) allAuthorIds.add(post.shared_post.author.id);
    }
    const { hiddenNeighborhoodIds } = await batchFetchPrivacyFlags(
      supabase,
      Array.from(allAuthorIds)
    );
    const privacyFilteredPosts = filterPostsAuthorNeighborhood(pagePosts, hiddenNeighborhoodIds);

    // Não rodar cleanup em todo GET do feed (custa query extra).
    if (Math.random() < 0.05) {
      cleanupExpiredPosts().catch(() => {});
    }

    const res = NextResponse.json({
      posts: privacyFilteredPosts,
      nextCursor,
      hasMore: !!nextCursor && hasMore,
      filters: {
        neighborhood: neighborhood || null,
        authorId: authorId || null,
        hashtag: hashtag || null,
        content_flag: activeContentFlag,
        content_flag_unavailable: contentFlagColumnMissing && !!activeContentFlag,
        sort: sortMode,
      },
    });
    res.headers.set("Cache-Control", "private, max-age=8, stale-while-revalidate=30");
    return res;
  } catch (error: any) {
    const { message, status } = safeErrorResponse(error, 500, "[posts GET]");
    return NextResponse.json({ error: message }, { status });
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Junta todas as URLs de mídia de um post (fotos, vídeo, áudio). */
function collectPostMediaUrls(post: {
  image_urls?: string[] | null;
  video_url?: string | null;
  audio_url?: string | null;
}): string[] {
  const urls: string[] = [];
  if (Array.isArray(post.image_urls)) {
    for (const u of post.image_urls) {
      if (typeof u === "string" && u) urls.push(u);
    }
  }
  if (typeof post.video_url === "string" && post.video_url) urls.push(post.video_url);
  if (typeof post.audio_url === "string" && post.audio_url) urls.push(post.audio_url);
  return urls;
}

/**
 * SEC-008: Remove arquivos de mídia do Supabase Storage.
 * - Só age em buckets da whitelist ALLOWED_BUCKETS
 * - Agrupa paths por bucket e remove em lote
 * - Best-effort: erros são logados, não propagados
 */
async function removeMediaUrlsFromStorage(
  admin: ReturnType<typeof createAdminClient>,
  mediaUrls: string[],
  logPrefix = "[posts storage cleanup]"
): Promise<void> {
  if (!mediaUrls || mediaUrls.length === 0) return;

  const pathsByBucket = new Map<string, string[]>();

  for (const url of mediaUrls) {
    const parsed = extractStoragePathFromUrl(url, ALLOWED_BUCKETS);
    if (!parsed) continue;
    if (!ALLOWED_BUCKETS.has(parsed.bucket)) continue;

    const list = pathsByBucket.get(parsed.bucket) ?? [];
    // evita path duplicado no mesmo lote
    if (!list.includes(parsed.path)) list.push(parsed.path);
    pathsByBucket.set(parsed.bucket, list);
  }

  for (const [bucket, paths] of pathsByBucket) {
    // Supabase Storage remove aceita arrays; particiona se muito grande
    const CHUNK = 100;
    for (let i = 0; i < paths.length; i += CHUNK) {
      const chunk = paths.slice(i, i + CHUNK);
      const { error: removeError } = await admin.storage.from(bucket).remove(chunk);
      if (removeError) {
        console.error(logPrefix, "falha ao limpar storage", bucket, chunk, removeError.message);
      }
    }
  }
}

async function cleanupPostMedia(
  admin: ReturnType<typeof createAdminClient>,
  post: { image_urls?: string[] | null; video_url?: string | null; audio_url?: string | null }
): Promise<void> {
  await removeMediaUrlsFromStorage(admin, collectPostMediaUrls(post));
}

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

    // Limpa storage de forma síncrona neste job (await) para não perder
    // arquivos se o runtime encerrar logo após o soft-delete.
    for (const post of expiredPosts) {
      await cleanupPostMedia(admin, post);
    }
  } catch (err) {
    console.error("[posts cleanupExpiredPosts]", err);
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

    // Kill switch: modo somente leitura
    if (isReadOnlyMode()) {
      return NextResponse.json(
        { error: KILL_SWITCH_MESSAGES.readonly },
        { status: 503 }
      );
    }

    const {
      content, neighborhood, imageUrls, videoUrl, audioUrl, audioDuration, postType,
      visibility, sharedPostId, postStyle, contentFlag,
    } = await req.json();

    // MOD-001: contentFlag é autoclassificação opcional do autor
    // ("aviso" | "achados_e_perdidos" | "pedido_de_ajuda" | "publicidade" | "outro").
    // Só usamos se for um valor válido — qualquer outra coisa vira null.
    const validContentFlag = isValidContentFlag(contentFlag) ? contentFlag : null;

    // Light / Free: vídeo continua desabilitado; áudio reativado
    if (videoUrl) {
      return NextResponse.json(
        { error: "Upload de vídeo está desabilitado nesta versão beta." },
        { status: 403 }
      );
    }

    const hasPhotos = Array.isArray(imageUrls) && imageUrls.length > 0;
    const hasAudio = typeof audioUrl === "string" && audioUrl.trim().length > 0;
    const hasMedia = hasPhotos || hasAudio;

    // SEC-008: Validar URLs de imagem — rejeitar externas
    const IMAGE_BUCKETS = new Set(["post-photos", "post-images"]);

    let validatedImageUrls: string[] | null = null;
    if (hasPhotos) {
      if (imageUrls.length > MAX_PHOTOS_PER_POST) {
        return NextResponse.json(
          { error: `Máximo ${MAX_PHOTOS_PER_POST} foto(s) por post` },
          { status: 400 }
        );
      }
      validatedImageUrls = validateMediaUrlArray(imageUrls, {
        allowedBuckets: IMAGE_BUCKETS,
        requireUserId: user.id,
      });
      if (!validatedImageUrls) {
        return NextResponse.json({ error: "URL de imagem inválida" }, { status: 400 });
      }
    }

    let validatedAudioUrl: string | null = null;
    if (hasAudio) {
      const AUDIO_BUCKETS = new Set(["post-audios"]);
      const cleaned = validateMediaUrl(String(audioUrl).trim(), {
        allowedBuckets: AUDIO_BUCKETS,
        requireUserId: user.id,
      });
      if (!cleaned) {
        return NextResponse.json({ error: "URL de áudio inválida" }, { status: 400 });
      }
      validatedAudioUrl = cleaned;
    }

    const textCheck = validateText(content || "", "post", { hasMedia });
    if (!textCheck.ok) {
      return NextResponse.json({ error: textCheck.error }, { status: 400 });
    }

    // Estilos do editor — whitelist em sanitizePostStyle (ALLOWED_POST_FONTS)
    const sanitizedStyle = sanitizePostStyle(postStyle);
    const styleToStore = isMeaningfulPostStyle(sanitizedStyle) ? sanitizedStyle : null;

    const validVisibility = visibility === "followers" ? "followers" : "public";
    // post_type: "simple" (feed) | "about" (só na aba Sobre / blog interno)
    const validPostType = postType === "about" ? "about" : "simple";
    let expiresAt: string | null = null;

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

    const sanitizedContent = sanitizeRichContent((content || "").trim());

    // MOD-001: checagem de spam via Gemini Flash-Lite.
    // Fail-open: se a IA estiver offline/erro (status "unavailable") → libera.
    // Bloqueia só quando a IA confirma spam com clareza (status "spam").
    const spamResult = await checkSpam(sanitizedContent, validContentFlag);
    if (spamResult.status === "spam") {
      return NextResponse.json(spamBlockResponse(spamResult), { status: 422 });
    }
    if (spamResult.status === "unavailable") {
      console.warn("[spam-check] moderação indisponível, publicando mesmo assim (fail-open)");
    }

    // Insert mínimo (só colunas da tabela) — evita 500 quando o select com
    // joins (author/reactions/shared_post) falha por RLS ou shape do PostgREST
    // depois do insert já ter sido aceito.
    const insertPayload = {
      content: sanitizedContent,
      neighborhood: sanitizeShortText(neighborhood || "", 100) || null,
      author_id: user.id,
      image_urls: validatedImageUrls || [],
      video_url: null,
      audio_url: validatedAudioUrl,
      audio_duration: validatedAudioUrl
        ? (typeof audioDuration === "number" && audioDuration > 0 && audioDuration <= 600
            ? Math.round(audioDuration)
            : null)
        : null,
      video_duration: null,
      visibility: validVisibility,
      expires_at: expiresAt,
      shared_post_id: validSharedPostId,
      post_style: styleToStore,
      post_type: validPostType,
      content_flag: validContentFlag,
    };

    let { data: inserted, error: insertError } = await supabase
      .from("posts")
      .insert(insertPayload)
      .select("id")
      .single();

    // Mesmo fallback do GET: se a migration de content_flag não rodou,
    // não bloqueia a publicação — tenta de novo sem essa coluna.
    if (
      insertError &&
      insertError.code === "42703" &&
      /content_flag/i.test(`${insertError.message} ${insertError.details ?? ""}`)
    ) {
      console.warn("[posts POST] coluna content_flag ausente (rode scripts/20260912_posts_content_flag.sql) — publicando sem ela");
      const { content_flag, ...payloadWithoutFlag } = insertPayload;
      ({ data: inserted, error: insertError } = await supabase
        .from("posts")
        .insert(payloadWithoutFlag)
        .select("id")
        .single());
    }

    if (insertError) {
      console.error("[posts POST] insert failed:", {
        code: insertError.code,
        message: insertError.message,
        details: insertError.details,
        hint: insertError.hint,
      });
      // Mensagens úteis sem vazar schema interno
      const msg = (insertError.message || "").toLowerCase();
      if (msg.includes("row-level security") || insertError.code === "42501") {
        return NextResponse.json(
          { error: "Sem permissão para publicar. Tente sair e entrar de novo." },
          { status: 403 }
        );
      }
      if (insertError.code === "23503") {
        return NextResponse.json(
          { error: "Referência inválida ao publicar. Atualize a página e tente de novo." },
          { status: 400 }
        );
      }
      if (insertError.code === "23514") {
        // CHECK constraint — costuma ser visibility ou post_type
        const detail = `${insertError.message || ""} ${insertError.details || ""} ${insertError.hint || ""}`.toLowerCase();
        if (detail.includes("post_type") || validPostType === "about") {
          return NextResponse.json(
            {
              error:
                "O banco ainda não aceita notas em Sobre (post_type=about). Rode a migration scripts/20260911_posts_post_type_about.sql no Supabase.",
            },
            { status: 400 }
          );
        }
        if (detail.includes("visibility")) {
          return NextResponse.json(
            { error: "Visibilidade inválida. Use Público ou Seguidores." },
            { status: 400 }
          );
        }
        if (detail.includes("content_flag")) {
          return NextResponse.json(
            {
              error:
                "O banco ainda não tem a coluna content_flag. Rode a migration scripts/20260912_posts_content_flag.sql no Supabase.",
            },
            { status: 400 }
          );
        }
        return NextResponse.json(
          { error: "Dados do post inválidos. Revise o texto e a mídia." },
          { status: 400 }
        );
      }
      if (insertError.code === "42703" || msg.includes("column")) {
        return NextResponse.json(
          { error: "Configuração do banco desatualizada. Contate o suporte." },
          { status: 500 }
        );
      }
      throw insertError;
    }

    if (!inserted) {
      return NextResponse.json(
        { error: "Não foi possível confirmar a publicação. Tente de novo." },
        { status: 500 }
      );
    }

    // Busca o post completo (com joins) em request separada
    let { data: post, error: selectError } = await supabase
      .from("posts")
      .select(`
        ${selectCols(POST_COLUMNS)},
        author:profiles(${authorCols}),
        reactions(user_id, type),
        shared_post:posts!shared_post_id(
          ${selectCols(SHARED_POST_COLUMNS)},
          author:profiles(${authorCols})
        )
      `)
      .eq("id", inserted.id)
      .single();

    if (selectError && selectError.code === "42703" && /content_flag/i.test(`${selectError.message} ${selectError.details ?? ""}`)) {
      ({ data: post, error: selectError } = await supabase
        .from("posts")
        .select(`
          ${selectCols(POST_COLUMNS.filter((c) => c !== "content_flag"))},
          author:profiles(${authorCols}),
          reactions(user_id, type),
          shared_post:posts!shared_post_id(
            ${selectCols(SHARED_POST_COLUMNS)},
            author:profiles(${authorCols})
          )
        `)
        .eq("id", inserted.id)
        .single());
    }

    if (selectError || !post) {
      console.error("[posts POST] select after insert failed:", selectError?.message || "no row");
      // Post já foi criado — devolve payload mínimo para o cliente não falhar
      const minimal = {
        id: inserted.id,
        ...insertPayload,
        created_at: new Date().toISOString(),
        author: null,
        reactions: [],
        shared_post: null,
      };
      return NextResponse.json({
        post: { ...minimal, comment_count: 0 },
      });
    }

    // Cast to any — Supabase cannot infer types for complex nested joins
    const p = post as any;

    // Self-referencing FK (shared_post_id → posts.id) faz o PostgREST às vezes
    // devolver `shared_post` como array (mesmo vazio) em vez de objeto/null.
    // Um array vazio [] é truthy em JS, então sem essa normalização o front
    // renderiza o box "Compartilhado de" com dados de fallback mesmo quando
    // o post não tem shared_post_id nenhum. (Mesmo tratamento do GET acima
    // e de posts/[id]/route.ts.)
    p.shared_post = redactDeletedSharedPost(p.shared_post);

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

    // Limpeza de storage — best effort via after().
    // Sem after(), o runtime serverless pode reciclar a função assim que
    // a resposta é enviada e o cleanup nunca roda (arquivos ficam
    // acessíveis por URL direta com o post já soft-deleted).
    // after() garante execução até o fim sem atrasar a resposta ao cliente.
    const mediaUrls = Array.isArray(result.media_urls) ? result.media_urls : [];
    if (mediaUrls.length > 0) {
      after(async () => {
        try {
          const admin = createAdminClient();
          await removeMediaUrlsFromStorage(admin, mediaUrls, "[posts DELETE]");
        } catch (err) {
          console.error("[posts DELETE] erro inesperado na limpeza de storage", err);
        }
      });
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
