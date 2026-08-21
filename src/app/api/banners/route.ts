import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { safeErrorResponse } from "@/lib/safe-error";

/**
 * GET /api/banners
 * Retorna o banner ativo mais recente para o app.
 * Qualquer usuário autenticado pode ler.
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

    const { data: banner, error } = await supabase
      .from("app_banners")
      .select("id, message, created_at")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    return NextResponse.json({ banner: banner || null });
  } catch (error) {
    const { message, status } = safeErrorResponse(error, 500, "[banners GET]");
    return NextResponse.json({ error: message }, { status });
  }
}
