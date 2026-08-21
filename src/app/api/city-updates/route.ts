import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { safeErrorResponse } from "@/lib/safe-error";
import { isCityCategory } from "@/lib/city-monitoring";

/**
 * GET /api/city-updates
 * Lista cards publicados "Na cidade".
 *
 * Query: category, limit (max 30), cursor (published_at ISO)
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

    const category = req.nextUrl.searchParams.get("category") || "";
    const cursor = req.nextUrl.searchParams.get("cursor");
    const rawLimit = parseInt(req.nextUrl.searchParams.get("limit") || "15", 10);
    const limit = Math.min(Math.max(1, rawLimit || 15), 30);

    let query = supabase
      .from("city_updates")
      .select(
        "id, title, summary, url, category, platform, image_url, neighborhood, relevance_score, published_at, source_published_at, source_id, meta"
      )
      .eq("is_published", true)
      .order("published_at", { ascending: false })
      .limit(limit + 1);

    if (category && isCityCategory(category)) {
      query = query.eq("category", category);
    }
    if (cursor) {
      query = query.lt("published_at", cursor);
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows = data || [];
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasMore && items.length > 0
        ? items[items.length - 1].published_at
        : null;

    return NextResponse.json({
      updates: items,
      nextCursor,
      hasMore,
    });
  } catch (error) {
    const { message, status } = safeErrorResponse(
      error,
      500,
      "[city-updates GET]"
    );
    return NextResponse.json({ error: message }, { status });
  }
}
