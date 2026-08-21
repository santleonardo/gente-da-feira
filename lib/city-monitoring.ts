/**
 * Base do monitoramento local (Feira de Santana).
 * Helpers de categoria, score e filtro geográfico textual.
 */

export const CITY_CATEGORIES = [
  "geral",
  "eventos",
  "emprego",
  "transito",
  "seguranca",
  "clima",
  "cultura",
  "esporte",
  "politica",
  "saude",
  "educacao",
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
  // bairros / pontos (amostra — expandir com o tempo)
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

/**
 * Heurística barata: o texto parece sobre Feira de Santana?
 * Não substitui curadoria; reduz ruído na ingestão.
 */
export function looksLikeFeiraDeSantana(text: string): boolean {
  const t = ` ${text.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "")} `;
  const normalized = t
    .replace(/feira de santana/g, "feira de santana")
    .replace(/\s+/g, " ");

  if (normalized.includes("feira de santana")) return true;

  for (const kw of FSA_KEYWORDS) {
    const k = kw.normalize("NFD").replace(/\p{M}/gu, "");
    if (normalized.includes(k)) return true;
  }
  return false;
}

/**
 * Score inicial 0–100 a partir de confiança da fonte, frescor e menção local.
 */
export function computeRelevanceScore(opts: {
  trustScore?: number;
  sourcePublishedAt?: string | Date | null;
  text?: string;
  hasImage?: boolean;
}): number {
  const trust = Math.min(100, Math.max(0, opts.trustScore ?? 50));
  let score = trust * 0.5;

  if (opts.text && looksLikeFeiraDeSantana(opts.text)) {
    score += 25;
  }

  if (opts.sourcePublishedAt) {
    const t = new Date(opts.sourcePublishedAt).getTime();
    if (!Number.isNaN(t)) {
      const hours = (Date.now() - t) / (1000 * 60 * 60);
      if (hours <= 6) score += 20;
      else if (hours <= 24) score += 12;
      else if (hours <= 72) score += 5;
    }
  }

  if (opts.hasImage) score += 3;

  return Math.round(Math.min(100, Math.max(0, score)));
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
