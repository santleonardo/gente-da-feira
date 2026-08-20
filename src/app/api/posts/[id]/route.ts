import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { sanitizeRichContent } from "@/lib/sanitize";
import { selectCols, AUTHOR_PROFILE_COLUMNS_FULL, POST_COLUMNS, SHARED_POST_COLUMNS } from "@/lib/safe-columns";
import { safeErrorResponse } from "@/lib/safe-error";
import { filterPostsAuthorNeighborhood, batchFetchPrivacyFlags } from "@/lib/privacy-filter";
import { checkPostVisibility } from "@/lib/content-visibility";

// SEC-009: Author profile columns with neighborhood (filtered post-query)
const AUTHOR_COLS = selectCols(AUTHOR_PROFILE_COLUMNS_FULL);

// SEC-009: Explicit post columns — no SELECT *
const POST_COLS = selectCols(POST_COLUMNS);
const SHARED_POST_COLS = selectCols(SHARED_POST_COLUMNS);

// GET /api/posts/[id] — Fetch a single post by ID
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: postId } = await params;
    const blocked = await rateLimitByRule(req, "post:detail", null);
    if (blocked) return blocked;

    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();

    // SEC-010: Enforce visibility BEFORE returning post data.
    // Prevents direct ID access to followers-only / private posts.
    const visibility = await checkPostVisibility(supabase, postId, authUser?.id ?? null);
    if (!visibility.allowed) {
      return NextResponse.json({ error: "Post não encontrado" }, { status: 404 });
    }

    const { data: post, error } = await supabase
      .from("posts")
      .select(
        `
        ${POST_COLS},
        author:profiles(${AUTHOR_COLS}),
        reactions(user_id, type),
        comments(count),
        shared_post:posts!shared_post_id(${SHARED_POST_COLS}, author:profiles(${AUTHOR_COLS}))
      `
      )
      .eq("id", postId)
      .eq("is_deleted", false)
      .single();

    if (error) throw error;
    if (!post) {
      return NextResponse.json({ error: "Post não encontrado" }, { status: 404 });
    }

    // Cast to any — Supabase cannot infer types for complex nested joins
    const p = post as any;

    const result = {
      ...p,
      comment_count: p.comments?.[0]?.count || 0,
      comments: undefined,
      shared_post:
        p.shared_post && !Array.isArray(p.shared_post)
          ? p.shared_post
          : Array.isArray(p.shared_post)
          ? p.shared_post[0]
          : null,
      postStyle: p.post_style || null,
    };

    // SEC-009: Filter neighborhood from author profiles
    const authorIds = [p.author_id, result.shared_post?.author_id].filter(Boolean);
    const { hiddenNeighborhoodIds } = await batchFetchPrivacyFlags(supabase, authorIds);
    const filtered = filterPostsAuthorNeighborhood([result], hiddenNeighborhoodIds);

    return NextResponse.json({ post: filtered[0] });
  } catch (error: any) {
    const { message, status } = safeErrorResponse(error, 500, "[posts/id GET]");
    return NextResponse.json({ error: message }, { status });
  }
}

// PATCH /api/posts/[id] — Edit a post (content and optionally postStyle)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: postId } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const blocked = await rateLimitByRule(req, "post:edit", user?.id);
    if (blocked) return blocked;

    // Fetch the existing post to verify ownership and check for media
    const { data: existingPost, error: fetchError } = await supabase
      .from("posts")
      .select("id, author_id, image_urls, video_url, audio_url")
      .eq("id", postId)
      .eq("is_deleted", false)
      .single();

    if (fetchError || !existingPost) {
      return NextResponse.json(
        { error: "Post não encontrado" },
        { status: 404 }
      );
    }

    if (existingPost.author_id !== user.id) {
      return NextResponse.json(
        { error: "Você não tem permissão para editar este post" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { content, postStyle } = body;

    // Validate content — obrigatório APENAS se não houver mídia
    if (content !== undefined) {
      const existingHasMedia =
        (existingPost?.image_urls && existingPost.image_urls.length > 0) ||
        !!existingPost?.video_url ||
        !!existingPost?.audio_url;
      if (!existingHasMedia && (!content || !content.trim())) {
        return NextResponse.json(
          { error: "Conteúdo é obrigatório" },
          { status: 400 }
        );
      }
      if (content && content.trim().length > 1000) {
        return NextResponse.json(
          { error: "Post muito longo (máx 1000 chars)" },
          { status: 400 }
        );
      }
    }

    // Light: estilos / post-it / rich desabilitados — ignora postStyle do client
    const updateData: Record<string, any> = {};
    if (content !== undefined) {
      updateData.content = sanitizeRichContent(content?.trim() || "");
    }
    // Se o client mandar postStyle, força null (não aceita estilos novos)
    if (postStyle !== undefined) {
      updateData.post_style = null;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "Nenhum campo para atualizar" },
        { status: 400 }
      );
    }

    const { data: post, error } = await supabase
      .from("posts")
      .update(updateData)
      .eq("id", postId)
      .select(
        `
        ${POST_COLS},
        author:profiles(${AUTHOR_COLS}),
        reactions(user_id, type),
        comments(count),
        shared_post:posts!shared_post_id(${SHARED_POST_COLS}, author:profiles(${AUTHOR_COLS}))
      `
      )
      .single();

    if (error) throw error;

    // Cast to any — Supabase cannot infer types for complex nested joins
    const p = post as any;

    const result = {
      ...p,
      comment_count: p.comments?.[0]?.count || 0,
      comments: undefined,
      shared_post:
        p.shared_post && !Array.isArray(p.shared_post)
          ? p.shared_post
          : Array.isArray(p.shared_post)
          ? p.shared_post[0]
          : null,
      postStyle: p.post_style || null,
    };

    // SEC-009: Filter neighborhood from author profiles
    const authorIds = [p.author_id, result.shared_post?.author_id].filter(Boolean);
    const { hiddenNeighborhoodIds } = await batchFetchPrivacyFlags(supabase, authorIds);
    const filtered = filterPostsAuthorNeighborhood([result], hiddenNeighborhoodIds);

    return NextResponse.json({ post: filtered[0] });
  } catch (error: any) {
    const { message, status } = safeErrorResponse(error, 500, "[posts detail]");
    return NextResponse.json({ error: message }, { status });
  }
}
