/**
 * MOD-002: Moderação de mensagens de sala e DM via Gemini Flash-Lite.
 *
 * Diferente do spam-check.ts (posts/comentários, síncrono, fail-closed
 * antes de publicar), aqui a prioridade é outra:
 *
 *   - Volume é muito maior (30 msgs/min por usuário em salas vs 4 posts/min)
 *     e a expectativa de latência do chat é near-instant — bloquear o envio
 *     esperando a IA custaria uma UX ruim em troca de pouco ganho.
 *   - O risco relevante em chat privado/semi-privado é outro: assédio,
 *     discurso de ódio, ameaça, conteúdo sexual não solicitado, golpe/fraude
 *     via DM — spam comercial (o foco do spam-check) é secundário aqui.
 *   - Regex local para "ameaça" foi descartada de propósito: frases como
 *     "vou te matar" são hipérbole comum em português coloquial ("vou te
 *     matar de rir"), então um filtro síncrono por palavra-chave teria alto
 *     índice de falso positivo bloqueando conversas normais. Preferimos
 *     deixar a nuance para o modelo e agir depois, a bloquear na hora com
 *     ruído.
 *
 * Estratégia: mensagem é enviada e aparece normalmente (sem espera).
 * Em paralelo (fire-and-forget, mesmo padrão já usado nas notificações de
 * rooms-messages-route.ts), o conteúdo é classificado. Se for grave:
 *   1. `messages.is_deleted = true` (soft-delete nativo do schema — o
 *      próprio reply_to_id já assume is_deleted como estado válido)
 *   2. Denúncia automática via auto-report.ts, caindo na fila normal do
 *      AdminReportsView com a categoria certa (não sempre "spam")
 *
 * Trade-off assumido: a pessoa destinatária pode ver a mensagem por 1–2s
 * antes da remoção. Achamos esse trade-off melhor que (a) travar o chat
 * pra todo mundo esperando a IA, ou (b) continuar sem nenhuma checagem
 * em salas/DMs como é hoje.
 *
 * Ativar com:
 *   GEMINI_API_KEY=...              — já usada pelo spam-check
 *   CHAT_MODERATION_ENABLED=1       — liga a checagem (desligada por padrão)
 *   GEMINI_CHAT_MODERATION_MODEL=...— opcional, default abaixo
 */

import { createAdminClient } from "@/lib/supabase/server";
import { autoReportContent } from "@/lib/auto-report";

const DEFAULT_MODEL = "gemini-flash-lite-latest";
const TIMEOUT_MS = 8000;
const MAX_CONTENT_CHARS = 2000;

export type ChatModerationSurface = "room_message" | "dm_message";

/** Subconjunto de REPORT_CATEGORIES relevante para chat (ver report-constants.ts) */
export const CHAT_FLAG_CATEGORIES = [
  "harassment",
  "hate_speech",
  "violence",
  "nudity",
  "fraud",
  "spam",
] as const;
export type ChatFlagCategory = (typeof CHAT_FLAG_CATEGORIES)[number];

export interface ChatModerationClassification {
  flagged: boolean;
  category: ChatFlagCategory | null;
  reason: string | null;
}

function envFlag(name: string): boolean {
  const v = process.env[name];
  if (!v) return false;
  return ["1", "true", "yes", "on"].includes(v.trim().toLowerCase());
}

export function isChatModerationEnabled(): boolean {
  return envFlag("CHAT_MODERATION_ENABLED") && !!process.env.GEMINI_API_KEY;
}

function systemPromptFor(surface: ChatModerationSurface): string {
  const contexto =
    surface === "dm_message"
      ? "uma mensagem privada (1 para 1) entre dois moradores"
      : "uma mensagem em uma sala/grupo de bairro";

  return `Você modera ${contexto} de uma rede social de bairro chamada "Gente da Feira",
na cidade de Feira de Santana (BA).

Classifique o texto abaixo em UMA destas categorias, ou null se estiver ok:
- "harassment": assédio, bullying, humilhação, ameaça direcionada a uma pessoa
- "hate_speech": discurso de ódio (raça, gênero, orientação, religião, etc.)
- "violence": incitação ou instrução para violência real
- "nudity": conteúdo sexual explícito não solicitado
- "fraud": golpe, phishing, esquema de pagamento adiantado, falsa promessa de dinheiro
- "spam": propaganda comercial não solicitada em massa

NÃO classifique como problema: discordâncias, desabafos, palavrão comum sem alvo
específico, sarcasmo, hipérbole coloquial (ex.: "vou te matar de rir", "que ódio
desse trânsito"), negociação legítima de compra/venda entre moradores, flertes
consensuais, humor pesado sem alvo real.

Na dúvida, classifique como null (prefira falso negativo a falso positivo —
isso aqui roda depois que a mensagem já foi entregue, então o custo de um
falso positivo é remover uma conversa legítima).

Responda APENAS com um JSON válido, sem markdown, no formato exato:
{"category": "harassment" | "hate_speech" | "violence" | "nudity" | "fraud" | "spam" | null, "reason": "motivo em até 15 palavras, em português, ou null"}`;
}

/**
 * Classifica uma mensagem de chat. Nunca lança.
 * Ao contrário do spam-check.ts, aqui é sempre "fail-open": qualquer falha
 * (timeout, IA fora do ar, JSON inválido) resulta em `flagged: false` —
 * não queremos apagar mensagens legítimas por instabilidade da IA, e a
 * mensagem já foi entregue mesmo (diferente de bloquear publicação).
 */
export async function classifyChatMessage(
  content: string,
  surface: ChatModerationSurface
): Promise<ChatModerationClassification> {
  if (!isChatModerationEnabled()) {
    return { flagged: false, category: null, reason: null };
  }

  const plainText = content.replace(/<[^>]*>/g, " ").replace(/&\w+;/g, " ").trim();
  if (!plainText) return { flagged: false, category: null, reason: null };

  const truncated = plainText.slice(0, MAX_CONTENT_CHARS);
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_CHAT_MODERATION_MODEL || DEFAULT_MODEL;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey!,
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: `${systemPromptFor(surface)}\n\nTexto:\n"""${truncated}"""` }],
            },
          ],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 100,
            responseMimeType: "application/json",
          },
        }),
        signal: controller.signal,
      }
    );

    if (!res.ok) {
      console.warn("[chat-moderation] Gemini HTTP", res.status);
      return { flagged: false, category: null, reason: null };
    }

    const data = await res.json();
    const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return { flagged: false, category: null, reason: null };

    let parsed: { category?: unknown; reason?: unknown };
    try {
      parsed = JSON.parse(text);
    } catch {
      return { flagged: false, category: null, reason: null };
    }

    const category = parsed?.category;
    if (typeof category !== "string" || !(CHAT_FLAG_CATEGORIES as readonly string[]).includes(category)) {
      return { flagged: false, category: null, reason: null };
    }

    return {
      flagged: true,
      category: category as ChatFlagCategory,
      reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 300) : null,
    };
  } catch (err) {
    console.warn("[chat-moderation] falha", err instanceof Error ? err.message : err);
    return { flagged: false, category: null, reason: null };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Ponto de entrada único a chamar em fire-and-forget logo após o INSERT
 * da mensagem, tanto em rooms-messages-route.ts quanto em
 * dm-messages-route.ts. Nunca lança — é best-effort por design.
 */
export async function moderateChatMessageAsync(params: {
  messageId: string;
  content: string | null;
  surface: ChatModerationSurface;
  senderId: string;
}): Promise<void> {
  try {
    if (!isChatModerationEnabled()) return;
    if (!params.content || !params.content.trim()) return; // mídia sem texto: nada a classificar

    const result = await classifyChatMessage(params.content, params.surface);
    if (!result.flagged || !result.category) return;

    const admin = createAdminClient();

    // Soft-delete — reaproveita exatamente o campo que já é respeitado
    // pelas rotas GET (.eq("is_deleted", false)) e pelo reply_to_id.
    const { error: updateError } = await admin
      .from("messages")
      .update({ is_deleted: true })
      .eq("id", params.messageId);

    if (updateError) {
      console.error("[chat-moderation] falha ao soft-delete", updateError);
      return;
    }

    await autoReportContent({
      targetType: params.surface,
      targetId: params.messageId,
      targetOwnerId: params.senderId,
      category: result.category,
      reason: result.reason,
    });
  } catch (err) {
    // Best-effort — nunca deve derrubar o envio da mensagem (já enviada).
    console.error("[chat-moderation] erro inesperado", err);
  }
}
