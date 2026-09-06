import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { safeErrorResponse } from "@/lib/safe-error";
import { sanitizePlainText } from "@/lib/sanitize";
import { TEXT_LIMITS } from "@/lib/text-validation";

/**
 * POST /api/ai/rewrite
 * Reescreve rascunho do composer (Gemini). Só texto — não publica.
 *
 * Body: { text: string, mode: "improve" | "clarify" | "bairro" | "fix" }
 * Requer: autenticação + GEMINI_API_KEY
 */

const MODES = ["improve", "clarify", "bairro", "fix"] as const;
type RewriteMode = (typeof MODES)[number];

const MODE_PROMPTS: Record<RewriteMode, string> = {
  improve: `Reescreva o texto abaixo para ficar mais natural, fluido e agradável de ler.
Mantenha o mesmo significado, fatos e intenções. Não invente informações.
Pode melhorar ritmo e vocabulário, sem ficar formal demais.
Responda APENAS com o texto reescrito, sem aspas, sem explicações.`,

  clarify: `Reescreva o texto abaixo deixando a mensagem mais clara e direta.
Frases mais curtas se necessário. Mantenha o tom do autor e os fatos.
Não adicione conteúdo novo. Responda APENAS com o texto reescrito.`,

  bairro: `Reescreva o texto abaixo com tom de vizinho de bairro em Feira de Santana (Brasil):
acolhedor, simples e humano — como um post de comunidade local.
Evite linguagem corporativa ou de marketing. Mantenha fatos e intenções.
Responda APENAS com o texto reescrito, sem aspas nem explicações.`,

  fix: `Corrija apenas ortografia, acentuação e pontuação do texto abaixo.
Não mude o sentido, o tom nem a estrutura além do necessário.
Preserve gírias e marcas de oralidade quando fizerem sentido.
Responda APENAS com o texto corrigido.`,
};

const DEFAULT_MODEL = "gemini-flash-lite-latest";
const TIMEOUT_MS = 12000;
const MAX_INPUT = TEXT_LIMITS.post;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const blocked = await rateLimitByRule(req, "ai:rewrite", user.id);
    if (blocked) return blocked;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "Reescrita por IA não configurada (defina GEMINI_API_KEY no servidor).",
          code: "AI_NOT_CONFIGURED",
        },
        { status: 503 }
      );
    }

    let body: { text?: unknown; mode?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }

    const mode = body.mode as RewriteMode;
    if (!MODES.includes(mode)) {
      return NextResponse.json(
        { error: "Modo inválido. Use: improve, clarify, bairro, fix" },
        { status: 400 }
      );
    }

    const raw =
      typeof body.text === "string" ? body.text.replace(/\u0000/g, "") : "";
    const plain = sanitizePlainText(raw).trim();
    if (!plain) {
      return NextResponse.json(
        { error: "Escreva algo antes de pedir a reescrita" },
        { status: 400 }
      );
    }
    if (plain.length > MAX_INPUT) {
      return NextResponse.json(
        { error: `Texto muito longo (máx ${MAX_INPUT} caracteres)` },
        { status: 400 }
      );
    }

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
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: `${MODE_PROMPTS[mode]}\n\nTexto:\n"""${plain}"""`,
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: mode === "fix" ? 0.1 : 0.4,
              maxOutputTokens: 800,
            },
          }),
          signal: controller.signal,
        }
      );

      if (!res.ok) {
        console.warn("[ai/rewrite] Gemini HTTP", res.status);
        return NextResponse.json(
          { error: "IA temporariamente indisponível. Tente de novo." },
          { status: 503 }
        );
      }

      const data = await res.json();
      let out: string =
        data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

      // Remove aspas envolventes comuns
      if (
        (out.startsWith('"') && out.endsWith('"')) ||
        (out.startsWith("“") && out.endsWith("”"))
      ) {
        out = out.slice(1, -1).trim();
      }

      out = sanitizePlainText(out).trim().slice(0, MAX_INPUT);
      if (!out) {
        return NextResponse.json(
          { error: "A IA não devolveu texto útil. Tente de novo." },
          { status: 502 }
        );
      }

      return NextResponse.json({ text: out, mode });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    const { message, status } = safeErrorResponse(error, 500, "[ai/rewrite]");
    return NextResponse.json({ error: message }, { status });
  }
}
