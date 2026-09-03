/**
 * Publica no feed principal (tabela posts) a partir de um item da cidade.
 * Usado pelo cron RSS e pela ingestão interna.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Máximo de posts da conta "Cidade" por dia (UTC) — evita poluir o feed */
export const MAX_CITY_POSTS_PER_DAY = 100;

/** Score mínimo para virar post na timeline (antes ia para o bloco de cards em ≥65) */
export const MIN_SCORE_FOR_FEED_POST = 65;

let _cachedBotId: string | null | undefined;

/**
 * Resolve o UUID da conta oficial (env ou profiles.is_city_bot).
 */
export async function resolveCityBotUserId(
  admin: SupabaseClient
): Promise<string | null> {
  if (_cachedBotId !== undefined) return _cachedBotId;

  const fromEnv = process.env.CITY_BOT_USER_ID?.trim();
  if (fromEnv && /^[0-9a-f-]{36}$/i.test(fromEnv)) {
    _cachedBotId = fromEnv;
    return _cachedBotId;
  }

  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("is_city_bot", true)
    .limit(1)
    .maybeSingle();

  const resolvedId: string | null = data?.id ?? null;
  _cachedBotId = resolvedId;
  return resolvedId;
}

const MAX_HEADLINE_CHARS = 110;
const MAX_BODY_CHARS = 240;

function cleanText(s: string): string {
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&\w+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1).replace(/\s+\S*$/, "").trim();
  return (cut || text.slice(0, max - 1).trim()) + "…";
}

/**
 * Manchete (H1): o fato principal em poucas palavras.
 */
function buildHeadline(title: string): string {
  let h = cleanText(title);
  const words = h.split(/\s+/).filter(Boolean);
  if (words.length > 14) {
    h = words.slice(0, 14).join(" ");
    if (!/[.!?…]$/.test(h)) h += "…";
  }
  h = truncateAtWord(h, MAX_HEADLINE_CHARS);
  return h.replace(/[\s:;,\-–—]+$/g, "").trim();
}

/**
 * Corpo estilo pirâmide invertida: o essencial primeiro, máx. 240 chars.
 * Usa o resumo do RSS; se faltar, monta a partir do título.
 */
function buildInvertedPyramidBody(
  title: string,
  summary?: string | null
): string {
  const t = cleanText(title);
  const s = summary ? cleanText(summary) : "";

  // Prioriza frases do resumo (já costumam trazer o lead jornalístico)
  const sentences = (s || t)
    .split(/(?<=[.!?])\s+/)
    .map((x) => x.trim())
    .filter((x) => x.length > 8);

  let body = "";
  for (const sentence of sentences) {
    const next = body ? `${body} ${sentence}` : sentence;
    if (next.length > MAX_BODY_CHARS) {
      if (!body) {
        body = truncateAtWord(sentence, MAX_BODY_CHARS);
      }
      break;
    }
    body = next;
    // Pirâmide invertida curta: 1–2 frases bastam no feed
    if (body.length >= 120 && sentences.indexOf(sentence) >= 1) break;
  }

  if (!body) {
    body = truncateAtWord(s || t, MAX_BODY_CHARS);
  }

  // Evita repetir a manchete inteira no corpo
  const headline = buildHeadline(title).replace(/…$/, "").toLowerCase();
  if (
    headline.length >= 20 &&
    body.toLowerCase().startsWith(headline.toLowerCase())
  ) {
    const rest = body.slice(headline.length).replace(/^[\s:;,\-–—]+/, "");
    if (rest.length >= 40) body = rest;
  }

  return truncateAtWord(body, MAX_BODY_CHARS);
}

export function buildCityPostContent(opts: {
  title: string;
  summary?: string | null;
  url?: string | null;
  sourceName?: string | null;
  category?: string | null;
}): string {
  const source = (opts.sourceName || "Fonte pública").trim().slice(0, 80);
  const url = (opts.url || "").trim();
  const headline = buildHeadline(opts.title || "");
  const body = buildInvertedPyramidBody(opts.title || "", opts.summary);

  // H1 + lead (≤240) + fonte com link na mesma linha (rótulo curto no feed)
  const lines = [`# ${headline}`, "", body, ""];
  if (url && /^https?:\/\//i.test(url)) {
    lines.push(`Fonte: ${source} · ${url}`);
  } else {
    lines.push(`Fonte: ${source}`);
  }
  return lines.join("\n").slice(0, 1000);
}

/**
 * Quantos posts a conta Cidade já publicou hoje (UTC).
 */
export async function countCityPostsToday(
  admin: SupabaseClient,
  botId: string
): Promise<number> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);

  const { count, error } = await admin
    .from("posts")
    .select("id", { count: "exact", head: true })
    .eq("author_id", botId)
    .eq("is_deleted", false)
    .gte("created_at", start.toISOString());

  if (error) {
    console.warn("[city-feed-post] countCityPostsToday", error.message);
    return MAX_CITY_POSTS_PER_DAY; // fail-closed: não posta mais se não souber
  }
  return count ?? 0;
}

export type PublishCityPostResult =
  | { ok: true; postId: string }
  | { ok: false; reason: string };

/**
 * Insere um post público no feed em nome da conta Cidade.
 * Idempotência: se já existir post com o mesmo link no conteúdo nas últimas 48h, pula.
 */
export async function publishCityFeedPost(
  admin: SupabaseClient,
  opts: {
    title: string;
    summary?: string | null;
    url?: string | null;
    sourceName?: string | null;
    category?: string | null;
    relevanceScore?: number;
  }
): Promise<PublishCityPostResult> {
  const botId = await resolveCityBotUserId(admin);
  if (!botId) {
    return {
      ok: false,
      reason:
        "Conta Cidade não configurada (CITY_BOT_USER_ID ou profiles.is_city_bot)",
    };
  }

  const score = opts.relevanceScore ?? 0;
  if (score < MIN_SCORE_FOR_FEED_POST) {
    return { ok: false, reason: `score ${score} < ${MIN_SCORE_FOR_FEED_POST}` };
  }

  const todayCount = await countCityPostsToday(admin, botId);
  if (todayCount >= MAX_CITY_POSTS_PER_DAY) {
    return {
      ok: false,
      reason: `limite diário (${MAX_CITY_POSTS_PER_DAY}) atingido`,
    };
  }

  const content = buildCityPostContent(opts);

  // Evita o mesmo link virar vários posts
  if (opts.url) {
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data: existing } = await admin
      .from("posts")
      .select("id")
      .eq("author_id", botId)
      .eq("is_deleted", false)
      .gte("created_at", since)
      .ilike("content", `%${opts.url.slice(0, 120)}%`)
      .limit(1)
      .maybeSingle();
    if (existing?.id) {
      return { ok: false, reason: "duplicata (mesmo link recente)" };
    }
  }

  const { data: post, error } = await admin
    .from("posts")
    .insert({
      content,
      author_id: botId,
      neighborhood: null,
      image_urls: [],
      video_url: null,
      audio_url: null,
      visibility: "public",
      expires_at: null,
      shared_post_id: null,
      post_style: null,
      post_type: "simple",
    })
    .select("id")
    .single();

  if (error || !post?.id) {
    return {
      ok: false,
      reason: error?.message || "falha ao inserir post",
    };
  }

  return { ok: true, postId: post.id };
}
