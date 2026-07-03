/**
 * SEC-009: Centralized Privacy Filtering Layer
 *
 * Single source of truth for all privacy rules.
 * Every API that returns profile/user data MUST use these functions.
 * Privacy rules are enforced at the DATA LAYER before the response
 * reaches the client. The frontend never receives private fields
 * when the target user's privacy settings require them to be hidden.
 *
 * Privacy rules:
 *   - hide_neighborhood: strips `neighborhood` from profile data
 *   - hide_following:   hides following list + count from non-owners
 *   - hide_followers:   hides followers list + count from non-owners
 *   - is_private:       restricts profile content (posts, photos, videos, bio)
 *                       to owner and accepted followers only
 *   - approve_followers: new follows require manual approval
 */

// ─── Types ────────────────────────────────────────────────────────────────

export interface PrivacyFlags {
  is_private: boolean;
  hide_following: boolean;
  hide_followers: boolean;
  hide_neighborhood: boolean;
  approve_followers: boolean;
}

export interface PrivacyContext {
  viewerId: string | null;
  targetId: string;
  isOwnProfile: boolean;
  isFollowing: boolean; // accepted follow only
  isPending: boolean;   // pending follow request
  privacy: PrivacyFlags;
  isBlockedByViewer: boolean;
  isBlockedByTarget: boolean;
}

// ─── Core filtering functions ─────────────────────────────────────────────

/**
 * Filter a full profile response for the profile view endpoint.
 * Strips private fields based on viewer→target relationship.
 * Returns the filtered profile and a _privacy metadata object.
 */
export function filterProfileView(
  profile: Record<string, any>,
  ctx: PrivacyContext
): { user: Record<string, any>; _privacy: Record<string, any> } {
  const isRestricted = ctx.privacy.is_private && !ctx.isOwnProfile && !ctx.isFollowing;

  // If blocked by target, return minimal stub
  if (ctx.isBlockedByTarget && !ctx.isOwnProfile) {
    return {
      user: {
        id: profile.id,
        display_name: profile.display_name,
        username: profile.username,
        avatar_url: profile.avatar_url,
        bio: null,
        neighborhood: null,
      },
      _privacy: {
        is_private: ctx.privacy.is_private,
        hide_following: ctx.privacy.hide_following,
        hide_followers: ctx.privacy.hide_followers,
        hide_neighborhood: true,
        approve_followers: ctx.privacy.approve_followers,
        isRestricted: true,
        isPending: false,
        isBlockedByViewer: ctx.isBlockedByViewer,
        isBlockedByTarget: true,
        isBlocked: true,
      },
    };
  }

  // Build filtered profile
  let filteredProfile: Record<string, any> = {
    id: profile.id,
    username: profile.username,
    display_name: profile.display_name,
    avatar_url: profile.avatar_url,
    created_at: profile.created_at,
    updated_at: profile.updated_at,
    theme: profile.theme,
  };

  // Bio: visible to owner and followers (even if private profile)
  if (ctx.isOwnProfile || !isRestricted) {
    filteredProfile.bio = profile.bio || null;
  } else {
    filteredProfile.bio = null;
  }

  // Neighborhood: controlled by hide_neighborhood flag
  if (ctx.isOwnProfile || !ctx.privacy.hide_neighborhood) {
    filteredProfile.neighborhood = profile.neighborhood || null;
  } else {
    filteredProfile.neighborhood = null;
  }

  // Privacy flags are always needed by frontend for UI decisions
  filteredProfile.is_private = ctx.privacy.is_private;
  filteredProfile.hide_following = ctx.privacy.hide_following;
  filteredProfile.hide_followers = ctx.privacy.hide_followers;
  filteredProfile.hide_neighborhood = ctx.privacy.hide_neighborhood;
  filteredProfile.approve_followers = ctx.privacy.approve_followers;

  filteredProfile.name = profile.display_name;
  filteredProfile._count = { posts: profile._count?.posts ?? profile.posts?.[0]?.count ?? 0 };

  return {
    user: filteredProfile,
    _privacy: {
      is_private: ctx.privacy.is_private,
      hide_following: ctx.privacy.hide_following,
      hide_followers: ctx.privacy.hide_followers,
      hide_neighborhood: ctx.privacy.hide_neighborhood,
      approve_followers: ctx.privacy.approve_followers,
      isRestricted,
      isPending: ctx.isPending,
      isBlockedByViewer: ctx.isBlockedByViewer,
      isBlockedByTarget: ctx.isBlockedByTarget,
    },
  };
}

/**
 * Filter search results: strip neighborhood from profiles that have it hidden.
 * This avoids having to fetch privacy flags per-user in bulk search.
 * Accepts an optional Set of user IDs whose neighborhood should be hidden.
 */
export function filterSearchResults(
  users: Record<string, any>[],
  hiddenNeighborhoodIds: Set<string>
): Record<string, any>[] {
  if (hiddenNeighborhoodIds.size === 0) return users;
  return users.map((u) => {
    if (hiddenNeighborhoodIds.has(u.id)) {
      return { ...u, neighborhood: null };
    }
    return u;
  });
}

/**
 * Filter follower/following list items: strip neighborhood and bio
 * from users who have those hidden.
 */
export function filterFollowListItems(
  items: Record<string, any>[],
  hiddenNeighborhoodIds: Set<string>
): Record<string, any>[] {
  if (hiddenNeighborhoodIds.size === 0) return items;
  return items.map((item) => {
    const profileKey = item.follower ? "follower" : item.following;
    const profile = item[profileKey];
    if (!profile || !hiddenNeighborhoodIds.has(profile.id)) return item;
    return {
      ...item,
      [profileKey]: {
        ...profile,
        neighborhood: null,
      },
    };
  });
}

/**
 * Get safe follow counts based on privacy settings.
 * When lists are hidden, return null counts instead of real numbers.
 */
export function getSafeFollowCounts(
  actualFollowingCount: number,
  actualFollowersCount: number,
  ctx: PrivacyContext
): { followingCount: number | null; followersCount: number | null } {
  if (ctx.isOwnProfile) {
    return { followingCount: actualFollowingCount, followersCount: actualFollowersCount };
  }
  return {
    followingCount: ctx.privacy.hide_following ? null : actualFollowingCount,
    followersCount: ctx.privacy.hide_followers ? null : actualFollowersCount,
  };
}

/**
 * Build a PrivacyContext from raw data.
 * Centralizes the construction of privacy context to avoid duplication.
 */
export function buildPrivacyContext(
  viewerId: string | null,
  targetId: string,
  targetProfile: Record<string, any>,
  followRow?: { status: string } | null,
  isBlockedByViewer: boolean = false,
  isBlockedByTarget: boolean = false
): PrivacyContext {
  const isOwnProfile = viewerId === targetId;
  const isFollowing = followRow?.status === "accepted" && !isOwnProfile;
  const isPending = followRow?.status === "pending" && !isOwnProfile;

  return {
    viewerId,
    targetId,
    isOwnProfile,
    isFollowing,
    isPending,
    privacy: {
      is_private: targetProfile.is_private === true,
      hide_following: targetProfile.hide_following === true,
      hide_followers: targetProfile.hide_followers === true,
      hide_neighborhood: targetProfile.hide_neighborhood === true,
      approve_followers: targetProfile.approve_followers === true,
    },
    isBlockedByViewer,
    isBlockedByTarget,
  };
}

/**
 * Apply neighborhood filtering to post author profiles in bulk.
 * Used by feed and post detail endpoints where multiple author profiles
 * are returned alongside posts.
 *
 * @param posts - Array of post objects with an `author` nested object
 * @param hiddenNeighborhoodIds - Set of user IDs that have hide_neighborhood
 */
export function filterPostsAuthorNeighborhood(
  posts: Record<string, any>[],
  hiddenNeighborhoodIds: Set<string>
): Record<string, any>[] {
  if (hiddenNeighborhoodIds.size === 0) return posts;
  return posts.map((post) => {
    if (post.author && hiddenNeighborhoodIds.has(post.author.id)) {
      return {
        ...post,
        author: { ...post.author, neighborhood: null },
      };
    }
    // Also filter shared_post author
    if (post.shared_post?.author && hiddenNeighborhoodIds.has(post.shared_post.author.id)) {
      return {
        ...post,
        shared_post: {
          ...post.shared_post,
          author: { ...post.shared_post.author, neighborhood: null },
        },
      };
    }
    return post;
  });
}

/**
 * Apply neighborhood filtering to comment author profiles.
 */
export function filterCommentAuthorsNeighborhood(
  comments: Record<string, any>[],
  hiddenNeighborhoodIds: Set<string>
): Record<string, any>[] {
  if (hiddenNeighborhoodIds.size === 0) return comments;
  return comments.map((comment) => {
    if (comment.author && hiddenNeighborhoodIds.has(comment.author.id)) {
      return {
        ...comment,
        author: { ...comment.author, neighborhood: null },
      };
    }
    return comment;
  });
}

/**
 * Batch-fetch privacy flags for a set of user IDs.
 * Returns a Map<userId, PrivacyFlags> for efficient lookup.
 * Also returns a Set of user IDs with hide_neighborhood for quick filtering.
 */
export async function batchFetchPrivacyFlags(
  supabase: any,
  userIds: string[]
): Promise<{
  flagsMap: Map<string, PrivacyFlags>;
  hiddenNeighborhoodIds: Set<string>;
}> {
  if (userIds.length === 0) {
    return { flagsMap: new Map(), hiddenNeighborhoodIds: new Set() };
  }

  const { data } = await supabase
    .from("profiles")
    .select("id, is_private, hide_following, hide_followers, hide_neighborhood, approve_followers")
    .in("id", userIds);

  const flagsMap = new Map<string, PrivacyFlags>();
  const hiddenNeighborhoodIds = new Set<string>();

  for (const row of data || []) {
    const flags: PrivacyFlags = {
      is_private: row.is_private === true,
      hide_following: row.hide_following === true,
      hide_followers: row.hide_followers === true,
      hide_neighborhood: row.hide_neighborhood === true,
      approve_followers: row.approve_followers === true,
    };
    flagsMap.set(row.id, flags);
    if (flags.hide_neighborhood) {
      hiddenNeighborhoodIds.add(row.id);
    }
  }

  return { flagsMap, hiddenNeighborhoodIds };
}

/**
 * Strip storage_path from profile photo/video responses.
 * storage_path is an internal field that should never reach the client.
 */
export function stripStoragePaths<T extends Record<string, any>>(items: T[]): T[] {
  return items.map((item) => {
    const { storage_path, ...rest } = item;
    return rest as T;
  });
}
