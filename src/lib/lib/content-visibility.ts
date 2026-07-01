// ============================================================
// SEC-010: Centralized content-visibility authorization
//
// Single source of truth for checking whether a viewer can
// access content based on its visibility setting.
//
// Rules:
//   "public"    → anyone can view
//   "followers" → only the author OR an accepted follower can view
//   "private"   → only the author can view
//
// All APIs that return user-generated content (posts, comments,
// profile media) MUST use these functions BEFORE returning data.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";

export type VisibilityLevel = "public" | "followers" | "private";

/**
 * Result of a visibility check.
 */
export interface VisibilityCheckResult {
  allowed: boolean;
  reason?: "not_authenticated" | "not_following" | "not_author";
}

/**
 * Fetch the set of author IDs that the viewer follows (status=accepted).
 * Returns an empty set if viewer is null.
 */
export async function getViewerFollowingIds(
  supabase: SupabaseClient,
  viewerId: string | null
): Promise<Set<string>> {
  if (!viewerId) return new Set();

  const { data } = await supabase
    .from("follows")
    .select("following_id")
    .eq("follower_id", viewerId)
    .eq("status", "accepted");

  if (!data) return new Set();
  return new Set(data.map((f: any) => f.following_id));
}

/**
 * Check if a specific viewer can view content with the given visibility.
 *
 * @param viewerId  — ID of the authenticated user (null if unauthenticated)
 * @param authorId  — ID of the content author
 * @param visibility — "public" | "followers" | "private"
 * @param viewerFollowingIds — Pre-fetched set of IDs the viewer follows (accepted)
 */
export function canViewContent(
  viewerId: string | null,
  authorId: string,
  visibility: VisibilityLevel | null | undefined,
  viewerFollowingIds: Set<string>
): VisibilityCheckResult {
  // No visibility restriction set → allow
  if (!visibility || visibility === "public") {
    return { allowed: true };
  }

  // Author always sees their own content
  if (viewerId && viewerId === authorId) {
    return { allowed: true };
  }

  // "private" → only author (already checked above)
  if (visibility === "private") {
    return { allowed: false, reason: "not_author" };
  }

  // "followers" → must be authenticated + accepted follower
  if (visibility === "followers") {
    if (!viewerId) {
      return { allowed: false, reason: "not_authenticated" };
    }
    if (viewerFollowingIds.has(authorId)) {
      return { allowed: true };
    }
    return { allowed: false, reason: "not_following" };
  }

  // Fallback: deny unknown visibility levels
  return { allowed: false, reason: "not_author" };
}

/**
 * Filter an array of posts (or any object with author_id + visibility),
 * removing items the viewer cannot access.
 *
 * @param items  — Array of objects with { author_id: string, visibility: string }
 * @param viewerId — Authenticated user ID (null if unauthenticated)
 * @param viewerFollowingIds — Pre-fetched set of IDs the viewer follows
 */
export function filterByVisibility<T extends { author_id: string; visibility?: string | null }>(
  items: T[],
  viewerId: string | null,
  viewerFollowingIds: Set<string>
): T[] {
  return items.filter((item) =>
    canViewContent(viewerId, item.author_id, item.visibility as VisibilityLevel | null, viewerFollowingIds).allowed
  );
}

/**
 * Check if a single post is accessible to the viewer.
 * Fetches follow data on-the-fly. Use for single-post endpoints.
 */
export async function checkPostVisibility(
  supabase: SupabaseClient,
  postId: string,
  viewerId: string | null
): Promise<VisibilityCheckResult> {
  const { data: post, error } = await supabase
    .from("posts")
    .select("author_id, visibility, is_deleted")
    .eq("id", postId)
    .maybeSingle();

  if (error || !post || post.is_deleted) {
    return { allowed: false, reason: "not_author" };
  }

  const followingIds = await getViewerFollowingIds(supabase, viewerId);
  return canViewContent(viewerId, post.author_id, post.visibility as VisibilityLevel, followingIds);
}

// ============================================================
// Profile-level visibility (for profile_photos, profile_videos)
//
// Photos and videos don't have a per-item visibility column.
// They inherit visibility from the profile's `is_private` flag:
//   - is_private=false → anyone can view (unless blocked)
//   - is_private=true  → only the owner or an accepted follower
// ============================================================

/**
 * Check if a viewer can access a profile's media (photos, videos, albums).
 * Combines block check + private profile check.
 *
 * @returns true if access is allowed, false if denied.
 */
export async function canViewProfileMedia(
  supabase: SupabaseClient,
  ownerId: string,
  viewerId: string | null
): Promise<boolean> {
  // Owner always sees their own media
  if (viewerId && viewerId === ownerId) return true;

  // Fetch profile privacy
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_private")
    .eq("id", ownerId)
    .maybeSingle();

  // If profile doesn't exist, deny
  if (!profile) return false;

  // Public profile → allow (block check should be done separately if needed)
  if (!profile.is_private) return true;

  // Private profile → must be authenticated + accepted follower
  if (!viewerId) return false;

  const { data: followRow } = await supabase
    .from("follows")
    .select("status")
    .eq("follower_id", viewerId)
    .eq("following_id", ownerId)
    .maybeSingle();

  return followRow?.status === "accepted";
}