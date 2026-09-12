import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { safeErrorResponse } from "@/lib/safe-error";

const MAX_ACTIVE_BANNERS = 10;

/**
 * GET /api/banners — até 10 avisos ativos.
 * Rota pública no middleware: sem sessão não devolve 401 (lista vazia ou
 * leitura anônima se a RLS permitir).
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const blocked = await rateLimitByRule(req, "notifications:list", user.id);
      if (blocked) return blocked;
    }

    const { data: banners, error } = await supabase
      .from("app_banners")
      .select("id, message, created_at")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(MAX_ACTIVE_BANNERS);

    if (error) {
      console.warn("[banners GET]", error.message);
      return NextResponse.json({ banners: [], banner: null });
    }

    const list = banners || [];
    return NextResponse.json({
      banners: list,
      banner: list[0] || null,
    });
  } catch (error) {
    console.warn("[banners GET]", (error as Error)?.message || error);
    return NextResponse.json({ banners: [], banner: null });
  }
}
