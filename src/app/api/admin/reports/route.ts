import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { safeErrorResponse } from "@/lib/safe-error";
import { isModerator } from "@/lib/report-auth";
import { selectCols } from "@/lib/safe-columns";
import {
  isValidReportStatus,
  isValidReportCategory,
  isValidReportTargetType,
} from "@/lib/report-constants";

// UX-024 / MOD-002: Painel de moderação — GET /api/admin/reports
//
// Acesso restrito a usuários com profiles.is_moderator = true (RLS na
// tabela `reports` já reforça isso no nível do banco — esta checagem
// na API é defense-in-depth e permite retornar um 403 claro em vez de
// uma lista vazia confusa).
//
// MOD-002: além dos metadados da denúncia, busca-se também um preview
// do conteúdo denunciado (texto do post/comentário/mensagem). Sem isso
// o moderador via só "post X foi denunciado por spam" sem NUNCA ver o
// texto — pra mensagens de sala/DM isso é ainda mais crítico, porque
// uma vez soft-deleted pela IA (chat-moderation.ts), o conteúdo já não
// aparece em NENHUMA outra tela do app. Usa admin client de propósito:
// o moderador precisa poder ver o conteúdo mesmo de uma DM da qual não
// participa e mesmo já soft-deleted (RLS normal bloquearia ambos).

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

type TargetContent = {
  content: string | null;
  media_url?: string | null;
  media_type?: string | null;
  is_deleted?: boolean;
} | null;

/**
 * Busca em lote o conteúdo de cada denúncia, agrupando por target_type
 * pra minimizar o número de queries (uma por tabela, não uma por report).
 */
async function attachTargetContent(
  reports: any[]
): Promise<Map<string, TargetContent>> {
  const result = new Map<string, TargetContent>();
  if (reports.length === 0) return result;

  const admin = createAdminClient();

  const idsByType: Record<string, string[]> = {
    post: [],
    comment: [],
    room_message: [],
    dm_message: [],
  };
  for (const r of reports) {
    if (r.target_type in idsByType) idsByType[r.target_type].push(r.target_id);
  }

  if (idsByType.post.length > 0) {
    const { data } = await admin
      .from("posts")
      .select("id, content, image_urls")
      .in("id", idsByType.post);
    for (const row of data || []) {
      result.set(`post:${row.id}`, { content: row.content ?? null });
    }
  }

  if (idsByType.comment.length > 0) {
    const { data } = await admin
      .from("comments")
      .select("id, content")
      .in("id", idsByType.comment);
    for (const row of data || []) {
      result.set(`comment:${row.id}`, { content: row.content ?? null });
    }
  }

  const messageIds = [...idsByType.room_message, ...idsByType.dm_message];
  if (messageIds.length > 0) {
    const { data } = await admin
      .from("messages")
      .select("id, content, media_url, media_type, is_deleted, target_type")
      .in("id", messageIds);
    for (const row of data || []) {
      const key = row.target_type === "room" ? "room_message" : "dm_message";
      result.set(`${key}:${row.id}`, {
        content: row.content ?? null,
        media_url: row.media_url ?? null,
        media_type: row.media_type ?? null,
        is_deleted: row.is_deleted === true,
      });
    }
  }

  return result;
}

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

    const contentMap = await attachTargetContent(reports || []);
    const reportsWithContent = (reports || []).map((r: any) => ({
      ...r,
      target_content: contentMap.get(`${r.target_type}:${r.target_id}`) ?? null,
    }));

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
      reports: reportsWithContent,
      total: count ?? 0,
      counts,
    });
  } catch (error) {
    const { message, status } = safeErrorResponse(error, 500, "[admin/reports GET]");
    return NextResponse.json({ error: message }, { status });
  }
}
