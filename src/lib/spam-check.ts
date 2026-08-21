/**
 * MOD-001: Detecção de spam via Gemini Flash-Lite (Google AI Studio).
 *
 * Uso: chamado de forma síncrona nas rotas de criação de posts/comentários,
 * logo após a sanitização e antes do INSERT — a resposta do Flash-Lite
 * costuma vir abaixo de 1s, então o impacto de latência é imperceptível.
 *
 * Design "fail-open": qualquer problema (sem API key, timeout, erro de
 * rede, resposta malformada) resulta em `isSpam: false`. Uma dependência
 * externa fora do ar NUNCA pode impedir alguém de publicar.
 *
 * Ativar com:
 *   GEMINI_API_KEY=...           — chave do Google AI Studio (grátis, sem cartão)
 *   SPAM_CHECK_ENABLED=1         — liga a checagem (desligada por padrão)
 *   GEMINI_SPAM_MODEL=...        — opcional, default abaixo
 *
 * O critério de classificação vive no prompt abaixo — ajuste aqui conforme
 * os casos reais de spam que aparecerem no bairro (link externo em excesso,
 * número de WhatsApp solto, texto promocional repetido/colado em vários
 * posts, revenda disfarçada de post de vizinhança, etc.).
 */

const DEFAULT_MODEL = "gemini-flash-lite-latest";
const TIMEOUT_MS = 3000;
const MAX_CONTENT_CHARS = 2000; // suficiente pro limite de 1000 chars de posts

export interface SpamCheckResult {
  isSpam: boolean;
  reason: string | null;
}

const SAFE_RESULT: SpamCheckResult = { isSpam: false, reason: null };

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
 * Classifica um texto como spam ou não usando o Gemini Flash-Lite.
 * Nunca lança exceção — em caso de falha, retorna { isSpam: false }.
 */
export async function checkSpam(content: string): Promise<SpamCheckResult> {
  if (!isSpamCheckEnabled()) return SAFE_RESULT;

  const plainText = content
    .replace(/<[^>]*>/g, " ")
    .replace(/&\w+;/g, " ")
    .trim();

  if (!plainText) return SAFE_RESULT;

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
            { role: "user", parts: [{ text: `${SYSTEM_PROMPT}\n\nTexto:\n"""${truncated}"""` }] },
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

    if (!res.ok) return SAFE_RESULT;

    const data = await res.json();
    const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return SAFE_RESULT;

    const parsed = JSON.parse(text);
    if (typeof parsed?.spam !== "boolean") return SAFE_RESULT;

    return {
      isSpam: parsed.spam,
      reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 300) : null,
    };
  } catch {
    // Timeout, erro de rede, JSON malformado, etc. → fail-open
    return SAFE_RESULT;
  } finally {
    clearTimeout(timeout);
  }
}
