/**
 * Conta dedicada @ClimaGDF (clima / alertas).
 * Separada da conta "Cidade" (is_city_bot).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Reutiliza o mesmo teto diário da conta Cidade */
export const MAX_WEATHER_POSTS_PER_DAY = 100;

let _cachedWeatherBotId: string | null | undefined;

/**
 * Resolve o UUID da conta oficial de clima.
 * Prioridade: WEATHER_BOT_USER_ID → profiles.is_weather_bot → null
 */
export async function resolveWeatherBotUserId(
  admin: SupabaseClient
): Promise<string | null> {
  if (_cachedWeatherBotId !== undefined) return _cachedWeatherBotId;

  const fromEnv = process.env.WEATHER_BOT_USER_ID?.trim();
  if (fromEnv && /^[0-9a-f-]{36}$/i.test(fromEnv)) {
    _cachedWeatherBotId = fromEnv;
    return _cachedWeatherBotId;
  }

  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("is_weather_bot", true)
    .limit(1)
    .maybeSingle();

  const resolvedId: string | null = data?.id ?? null;
  _cachedWeatherBotId = resolvedId;
  return resolvedId;
}

/** Quantos posts a conta Clima já publicou hoje (UTC) */
export async function countWeatherPostsToday(
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
    console.warn("[weather-bot] countWeatherPostsToday", error.message);
    return MAX_WEATHER_POSTS_PER_DAY; // fail-closed
  }
  return count ?? 0;
}

export type PublishWeatherPostResult =
  | { ok: true; postId: string }
  | { ok: false; reason: string };

/**
 * Publica post no feed em nome da conta ClimaGDF.
 * Idempotente por external_id (últimas 24h).
 */
export async function publishWeatherPost(
  admin: SupabaseClient,
  content: string,
  externalId?: string | null
): Promise<PublishWeatherPostResult> {
  const botId = await resolveWeatherBotUserId(admin);
  if (!botId) {
    return {
      ok: false,
      reason:
        "Conta ClimaGDF não configurada (WEATHER_BOT_USER_ID ou profiles.is_weather_bot)",
    };
  }

  const todayCount = await countWeatherPostsToday(admin, botId);
  if (todayCount >= MAX_WEATHER_POSTS_PER_DAY) {
    return {
      ok: false,
      reason: `limite diário (${MAX_WEATHER_POSTS_PER_DAY}) atingido`,
    };
  }

  if (externalId && externalId.length >= 8) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: existing } = await admin
      .from("posts")
      .select("id")
      .eq("author_id", botId)
      .eq("is_deleted", false)
      .gte("created_at", since)
      .ilike("content", `%${externalId.slice(0, 80)}%`)
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      return { ok: false, reason: "duplicata (mesmo external_id recente)" };
    }
  }

  const finalContent = externalId
    ? `${content}\n\n#${externalId.slice(0, 64)}`
    : content;

  const { data: post, error } = await admin
    .from("posts")
    .insert({
      content: finalContent.slice(0, 1000),
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
