import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { safeErrorResponse } from "@/lib/safe-error";

const MAX_ACTIVE_BANNERS = 10;

/**
 * GET /api/banners — até 10 avisos ativos. Criar um novo NÃO remove os antigos.
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

    const blocked = await rateLimitByRule(req, "notifications:list", user.id);
    if (blocked) return blocked;

    const { data: banners, error } = await supabase
      .from("app_banners")
      .select("id, message, created_at")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(MAX_ACTIVE_BANNERS);

    if (error) throw error;

    const list = banners || [];
    return NextResponse.json({
      banners: list,
      banner: list[0] || null,
    });
  } catch (error) {
    const { message, status } = safeErrorResponse(error, 500, "[banners GET]");
    return NextResponse.json({ error: message }, { status });
  }
}
