import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { safeErrorResponse } from "@/lib/safe-error";
import { isModerator } from "@/lib/report-auth";
import { selectCols } from "@/lib/safe-columns";
import {
  isValidReportStatus,
  isValidReportCategory,
  isValidReportTargetType,
} from "@/lib/report-constants";

// UX-024: Painel de moderação — GET /api/admin/reports
//
// Acesso restrito a usuários com profiles.is_moderator = true (RLS na
// tabela `reports` já reforça isso no nível do banco — esta checagem
// na API é defense-in-depth e permite retornar um 403 claro em vez de
// uma lista vazia confusa).

const REPORTER_COLS = selectCols(["id", "display_name", "username", "avatar_url"] as const);
const OWNER_COLS = selectCols(["id", "display_name", "username", "avatar_url"] as const);
const MODERATOR_COLS = selectCols(["id", "display_name", "username"] as const);

const ADMIN_REPORT_COLUMNS = `
  id, target_type, target_id, category, description, status,
  moderator_notes, created_at, updated_at, resolved_at,
  reporter:profiles!reports_reporter_id_fkey(${REPORTER_COLS}),
  target_owner:profiles!reports_target_owner_id_fkey(${OWNER_COLS}),
  moderator:profiles!reports_moderator_id_fkey(${MODERATOR_COLS})
`;

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const blocked = await rateLimitByRule(req, "admin:reports:list", user.id);
    if (blocked) return blocked;

    if (!(await isModerator(supabase, user.id))) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const category = searchParams.get("category");
    const targetType = searchParams.get("targetType");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
    const offset = Math.max(parseInt(searchParams.get("offset") || "0"), 0);

    let query = supabase
      .from("reports")
      .select(ADMIN_REPORT_COLUMNS, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      if (!isValidReportStatus(status)) {
        return NextResponse.json({ error: "Status inválido" }, { status: 400 });
      }
      query = query.eq("status", status);
    }
    if (category) {
      if (!isValidReportCategory(category)) {
        return NextResponse.json({ error: "Categoria inválida" }, { status: 400 });
      }
      query = query.eq("category", category);
    }
    if (targetType) {
      if (!isValidReportTargetType(targetType)) {
        return NextResponse.json({ error: "Tipo de alvo inválido" }, { status: 400 });
      }
      query = query.eq("target_type", targetType);
    }
    if (dateFrom) query = query.gte("created_at", dateFrom);
    if (dateTo) query = query.lte("created_at", dateTo);

    const { data: reports, error, count } = await query;
    if (error) throw error;

    // Contagem rápida por status, para os badges do painel (sempre sobre
    // o total geral, não sobre a página filtrada atual)
    const { data: statusCounts } = await supabase
      .from("reports")
      .select("status");

    const counts: Record<string, number> = { pending: 0, reviewing: 0, resolved: 0, dismissed: 0 };
    for (const row of statusCounts || []) {
      const s = (row as any).status as string;
      if (s in counts) counts[s]++;
    }

    return NextResponse.json({
      reports: reports || [],
      total: count ?? 0,
      counts,
    });
  } catch (error) {
    const { message, status } = safeErrorResponse(error, 500, "[admin/reports GET]");
    return NextResponse.json({ error: message }, { status });
  }
}
