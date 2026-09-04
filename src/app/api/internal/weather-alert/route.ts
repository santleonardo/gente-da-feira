import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { validateInternalAuth } from "@/lib/internal-auth";
import { safeErrorResponse } from "@/lib/safe-error";
import { publishWeatherPost } from "@/lib/weather-bot";

/**
 * POST /api/internal/weather-alert
 *
 * Webhook para alertas de clima / tempo em Feira de Santana.
 * Auth: Authorization: Bearer <INTERNAL_API_SECRET>
 *
 * Body:
 * {
 *   "severity": "info" | "watch" | "warning" | "emergency",
 *   "title": string,
 *   "body"?: string,
 *   "source"?: string,
 *   "url"?: string,
 *   "external_id"?: string,
 *   "valid_until"?: string,
 *   "neighborhoods"?: string[],
 *   "force_post"?: boolean   // para severity=info
 * }
 */

const SEVERITY_EMOJI: Record<string, string> = {
  info: "🌤️",
  watch: "👀",
  warning: "⚠️",
  emergency: "🚨",
};

const SEVERITY_LABEL: Record<string, string> = {
  info: "Informação",
  watch: "Atenção",
  warning: "Alerta",
  emergency: "Emergência",
};

const VALID_SEVERITIES = new Set(["info", "watch", "warning", "emergency"]);

function buildAlertContent(opts: {
  severity: string;
  title: string;
  body?: string | null;
  source?: string | null;
  url?: string | null;
  neighborhoods?: string[] | null;
  validUntil?: string | null;
}): string {
  const emoji = SEVERITY_EMOJI[opts.severity] || "⚠️";
  const label = SEVERITY_LABEL[opts.severity] || "Alerta";
  const title = (opts.title || "").trim().slice(0, 120);
  const body = (opts.body || "").trim().slice(0, 400);
  const source = (opts.source || "Fonte oficial").trim().slice(0, 80);
  const url = (opts.url || "").trim();

  const lines: string[] = [`${emoji} ${label}: ${title}`, ""];

  if (body) {
    lines.push(body);
    lines.push("");
  }

  if (opts.neighborhoods && opts.neighborhoods.length > 0) {
    const bairros = opts.neighborhoods
      .map((n) => n.trim())
      .filter(Boolean)
      .slice(0, 8)
      .join(", ");
    if (bairros) {
      lines.push(`📍 Bairros: ${bairros}`);
      lines.push("");
    }
  }

  if (opts.validUntil) {
    try {
      const d = new Date(opts.validUntil);
      if (!Number.isNaN(d.getTime())) {
        lines.push(
          `Válido até: ${d.toLocaleString("pt-BR", { timeZone: "America/Bahia" })}`
        );
        lines.push("");
      }
    } catch {
      // ignora
    }
  }

  if (url && /^https?:\/\//i.test(url)) {
    lines.push(`Fonte: ${source} · ${url}`);
  } else {
    lines.push(`Fonte: ${source}`);
  }

  return lines.join("\n").slice(0, 1000);
}

export async function POST(req: NextRequest) {
  const authError = validateInternalAuth(req);
  if (authError) return authError;

  try {
    const body = await req.json().catch(() => ({}));

    const severity =
      typeof body.severity === "string"
        ? body.severity.toLowerCase().trim()
        : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";

    if (!VALID_SEVERITIES.has(severity)) {
      return NextResponse.json(
        {
          error:
            "severity inválido. Use: info | watch | warning | emergency",
        },
        { status: 400 }
      );
    }

    if (!title || title.length < 5) {
      return NextResponse.json(
        { error: "title é obrigatório (mín. 5 caracteres)" },
        { status: 400 }
      );
    }

    const shouldPost = severity !== "info" || body.force_post === true;

    if (!shouldPost) {
      return NextResponse.json({
        ok: true,
        posted: false,
        reason: "severity=info sem force_post — não publicado no feed",
      });
    }

    const admin = createAdminClient();

    const content = buildAlertContent({
      severity,
      title,
      body: typeof body.body === "string" ? body.body : null,
      source: typeof body.source === "string" ? body.source : null,
      url: typeof body.url === "string" ? body.url : null,
      neighborhoods: Array.isArray(body.neighborhoods)
        ? body.neighborhoods.filter((n: unknown) => typeof n === "string")
        : null,
      validUntil:
        typeof body.valid_until === "string" ? body.valid_until : null,
    });

    const result = await publishWeatherPost(
      admin,
      content,
      typeof body.external_id === "string" ? body.external_id : null
    );

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          posted: false,
          reason: result.reason,
        },
        { status: result.reason.includes("limite") ? 429 : 200 }
      );
    }

    console.log(
      `[weather-alert] publicado post=${result.postId} severity=${severity} title="${title.slice(0, 60)}"`
    );

    return NextResponse.json({
      ok: true,
      posted: true,
      postId: result.postId,
      severity,
    });
  } catch (error: unknown) {
    const { message, status } = safeErrorResponse(
      error,
      500,
      "[weather-alert]"
    );
    return NextResponse.json({ error: message }, { status });
  }
}
