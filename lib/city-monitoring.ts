/**
 * Base do monitoramento local (Feira de Santana).
 * Helpers de categoria, score, filtro geográfico e prioridade editorial.
 *
 * Prioridade para auto-publicação no feed (da maior para a menor):
 *   1. Feira de Santana (local explícito)
 *   2. Bahia / regional
 *   3. Política nacional
 *   4. Esporte de interesse nacional (Brasileirão, Libertadores, Copa do Brasil,
 *      Bahia, Vitória, F1 e outros de alcance nacional)
 *   5. Cultura, música, festivais, celebridades
 *
 * Não é obrigatório mencionar Feira de Santana para publicar —
 * o local só recebe prioridade/bônus quando aparecer.
 */

export const CITY_CATEGORIES = [
  "geral",
  "eventos",
  "emprego",
  "transito",
  "seguranca",
  "clima",
  "economia",
  "cultura",
  "esporte",
  "politica",
  "saude",
  "educacao",
  "entretenimento",
] as const;

export type CityCategory = (typeof CITY_CATEGORIES)[number];

export const CITY_PLATFORMS = [
  "rss",
  "news",
  "x",
  "youtube",
  "website",
  "manual",
  "other",
] as const;

export type CityPlatform = (typeof CITY_PLATFORMS)[number];

/**
 * Escopo geográfico de uma fonte:
 * - "local":    conteúdo é filtrado por menção a Feira de Santana (looksLikeFeiraDeSantana)
 * - "regional": Bahia / cidades vizinhas à RMFS — entra sem exigir menção
 *   explícita a Feira de Santana (o filtro local é pulado na ingestão).
 * - "national": conteúdo nacional (política, esporte, entretenimento etc.)
 *   entra sem exigir menção à cidade — o filtro local é pulado na ingestão.
 */
export const CITY_SOURCE_SCOPES = ["local", "regional", "national"] as const;

export type CitySourceScope = (typeof CITY_SOURCE_SCOPES)[number];

export function isCitySourceScope(v: string): v is CitySourceScope {
  return (CITY_SOURCE_SCOPES as readonly string[]).includes(v);
}

export function isScopedFilterExempt(scope: string | null | undefined): boolean {
  return scope === "regional" || scope === "national";
}

/** Palavras que indicam relação com Feira de Santana */
const FSA_KEYWORDS = [
  "feira de santana",
  "feira de santana-ba",
  "feira de santana/ba",
  " fsa ",
  "fsa-",
  "#fsa",
  "feirense",
  "feirenses",
  "região metropolitana de feira",
  "tomba",
  "caseb",
  "cerveira",
  "campo limpo",
  "brasília",
  "muchila",
  "queimadinha",
  "parque getúlio",
  "avião",
  "cidade nova",
  "lagos",
  "sobradinho",
  "uefs",
  "rodoviária de feira",
];

/** Bahia / regional (sem ser só FSA) */
const BAHIA_KEYWORDS = [
  " bahia ",
  " baiano",
  " baiana",
  "salvador",
  "soteropolitano",
  "região metropolitana de salvador",
  "recôncavo",
  "reconcavo",
  "juazeiro",
  "vitória da conquista",
  "ilhéus",
  "ilheus",
  "porto seguro",
  "lauro de freitas",
  "camaçari",
  "camacari",
  "simões filho",
  "simoes filho",
  "governo da bahia",
  "assembleia legislativa da bahia",
  "al-ba",
  "sefaz-ba",
];

/**
 * Esporte de interesse nacional / BA:
 * Brasileirão, Libertadores, Copa do Brasil, Bahia, Vitória, F1, etc.
 * Evita só campeonatos estaduais mirins sem relevância nacional.
 */
const SPORTS_INTEREST_KEYWORDS = [
  "brasileirão",
  "brasileirao",
  "série a",
  "serie a",
  "série b",
  "serie b",
  "libertadores",
  "copa do brasil",
  "copa libertadores",
  "sul-americana",
  "sulamericana",
  "seleção brasileira",
  "selecao brasileira",
  "ec bahia",
  "esporte clube bahia",
  " time do bahia",
  " do bahia ",
  "bahia x ",
  " x bahia",
  "vitória ",
  "vitoria ",
  "ec vitória",
  "ec vitoria",
  "leão da barra",
  "leao da barra",
  "fórmula 1",
  "formula 1",
  "f1 ",
  "grande prêmio",
  "grande premio",
  "nba",
  "uol esporte",
  "mundial de clubes",
  "champions league",
  "olimpíada",
  "olimpiada",
  "jogos olímpicos",
  "copa do mundo",
  "vôlei",
  "volei",
  "natação",
  "natacao",
  "atletismo",
  "tênis",
  "tenis",
  "mma",
  "ufc",
  "boxe",
];

/** Cultura / música / festivais / celebridades */
const CULTURE_KEYWORDS = [
  "rock in rio",
  "lollapalooza",
  "festival",
  "show ",
  "turnê",
  "turne",
  "álbum",
  "album",
  "clipe",
  "cinema",
  "filme",
  "série",
  "serie",
  "novela",
  "celebridade",
  "famosos",
  "bbb",
  "reality",
  "grammy",
  "oscar",
  "emmy",
  "teatro",
  "exposição",
  "exposicao",
  "música",
  "musica",
  "cantor",
  "cantora",
  "ator ",
  "atriz",
];

function normalizeText(text: string): string {
  return ` ${text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")} `;
}

/**
 * Heurística: o texto parece sobre Feira de Santana?
 */
export function looksLikeFeiraDeSantana(text: string): boolean {
  const normalized = normalizeText(text);
  if (normalized.includes("feira de santana")) return true;
  for (const kw of FSA_KEYWORDS) {
    const k = kw.normalize("NFD").replace(/\p{M}/gu, "");
    if (normalized.includes(k)) return true;
  }
  return false;
}

export function looksLikeBahiaRegional(text: string): boolean {
  const normalized = normalizeText(text);
  for (const kw of BAHIA_KEYWORDS) {
    const k = kw.normalize("NFD").replace(/\p{M}/gu, "");
    if (normalized.includes(k)) return true;
  }
  return false;
}

export function looksLikeSportsInterest(text: string): boolean {
  const normalized = normalizeText(text);
  for (const kw of SPORTS_INTEREST_KEYWORDS) {
    const k = kw.normalize("NFD").replace(/\p{M}/gu, "");
    if (normalized.includes(k)) return true;
  }
  return false;
}

export function looksLikeCultureEntertainment(text: string): boolean {
  const normalized = normalizeText(text);
  for (const kw of CULTURE_KEYWORDS) {
    const k = kw.normalize("NFD").replace(/\p{M}/gu, "");
    if (normalized.includes(k)) return true;
  }
  return false;
}

/**
 * Camadas editoriais (maior = mais prioritário no feed).
 * 1 local FSA · 2 Bahia · 3 política nacional · 4 esporte interesse · 5 cultura · 0 genérico
 */
export type ContentTier =
  | "local_fsa"
  | "regional_ba"
  | "national_politics"
  | "sports_interest"
  | "culture"
  | "generic";

export function classifyContentTier(opts: {
  text: string;
  category?: string | null;
  scope?: string | null;
}): ContentTier {
  const text = opts.text || "";
  const category = (opts.category || "").toLowerCase();
  const scope = opts.scope || "local";

  if (looksLikeFeiraDeSantana(text) || scope === "local") {
    if (looksLikeFeiraDeSantana(text)) return "local_fsa";
  }

  if (scope === "regional" || looksLikeBahiaRegional(text)) {
    return "regional_ba";
  }

  if (category === "politica") {
    return "national_politics";
  }

  if (category === "esporte" || looksLikeSportsInterest(text)) {
    // Esporte “miúdo” sem keyword de interesse cai em generic (score menor)
    if (category === "esporte" && !looksLikeSportsInterest(text)) {
      return "generic";
    }
    return "sports_interest";
  }

  if (
    category === "cultura" ||
    category === "entretenimento" ||
    category === "eventos" ||
    looksLikeCultureEntertainment(text)
  ) {
    return "culture";
  }

  if (scope === "local" && looksLikeFeiraDeSantana(text)) {
    return "local_fsa";
  }

  return "generic";
}

/** Bônus de prioridade editorial por camada */
const TIER_BONUS: Record<ContentTier, number> = {
  local_fsa: 28,
  regional_ba: 24,
  national_politics: 22,
  sports_interest: 20,
  culture: 18,
  generic: 8,
};

/** Limiar mínimo de score para auto-publicar por camada */
export const TIER_PUBLISH_THRESHOLD: Record<ContentTier, number> = {
  local_fsa: 55,
  regional_ba: 58,
  national_politics: 58,
  sports_interest: 60,
  culture: 60,
  generic: 72, // genérico só se for bem forte (evita loteria / ruído)
};

/**
 * Score 0–100: trust + prioridade editorial + frescor + imagem.
 * Não exige mais menção a Feira para regional/national.
 */
export function computeRelevanceScore(opts: {
  trustScore?: number;
  sourcePublishedAt?: string | Date | null;
  text?: string;
  hasImage?: boolean;
  scope?: string | null;
  category?: string | null;
}): number {
  const trust = Math.min(100, Math.max(0, opts.trustScore ?? 50));
  let score = trust * 0.45;

  const tier = classifyContentTier({
    text: opts.text || "",
    category: opts.category,
    scope: opts.scope,
  });

  // Fontes local sem menção a FSA: quase não pontuam no bônus de tema
  if (opts.scope === "local" && !looksLikeFeiraDeSantana(opts.text || "")) {
    score += 0;
  } else {
    score += TIER_BONUS[tier];
  }

  if (opts.sourcePublishedAt) {
    const t = new Date(opts.sourcePublishedAt).getTime();
    if (!Number.isNaN(t)) {
      const hours = (Date.now() - t) / (1000 * 60 * 60);
      if (hours <= 6) score += 18;
      else if (hours <= 24) score += 12;
      else if (hours <= 72) score += 5;
    }
  }

  if (opts.hasImage) score += 3;

  return Math.round(Math.min(100, Math.max(0, score)));
}

/**
 * Decide se o item deve ser auto-publicado (card + candidato a post no feed).
 */
export function shouldAutoPublish(opts: {
  relevanceScore: number;
  text?: string;
  category?: string | null;
  scope?: string | null;
}): { publish: boolean; tier: ContentTier; threshold: number } {
  const tier = classifyContentTier({
    text: opts.text || "",
    category: opts.category,
    scope: opts.scope,
  });
  const threshold = TIER_PUBLISH_THRESHOLD[tier];
  return {
    publish: opts.relevanceScore >= threshold,
    tier,
    threshold,
  };
}

export function slugifyTopic(topic: string): string {
  return topic
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export function isCityCategory(v: string): v is CityCategory {
  return (CITY_CATEGORIES as readonly string[]).includes(v);
}

export function isCityPlatform(v: string): v is CityPlatform {
  return (CITY_PLATFORMS as readonly string[]).includes(v);
}
