/**
 * Feedback implícito para re-treino offline do ranker.
 * Body: { postId, event: "impression" | "open" | "react" | "comment", dwellMs? }
 *
 * Se a tabela ranking_events existir, grava; senão responde 202 sem erro
 * (app continua funcionando sem migration).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { RANKING_MODEL_VERSION } from "@/lib/ranking";

const EVENTS = new Set(["impression", "open", "react", "comment"]);

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const blocked = await rateLimitByRule(req, "ranking:feedback", user?.id);
    if (blocked) return blocked;

    const body = await req.json().catch(() => ({}));
    const postId = typeof body.postId === "string" ? body.postId.slice(0, 64) : "";
    const event = typeof body.event === "string" ? body.event : "";
    const dwellMs =
      typeof body.dwellMs === "number" && body.dwellMs >= 0
        ? Math.min(body.dwellMs, 600_000)
        : null;

    if (!postId || !EVENTS.has(event)) {
      return NextResponse.json(
        { error: "postId e event (impression|open|react|comment) são obrigatórios" },
        { status: 400 }
      );
    }

    const row = {
      post_id: postId,
      user_id: user?.id ?? null,
      event,
      dwell_ms: dwellMs,
      model_version: RANKING_MODEL_VERSION,
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("ranking_events").insert(row);

    if (error) {
      // Tabela ausente ou RLS — não quebra o cliente
      if (
        error.code === "42P01" ||
        error.code === "42501" ||
        /ranking_events|does not exist|permission/i.test(error.message || "")
      ) {
        return NextResponse.json(
          {
            ok: true,
            stored: false,
            reason: "ranking_events unavailable",
            model: RANKING_MODEL_VERSION,
          },
          { status: 202 }
        );
      }
      console.warn("[ranking/feedback]", error.message);
      return NextResponse.json(
        { ok: true, stored: false, reason: "insert_failed" },
        { status: 202 }
      );
    }

    return NextResponse.json({ ok: true, stored: true, model: RANKING_MODEL_VERSION });
  } catch (e: any) {
    console.warn("[ranking/feedback]", e?.message);
    return NextResponse.json({ ok: true, stored: false }, { status: 202 });
  }
}
