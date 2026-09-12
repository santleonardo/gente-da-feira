/**
 * Pesos do modelo linear de ranking.
 *
 * Podem ser recalibrados offline (Python/notebook) e colados aqui,
 * ou carregados de env RANKING_WEIGHTS_JSON no futuro.
 *
 * score = Σ w_i * x_i
 */

import type { FeatureName } from "./features";
import { FEATURE_NAMES } from "./features";

/** Versão do modelo — suba ao alterar pesos em produção */
export const RANKING_MODEL_VERSION = "gdf-linear-v1";

/**
 * Pesos iniciais (heurística + escala típica de rede local).
 * Não é deep learning: é um ranker linear interpretável (ponto de partida ML).
 */
export const DEFAULT_WEIGHTS: Record<FeatureName, number> = {
  bias: 0.15,
  log_reactions: 2.1,
  log_comments: 3.3,
  recency_18h: 3.8,
  recency_72h: 1.2,
  same_neighborhood: 2.6,
  from_following: 1.4,
  has_image: 0.4,
  has_video: 0.3,
  has_audio: 0.2,
  content_len_norm: 0.25,
  flag_match: 0.9,
  flag_help_or_lost: 0.7,
};

export function loadWeights(): Record<FeatureName, number> {
  const raw = process.env.RANKING_WEIGHTS_JSON?.trim();
  if (!raw) return { ...DEFAULT_WEIGHTS };
  try {
    const parsed = JSON.parse(raw) as Partial<Record<FeatureName, number>>;
    const out = { ...DEFAULT_WEIGHTS };
    for (const name of FEATURE_NAMES) {
      if (typeof parsed[name] === "number" && Number.isFinite(parsed[name])) {
        out[name] = parsed[name] as number;
      }
    }
    return out;
  } catch {
    return { ...DEFAULT_WEIGHTS };
  }
}
