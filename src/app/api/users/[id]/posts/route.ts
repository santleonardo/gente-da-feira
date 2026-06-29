import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isBlocked } from "@/lib/block-check";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { selectCols, AUTHOR_PROFILE_COLUMNS_FULL } from "@/lib/safe-columns";
import { filterPostsAuthorNeighborhood, batchFetchPrivacyFlags } from "@/lib/privacy-filter";

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

    const { data: posts, error } = await supabase
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
      .limit(20);

    if (error) throw error;

    const mappedPosts = (posts || []).map((p: any) => ({
      ...p,
      shared_post: p.shared_post && !Array.isArray(p.shared_post) ? p.shared_post : (Array.isArray(p.shared_post) ? p.shared_post[0] : null),
    }));

    // SEC-009: Filter neighborhood from shared post authors
    const authorIds = new Set<string>();
    for (const p of mappedPosts) {
      if (p.shared_post?.author?.id) authorIds.add(p.shared_post.author.id);
    }
    const { hiddenNeighborhoodIds } = await batchFetchPrivacyFlags(
      supabase,
      Array.from(authorIds)
    );
    const filtered = filterPostsAuthorNeighborhood(mappedPosts, hiddenNeighborhoodIds);

    return NextResponse.json({ posts: filtered });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}