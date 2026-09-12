/**
 * Ranker linear (machine learning clássico: modelo discriminativo linear).
 * Substitui score ad-hoc por vetor de features × pesos versionados.
 */

import {
  extractFeatures,
  FEATURE_NAMES,
  type RankingContext,
  type RankingPostInput,
  type FeatureVector,
} from "./features";
import { loadWeights, RANKING_MODEL_VERSION } from "./weights";

export type RankedPost<T extends RankingPostInput> = T & {
  _rank_score: number;
  _rank_model: string;
};

export function scoreFeatures(
  features: FeatureVector,
  weights = loadWeights()
): number {
  let s = 0;
  for (const name of FEATURE_NAMES) {
    s += (weights[name] ?? 0) * (features[name] ?? 0);
  }
  return s;
}

export function scorePost(
  post: RankingPostInput,
  ctx: RankingContext = {},
  weights = loadWeights()
): number {
  return scoreFeatures(extractFeatures(post, ctx), weights);
}

/**
 * Ordena posts por score decrescente; desempate por created_at.
 * Não muta o array original.
 */
export function rankPosts<T extends RankingPostInput>(
  posts: T[],
  ctx: RankingContext = {}
): RankedPost<T>[] {
  const weights = loadWeights();
  const scored = posts.map((p) => {
    const features = extractFeatures(p, ctx);
    const score = scoreFeatures(features, weights);
    return Object.assign({}, p, {
      _rank_score: score,
      _rank_model: RANKING_MODEL_VERSION,
    }) as RankedPost<T>;
  });

  scored.sort((a, b) => {
    const d = b._rank_score - a._rank_score;
    if (d !== 0) return d;
    return String(b.created_at || "").localeCompare(String(a.created_at || ""));
  });

  return scored;
}

export { RANKING_MODEL_VERSION, extractFeatures, FEATURE_NAMES };
