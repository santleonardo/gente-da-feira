import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { validateInternalAuth } from "@/lib/internal-auth";
import { safeErrorResponse } from "@/lib/safe-error";
import {
  publishMotivationalPost,
  pickPhrase,
  MAX_MOTIVATIONAL_POSTS_PER_DAY,
  countMotivationalPostsToday,
  resolveMotivationalBotUserId,
} from "@/lib/motivational-bot";

/**
 * GET /api/cron/motivational
 *
 * Publica uma frase motivacional no feed em nome da conta dedicada.
 *
 * Auth: Authorization: Bearer <INTERNAL_API_SECRET> (ou CRON_SECRET)
 *
 * Agendamento sugerido (Supabase pg_cron + pg_net), horário BRT:
 *   - Manhã:   0 11 * * *   → ~08h BRT
 *   - Tarde:   0 18 * * *   → ~15h BRT
 *   - Noite:   0 22 * * *   → ~19h BRT
 *
 * Limite diário: MAX_MOTIVATIONAL_POSTS_PER_DAY (padrão 4).
 */

export async function GET(req: NextRequest) {
  const blocked = validateInternalAuth(req);
  if (blocked) return blocked;

  const startedAt = Date.now();

  try {
    const admin = createAdminClient();

    const botId = await resolveMotivationalBotUserId(admin);
    if (!botId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Conta de motivação não configurada (MOTIVATIONAL_BOT_USER_ID ou profiles.is_motivational_bot)",
        },
        { status: 503 }
      );
    }

    const todayCount = await countMotivationalPostsToday(admin, botId);
    if (todayCount >= MAX_MOTIVATIONAL_POSTS_PER_DAY) {
      return NextResponse.json({
        ok: true,
        posted: 0,
        reason: `limite diário (${MAX_MOTIVATIONAL_POSTS_PER_DAY}) atingido`,
        todayCount,
        durationMs: Date.now() - startedAt,
      });
    }

    // Slot baseado na hora UTC para variar a frase entre execuções do dia
    const hour = new Date().getUTCHours();
    const slot = Math.floor(hour / 6); // 0–3 ao longo do dia
    const phrase = pickPhrase(slot);
    const externalId = `motiv-${new Date().toISOString().slice(0, 10)}-s${slot}`;

    const published = await publishMotivationalPost(admin, phrase, externalId);

    return NextResponse.json({
      ok: published.ok,
      posted: published.ok ? 1 : 0,
      postId: published.ok ? published.postId : undefined,
      reason: published.ok ? undefined : published.reason,
      phrase: published.ok ? phrase : undefined,
      todayCount: published.ok ? todayCount + 1 : todayCount,
      durationMs: Date.now() - startedAt,
    });
  } catch (error: unknown) {
    const { message, status } = safeErrorResponse(
      error,
      500,
      "[cron/motivational]"
    );
    return NextResponse.json({ error: message }, { status });
  }
}
