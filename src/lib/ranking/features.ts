/**
 * Features de ranking para posts (Gente da Feira).
 * Vetor numérico estável — treino offline pode recalibrar pesos em weights.ts.
 */

export type RankingPostInput = {
  id: string;
  created_at?: string | null;
  neighborhood?: string | null;
  content?: string | null;
  content_flag?: string | null;
  image_urls?: string[] | null;
  video_url?: string | null;
  audio_url?: string | null;
  reactions?: unknown[] | null;
  comment_count?: number | null;
  author_id?: string | null;
};

export type RankingContext = {
  viewerId?: string | null;
  viewerNeighborhood?: string | null;
  /** IDs que o viewer segue (aceitos) */
  followingIds?: Set<string> | string[] | null;
  /** Categoria ativa no Descobrir (se houver filtro) */
  activeContentFlag?: string | null;
  nowMs?: number;
};

/** Nomes das features — ordem fixa do modelo linear */
export const FEATURE_NAMES = [
  "bias",
  "log_reactions",
  "log_comments",
  "recency_18h",
  "recency_72h",
  "same_neighborhood",
  "from_following",
  "has_image",
  "has_video",
  "has_audio",
  "content_len_norm",
  "flag_match",
  "flag_help_or_lost", // utilidade local (ajuda / achados)
] as const;

export type FeatureName = (typeof FEATURE_NAMES)[number];

export type FeatureVector = Record<FeatureName, number>;

function asSet(ids?: Set<string> | string[] | null): Set<string> {
  if (!ids) return new Set();
  return ids instanceof Set ? ids : new Set(ids);
}

export function extractFeatures(
  post: RankingPostInput,
  ctx: RankingContext = {}
): FeatureVector {
  const now = ctx.nowMs ?? Date.now();
  const reactions = Array.isArray(post.reactions) ? post.reactions.length : 0;
  const comments = typeof post.comment_count === "number" ? post.comment_count : 0;
  const created = post.created_at ? new Date(post.created_at).getTime() : now;
  const hours = Math.max(0, (now - created) / 3_600_000);

  const recency18 = 1 / (1 + hours / 18);
  const recency72 = 1 / (1 + hours / 72);

  const vn = (ctx.viewerNeighborhood || "").trim().toLowerCase();
  const pn = (post.neighborhood || "").trim().toLowerCase();
  const sameNeighborhood = vn && pn && vn === pn ? 1 : 0;

  const following = asSet(ctx.followingIds);
  const fromFollowing =
    post.author_id && following.has(post.author_id) ? 1 : 0;

  const text = (post.content || "").replace(/<[^>]*>/g, " ").trim();
  const contentLenNorm = Math.min(1, text.length / 280);

  const flag = post.content_flag || "";
  const flagMatch =
    ctx.activeContentFlag && flag && ctx.activeContentFlag === flag ? 1 : 0;
  const flagHelpOrLost =
    flag === "pedido_de_ajuda" || flag === "achados_e_perdidos" ? 1 : 0;

  return {
    bias: 1,
    log_reactions: Math.log1p(reactions),
    log_comments: Math.log1p(comments),
    recency_18h: recency18,
    recency_72h: recency72,
    same_neighborhood: sameNeighborhood,
    from_following: fromFollowing,
    has_image: Array.isArray(post.image_urls) && post.image_urls.length > 0 ? 1 : 0,
    has_video: post.video_url ? 1 : 0,
    has_audio: post.audio_url ? 1 : 0,
    content_len_norm: contentLenNorm,
    flag_match: flagMatch,
    flag_help_or_lost: flagHelpOrLost,
  };
}

export function featuresToArray(f: FeatureVector): number[] {
  return FEATURE_NAMES.map((name) => f[name]);
}
