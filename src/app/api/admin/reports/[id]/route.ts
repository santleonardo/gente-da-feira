import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { idempotencyGate, idempotencyStore, idempotencyFail } from "@/lib/idempotency";
import { safeErrorResponse } from "@/lib/safe-error";
import { sanitizePlainText } from "@/lib/sanitize";
import { isModerator } from "@/lib/report-auth";
import { isValidReportStatus } from "@/lib/report-constants";

// UX-024: PATCH /api/admin/reports/[id] — moderadores atualizam status
// e registram observações internas. A RLS de `reports` já exige
// is_moderator = true para qualquer UPDATE; esta checagem na API
// permite uma mensagem de erro clara em vez de um update silenciosamente
// bloqueado pelo banco.

const MAX_NOTES_LENGTH = 2000;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const blocked = await rateLimitByRule(req, "admin:reports:update", user.id);
    if (blocked) return blocked;

    if (!(await isModerator(supabase, user.id))) {
      return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
    }

    const idemBlock = await idempotencyGate(req, user.id);
    if (idemBlock) return idemBlock;

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }

    const { status, moderatorNotes } = body ?? {};
    const updates: Record<string, any> = { moderator_id: user.id };

    if (status !== undefined) {
      if (!isValidReportStatus(status)) {
        return NextResponse.json({ error: "Status inválido" }, { status: 400 });
      }
      updates.status = status;
    }

    if (moderatorNotes !== undefined) {
      if (typeof moderatorNotes !== "string") {
        return NextResponse.json({ error: "Observações inválidas" }, { status: 400 });
      }
      updates.moderator_notes = sanitizePlainText(moderatorNotes.trim()).slice(0, MAX_NOTES_LENGTH) || null;
    }

    if (Object.keys(updates).length === 1) {
      // Só tinha moderator_id — nada para atualizar de fato
      return NextResponse.json({ error: "Nenhuma alteração fornecida" }, { status: 400 });
    }

    const { data: report, error } = await supabase
      .from("reports")
      .update(updates)
      .eq("id", id)
      .select("id, status, moderator_notes, updated_at, resolved_at")
      .maybeSingle();

    if (error) throw error;
    if (!report) {
      return NextResponse.json({ error: "Denúncia não encontrada" }, { status: 404 });
    }

    const responseData = { report };
    await idempotencyStore(req, responseData);
    return NextResponse.json(responseData);
  } catch (error) {
    await idempotencyFail(req);
    const { message, status } = safeErrorResponse(error, 500, "[admin/reports PATCH]");
    return NextResponse.json({ error: message }, { status });
  }
}
