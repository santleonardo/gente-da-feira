import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isBlocked } from "@/lib/block-check";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { selectCols, AUTHOR_PROFILE_COLUMNS_FULL } from "@/lib/safe-columns";
import { filterPostsAuthorNeighborhood, batchFetchPrivacyFlags } from "@/lib/privacy-filter";
import { getViewerFollowingIds, filterByVisibility } from "@/lib/content-visibility";
import { safeErrorResponse } from "@/lib/safe-error";

// SEC-009: Author columns for shared posts
const AUTHOR_COLS = selectCols(AUTHOR_PROFILE_COLUMNS_FULL);

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const blocked = await rateLimitByRule(req, "users:posts", undefined);
    if (blocked) return blocked;
    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const isOwnProfile = authUser?.id === id;
    const postTypeParam = new URL(req.url).searchParams.get("postType"); // "about" | null

    // SEC-004: Check bidirectional block
    if (authUser && !isOwnProfile) {
      const blocked = await isBlocked(supabase, authUser.id, id);
      if (blocked) {
        return NextResponse.json({ posts: [], _privacy: { isRestricted: true, isBlocked: true } });
      }
    }

    const { data: targetProfile } = await supabase
      .from("profiles")
      .select("is_private")
      .eq("id", id)
      .single();

    const isPrivate = targetProfile?.is_private || false;

    if (isPrivate) {
      if (!isOwnProfile && authUser) {
        const { data: followRow } = await supabase
          .from("follows")
          .select("id, status")
          .eq("follower_id", authUser.id)
          .eq("following_id", id)
          .maybeSingle();

        if (!followRow || followRow.status !== "accepted") {
          return NextResponse.json({ posts: [], _privacy: { isRestricted: true } });
        }
      } else if (!authUser) {
        return NextResponse.json({ posts: [], _privacy: { isRestricted: true } });
      }
    }

    const url = new URL(req.url);
    const cursor = url.searchParams.get("cursor"); // created_at ISO do último item
    const rawLimit = parseInt(url.searchParams.get("limit") || (postTypeParam === "about" ? "8" : "20"), 10);
    const limit = Math.min(Math.max(1, isNaN(rawLimit) ? 20 : rawLimit), 30);

    let postsQuery = supabase
      .from("posts")
      .select(`
        id,
        content,
        image_url,
        image_urls,
        video_url,
        audio_url,
        neighborhood,
        created_at,
        author_id,
        visibility,
        expires_at,
        shared_post_id,
        post_type,
        post_style,
        reactions(user_id, type),
        shared_post:posts!shared_post_id(id, content, image_urls, created_at, author:profiles(${AUTHOR_COLS}))
      `)
      .eq("author_id", id)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .limit(limit + 1); // +1 para detectar hasMore

    // "about" = blog interno (só aba Sobre); default = entradas do perfil/feed
    if (postTypeParam === "about") {
      postsQuery = postsQuery.eq("post_type", "about");
    } else {
      postsQuery = postsQuery.neq("post_type", "about");
    }

    if (cursor) {
      postsQuery = postsQuery.lt("created_at", cursor);
    }

    const { data: posts, error } = await postsQuery;

    if (error) throw error;

    const rawList = posts || [];
    const hasMore = rawList.length > limit;
    const page = hasMore ? rawList.slice(0, limit) : rawList;

    const mappedPosts = page.map((p: any) => ({
      ...p,
      shared_post: p.shared_post && !Array.isArray(p.shared_post) ? p.shared_post : (Array.isArray(p.shared_post) ? p.shared_post[0] : null),
    }));

    // SEC-010: Filter posts by visibility (followers-only, private)
    // Even on a public profile, followers-only posts must be hidden from
    // non-followers. Private posts are hidden from everyone except the author.
    const viewerFollowingIds = await getViewerFollowingIds(supabase, authUser?.id ?? null);
    const visibilityFiltered = filterByVisibility(mappedPosts, authUser?.id ?? null, viewerFollowingIds);

    // SEC-009: Filter neighborhood from shared post authors
    const authorIds = new Set<string>();
    for (const p of visibilityFiltered) {
      if (p.shared_post?.author?.id) authorIds.add(p.shared_post.author.id);
    }
    const { hiddenNeighborhoodIds } = await batchFetchPrivacyFlags(
      supabase,
      Array.from(authorIds)
    );
    const filtered = filterPostsAuthorNeighborhood(visibilityFiltered, hiddenNeighborhoodIds);

    const nextCursor =
      hasMore && page.length > 0
        ? page[page.length - 1].created_at
        : null;

    return NextResponse.json({
      posts: filtered,
      nextCursor,
      hasMore: !!nextCursor,
    });
  } catch (error: any) {
    const { message, status } = safeErrorResponse(error, 500, "[users/posts GET]");
    return NextResponse.json({ error: message }, { status });
  }
}