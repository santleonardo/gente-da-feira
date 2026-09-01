/**
 * Publica no feed principal (tabela posts) a partir de um item da cidade.
 * Usado pelo cron RSS e pela ingestão interna.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Máximo de posts da conta "Cidade" por dia (UTC) — evita poluir o feed */
export const MAX_CITY_POSTS_PER_DAY = 20;

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

export function buildCityPostContent(opts: {
  title: string;
  summary?: string | null;
  url?: string | null;
  sourceName?: string | null;
  category?: string | null;
}): string {
  const title = opts.title.trim().slice(0, 200);
  const summary = (opts.summary || "").trim().slice(0, 400);
  const source = (opts.sourceName || "Fonte pública").trim().slice(0, 80);
  const url = (opts.url || "").trim();

  // Post normal na timeline (sem prefixo de bloco "Na cidade")
  const lines = [title];
  if (summary) {
    lines.push("");
    lines.push(summary);
  }
  lines.push("");
  lines.push(`Fonte: ${source}`);
  if (url && /^https?:\/\//i.test(url)) {
    lines.push(url);
  }
  return lines.join("\n").slice(0, 2000);
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
