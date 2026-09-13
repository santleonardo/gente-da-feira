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
 * Agendamento sugerido (Supabase pg_cron + pg_net):
 *   "0 * * * *"  → a cada hora (minuto 0 UTC)
 *
 * Limite diário: MAX_MOTIVATIONAL_POSTS_PER_DAY (padrão 24 = 1/hora).
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

    // 1 frase por hora UTC — evita duplicata na mesma hora
    const hour = new Date().getUTCHours();
    const phrase = pickPhrase(hour);
    const externalId = `motiv-${new Date().toISOString().slice(0, 10)}-h${String(hour).padStart(2, "0")}`;

    const published = await publishMotivationalPost(admin, phrase, externalId);

    return NextResponse.json({
      ok: published.ok,
      posted: published.ok ? 1 : 0,
      postId: published.ok ? published.postId : undefined,
      reason: published.ok ? undefined : published.reason,
      phrase: published.ok ? phrase : undefined,
      hourUtc: hour,
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
