// ============================================================
// SEC-004: Shared block-check utility
//
// Centralized functions to check bidirectional blocks between
// two users. All API routes that involve user-to-user interaction
// MUST use these functions before executing any operation.
// ============================================================

import { createClient, createAdminClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Check if two users have ANY block relationship (bidirectional).
 * Returns true if userA blocked userB OR userB blocked userA.
 */
export async function isBlocked(
  supabase: SupabaseClient,
  userA: string,
  userB: string
): Promise<boolean> {
  if (userA === userB) return false;

  const { count } = await supabase
    .from("blocks")
    .select("id", { count: "exact", head: true })
    .or(
      `and(blocker_id.eq.${userA},blocked_id.eq.${userB}),and(blocker_id.eq.${userB},blocked_id.eq.${userA})`
    );

  return (count ?? 0) > 0;
}

/**
 * Get the set of user IDs that are blocked by OR have blocked the given user.
 * Used for batch filtering (e.g., feed, search results, notifications).
 */
export async function getBlockedUserIds(
  supabase: SupabaseClient,
  userId: string
): Promise<Set<string>> {
  const { data: rows } = await supabase
    .from("blocks")
    .select("blocker_id, blocked_id")
    .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);

  const ids = new Set<string>();
  if (!rows) return ids;

  for (const row of rows) {
    // Both the blocker and the blocked should be excluded
    ids.add(row.blocker_id);
    ids.add(row.blocked_id);
  }
  ids.delete(userId); // Never include self
  return ids;
}

/**
 * Enforce block check — returns 403 response if blocked, or null if OK.
 * Convenience wrapper for API routes.
 */
export async function enforceBlockCheck(
  supabase: SupabaseClient,
  currentUser: string,
  targetUser: string
): Promise<Response | null> {
  if (currentUser === targetUser) return null;

  const blocked = await isBlocked(supabase, currentUser, targetUser);
  if (blocked) {
    return new Response(
      JSON.stringify({ error: "Ação não permitida devido a bloqueio" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }
  return null;
}

/**
 * Get the author ID of a post. Returns null if not found.
 * Used before reacting/commenting to check blocks against the author.
 */
export async function getPostAuthorId(
  supabase: SupabaseClient,
  postId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("posts")
    .select("author_id")
    .eq("id", postId)
    .eq("is_deleted", false)
    .maybeSingle();
  return data?.author_id ?? null;
}

/**
 * Get the owner ID of a profile photo. Returns null if not found.
 */
export async function getProfilePhotoOwnerId(
  supabase: SupabaseClient,
  photoId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("profile_photos")
    .select("user_id")
    .eq("id", photoId)
    .maybeSingle();
  return data?.user_id ?? null;
}

/**
 * Get the owner ID of a profile video. Returns null if not found.
 */
export async function getProfileVideoOwnerId(
  supabase: SupabaseClient,
  videoId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("profile_videos")
    .select("user_id")
    .eq("id", videoId)
    .maybeSingle();
  return data?.user_id ?? null;
}

/**
 * Get the author ID of a comment. Returns null if not found.
 */
export async function getCommentAuthorId(
  supabase: SupabaseClient,
  commentId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("comments")
    .select("author_id, post_id")
    .eq("id", commentId)
    .eq("is_deleted", false)
    .maybeSingle();
  return data?.author_id ?? null;
}