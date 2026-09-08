/**
 * MOD-001: Detecção de spam via Gemini Flash-Lite (Google AI Studio).
 *
 * Política FAIL-CLOSED quando a moderação está ligada:
 *   - SPAM_CHECK_ENABLED=1 + GEMINI_API_KEY → a checagem é obrigatória
 *   - spam confirmado → bloqueia
 *   - timeout / rede / resposta inválida → também bloqueia
 *     (não publica conteúdo sem parecer da moderação)
 *   - SPAM_CHECK desligado ou sem chave → não checa, libera (moderação off)
 *
 * Ativar com:
 *   GEMINI_API_KEY=...           — chave do Google AI Studio
 *   SPAM_CHECK_ENABLED=1         — liga a checagem (desligada por padrão)
 *   GEMINI_SPAM_MODEL=...        — opcional, default abaixo
 */

const DEFAULT_MODEL = "gemini-flash-lite-latest";
const TIMEOUT_MS = 5000;
const MAX_CONTENT_CHARS = 2000;

export type SpamCheckStatus = "disabled" | "clean" | "spam" | "unavailable";

export interface SpamCheckResult {
  /** @deprecated use status === "spam" */
  isSpam: boolean;
  status: SpamCheckStatus;
  reason: string | null;
}

function envFlag(name: string): boolean {
  const v = process.env[name];
  if (!v) return false;
  return ["1", "true", "yes", "on"].includes(v.trim().toLowerCase());
}

export function isSpamCheckEnabled(): boolean {
  return envFlag("SPAM_CHECK_ENABLED") && !!process.env.GEMINI_API_KEY;
}

const SYSTEM_PROMPT = `Você modera posts de uma rede social de bairro chamada "Gente da Feira".
Classifique o texto abaixo como spam/propaganda não solicitada ou não.

Considere SPAM: propaganda comercial não solicitada, revenda disfarçada de post
pessoal, número de WhatsApp/telefone solto oferecendo produto ou serviço,
excesso de links externos, texto promocional que parece copiado e colado,
golpes ou esquemas de "ganhe dinheiro fácil".

NÃO considere spam: avisos de bairro, pedidos de ajuda, achados e perdidos,
divulgação pontual de um pequeno negócio local do próprio morador (ex.: "hoje
tem bolo na minha casa, quem quiser chama no zap"), desabafos, conversas
normais — mesmo que mencionem preço ou contato uma única vez.

Na dúvida, classifique como NÃO spam (prefira falso negativo a falso positivo).

Responda APENAS com um JSON válido, sem markdown, no formato exato:
{"spam": true ou false, "reason": "motivo em até 15 palavras, em português"}`;

/**
 * Classifica texto com Gemini.
 * Nunca lança — devolve status para a rota decidir.
 *
 * - disabled: moderação off → rotas devem publicar
 * - clean: não é spam → publicar
 * - spam: é spam → bloquear
 * - unavailable: IA falhou com moderação ON → bloquear (fail-closed)
 */
export async function checkSpam(content: string): Promise<SpamCheckResult> {
  if (!isSpamCheckEnabled()) {
    return { isSpam: false, status: "disabled", reason: null };
  }

  const plainText = content
    .replace(/<[^>]*>/g, " ")
    .replace(/&\w+;/g, " ")
    .trim();

  // Sem texto (só mídia): nada para classificar
  if (!plainText) {
    return { isSpam: false, status: "clean", reason: null };
  }

  const truncated = plainText.slice(0, MAX_CONTENT_CHARS);
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_SPAM_MODEL || DEFAULT_MODEL;

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
              parts: [{ text: `${SYSTEM_PROMPT}\n\nTexto:\n"""${truncated}"""` }],
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
      console.warn("[spam-check] Gemini HTTP", res.status);
      return {
        isSpam: true,
        status: "unavailable",
        reason: "Moderação automática temporariamente indisponível",
      };
    }

    const data = await res.json();
    const text: string | undefined =
      data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return {
        isSpam: true,
        status: "unavailable",
        reason: "Moderação automática temporariamente indisponível",
      };
    }

    let parsed: { spam?: unknown; reason?: unknown };
    try {
      parsed = JSON.parse(text);
    } catch {
      return {
        isSpam: true,
        status: "unavailable",
        reason: "Moderação automática temporariamente indisponível",
      };
    }

    if (typeof parsed?.spam !== "boolean") {
      return {
        isSpam: true,
        status: "unavailable",
        reason: "Moderação automática temporariamente indisponível",
      };
    }

    if (parsed.spam) {
      return {
        isSpam: true,
        status: "spam",
        reason:
          typeof parsed.reason === "string" ? parsed.reason.slice(0, 300) : null,
      };
    }

    return { isSpam: false, status: "clean", reason: null };
  } catch (err) {
    console.warn("[spam-check] falha", err instanceof Error ? err.message : err);
    // Fail-closed: moderação ligada e IA falhou → não publica
    return {
      isSpam: true,
      status: "unavailable",
      reason: "Moderação automática temporariamente indisponível",
    };
  } finally {
    clearTimeout(timeout);
  }
}

/** Mensagem amigável para a API devolver ao cliente */
export function spamBlockResponse(result: SpamCheckResult): {
  error: string;
  code: string;
  reason: string | null;
} {
  if (result.status === "unavailable") {
    return {
      error:
        "Não foi possível validar o conteúdo agora. Tente de novo em instantes.",
      code: "MODERATION_UNAVAILABLE",
      reason: result.reason,
    };
  }
  return {
    error:
      "Conteúdo bloqueado por moderação automática. Revise o texto e tente de novo.",
    code: "SPAM_BLOCKED",
    reason: result.reason,
  };
}
