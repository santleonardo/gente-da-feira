/**
 * Conta dedicada de frases motivacionais (ex.: @motivacao_gdf).
 * Separada da conta "Cidade" e da conta "Clima".
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Limite diário para não poluir o feed */
export const MAX_MOTIVATIONAL_POSTS_PER_DAY = 4;

let _cachedMotivationalBotId: string | null | undefined;

/**
 * Resolve o UUID da conta oficial de motivação.
 * Prioridade: MOTIVATIONAL_BOT_USER_ID → profiles.is_motivational_bot → null
 */
export async function resolveMotivationalBotUserId(
  admin: SupabaseClient
): Promise<string | null> {
  if (_cachedMotivationalBotId !== undefined) return _cachedMotivationalBotId;

  const fromEnv = process.env.MOTIVATIONAL_BOT_USER_ID?.trim();
  if (fromEnv && /^[0-9a-f-]{36}$/i.test(fromEnv)) {
    _cachedMotivationalBotId = fromEnv;
    return _cachedMotivationalBotId;
  }

  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("is_motivational_bot", true)
    .limit(1)
    .maybeSingle();

  const resolvedId: string | null = data?.id ?? null;
  _cachedMotivationalBotId = resolvedId;
  return resolvedId;
}

/** Quantos posts a conta já publicou hoje (UTC) */
export async function countMotivationalPostsToday(
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
    console.warn("[motivational-bot] countMotivationalPostsToday", error.message);
    return MAX_MOTIVATIONAL_POSTS_PER_DAY; // fail-closed
  }
  return count ?? 0;
}

export type PublishMotivationalPostResult =
  | { ok: true; postId: string }
  | { ok: false; reason: string };

/**
 * Frases motivacionais curtas, em português, tom positivo e local (Feira / BA).
 * Evitar frases longas demais para o feed.
 */
export const MOTIVATIONAL_PHRASES: readonly string[] = [
  "☀️ Bom dia, Feira! Cada manhã é uma chance nova de recomeçar com coragem.",
  "💪 Você é mais forte do que pensa. Um passo de cada vez e a meta chega.",
  "🌱 Pequenas atitudes diárias constroem grandes resultados. Continue.",
  "✨ Acredite no seu potencial. Feira de Santana cresce com gente que não desiste.",
  "🔥 Disciplina bate motivação: faça mesmo quando não estiver com vontade.",
  "😊 Um sorriso e um “bom dia” mudam o clima do bairro. Espalhe o bem.",
  "🛤️ O caminho se faz caminhando. Hoje é um ótimo dia para avançar.",
  "💡 Sua ideia pode ser a solução que alguém precisa. Compartilhe.",
  "🤝 Juntos a gente vai mais longe. Ajude quem está ao seu lado.",
  "🌟 Não compare sua jornada com a dos outros. Seu ritmo também é válido.",
  "📖 Aprenda algo novo hoje — mesmo que seja pequeno. O conhecimento acumula.",
  "🙏 Gratidão transforma o dia. Liste três coisas boas que já aconteceram.",
  "🏃‍♂️ Movimento gera energia. Levante, respire e vá em frente.",
  "💎 Pressão faz diamante. Os desafios de agora preparam o que vem depois.",
  "🌈 Depois da chuva, o sol volta. Segure firme nos dias difíceis.",
  "🎯 Foque no que você controla. O resto deixa pra lá.",
  "❤️ Cuide de quem você ama e de si mesmo. Saúde em primeiro lugar.",
  "🏆 Vitória não é só o resultado final — é a coragem de tentar de novo.",
  "🕊️ Paz interior começa com um momento de silêncio. Respire fundo.",
  "🌺 Feira tem sol, tem gente boa e tem futuro. Você faz parte disso.",
  "📌 Comece pelo mais difícil. O resto fica mais leve.",
  "🌍 Seja a mudança que você quer ver no seu bairro.",
  "💬 Palavras gentis custam pouco e valem muito. Use-as hoje.",
  "⚡ Energia positiva é contagiante. Seja o primeiro a espalhar.",
  "🧩 Cada erro ensina. Ajuste a rota e siga em frente sem medo.",
  "📅 Planeje o dia, mas deixe espaço para a surpresa boa.",
  "🛡️ Proteja sua mente: menos comparação, mais ação.",
  "🎨 Crie algo hoje — um texto, um gesto, uma ideia. Deixe sua marca.",
  "🌊 Vá com o fluxo, mas não perca o destino de vista.",
  "👏 Celebre as pequenas conquistas. Elas alimentam a motivação.",
];

/**
 * Escolhe uma frase de forma determinística por dia + slot,
 * para evitar repetir a mesma no mesmo dia em múltiplas execuções.
 */
export function pickPhrase(slot: number = 0): string {
  const now = new Date();
  // Dia do ano (UTC) + slot → índice estável
  const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 0));
  const dayOfYear = Math.floor(
    (now.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)
  );
  const idx =
    (dayOfYear * 7 + slot + now.getUTCHours()) % MOTIVATIONAL_PHRASES.length;
  return MOTIVATIONAL_PHRASES[idx] ?? MOTIVATIONAL_PHRASES[0];
}

/**
 * Publica post no feed em nome da conta de motivação.
 */
export async function publishMotivationalPost(
  admin: SupabaseClient,
  content: string,
  externalId?: string | null
): Promise<PublishMotivationalPostResult> {
  const botId = await resolveMotivationalBotUserId(admin);
  if (!botId) {
    return {
      ok: false,
      reason:
        "Conta de motivação não configurada (MOTIVATIONAL_BOT_USER_ID ou profiles.is_motivational_bot)",
    };
  }

  const todayCount = await countMotivationalPostsToday(admin, botId);
  if (todayCount >= MAX_MOTIVATIONAL_POSTS_PER_DAY) {
    return {
      ok: false,
      reason: `limite diário (${MAX_MOTIVATIONAL_POSTS_PER_DAY}) atingido`,
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
