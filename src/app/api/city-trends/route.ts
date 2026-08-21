import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { safeErrorResponse } from "@/lib/safe-error";

/**
 * GET /api/city-trends
 * Tópicos em alta (janela padrão 24h).
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const blocked = await rateLimitByRule(req, "posts:list", user.id);
    if (blocked) return blocked;

    const limit = Math.min(
      20,
      Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") || "10", 10) || 10)
    );

    const { data, error } = await supabase
      .from("city_trends")
      .select(
        "id, topic, slug, category, mention_count, score, window_hours, computed_at"
      )
      .eq("is_active", true)
      .order("score", { ascending: false })
      .limit(limit);

    if (error) throw error;

    return NextResponse.json({ trends: data || [] });
  } catch (error) {
    const { message, status } = safeErrorResponse(
      error,
      500,
      "[city-trends GET]"
    );
    return NextResponse.json({ error: message }, { status });
  }
}
