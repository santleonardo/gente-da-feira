import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { idempotencyGate, idempotencyStore, idempotencyFail } from "@/lib/idempotency";
import { safeErrorResponse } from "@/lib/safe-error";
import { sanitizePlainText } from "@/lib/sanitize";
import { resolveReportTarget } from "@/lib/report-auth";
import {
  isValidReportTargetType,
  isValidReportCategory,
  MAX_REPORT_DESCRIPTION_LENGTH,
} from "@/lib/report-constants";

// UX-024: Sistema de denúncias — elimina a divergência entre os Termos de
// Uso (Seção 9) e a implementação real da plataforma.
//
// Segurança:
//   - Autenticação obrigatória (401 caso contrário)
//   - Validação de existência do alvo (via resolveReportTarget, que
//     também confirma que o denunciante tem acesso ao recurso)
//   - Bloqueio de autodenúncia (própria constraint no banco + checagem aqui)
//   - Anti-duplicidade: unique index parcial no banco
//     (reporter_id, target_type, target_id) WHERE status IN (pending, reviewing)
//   - Rate limiting: 15 denúncias/hora por usuário

const REPORT_COLUMNS =
  "id, target_type, target_id, category, description, status, created_at, resolved_at";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const blocked = await rateLimitByRule(req, "reports:create", user.id);
    if (blocked) return blocked;

    const idemBlock = await idempotencyGate(req, user.id);
    if (idemBlock) return idemBlock;

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }

    const { targetType, targetId, category, description } = body ?? {};

    if (!isValidReportTargetType(targetType)) {
      return NextResponse.json({ error: "Tipo de alvo inválido" }, { status: 400 });
    }
    if (typeof targetId !== "string" || !targetId.trim()) {
      return NextResponse.json({ error: "targetId é obrigatório" }, { status: 400 });
    }
    if (!isValidReportCategory(category)) {
      return NextResponse.json({ error: "Categoria de denúncia inválida" }, { status: 400 });
    }

    let cleanDescription: string | null = null;
    if (description !== undefined && description !== null) {
      if (typeof description !== "string") {
        return NextResponse.json({ error: "Descrição inválida" }, { status: 400 });
      }
      cleanDescription = sanitizePlainText(description.trim()).slice(0, MAX_REPORT_DESCRIPTION_LENGTH);
      if (!cleanDescription) cleanDescription = null;
    }

    // Valida que o alvo existe e que o denunciante pode acessá-lo
    // (participante da DM, membro da sala, etc.)
    const resolution = await resolveReportTarget(supabase, user.id, targetType, targetId);
    if (!resolution.allowed) {
      return NextResponse.json({ error: "Conteúdo não encontrado" }, { status: 404 });
    }

    // Bloqueio de autodenúncia
    if (resolution.ownerId && resolution.ownerId === user.id) {
      return NextResponse.json(
        { error: "Você não pode denunciar seu próprio conteúdo" },
        { status: 400 }
      );
    }

    const { data: report, error } = await supabase
      .from("reports")
      .insert({
        reporter_id: user.id,
        target_type: targetType,
        target_id: targetId,
        target_owner_id: resolution.ownerId ?? null,
        category,
        description: cleanDescription,
      })
      .select(REPORT_COLUMNS)
      .single();

    if (error) {
      // Unique violation → já existe denúncia ativa deste usuário para este alvo
      if (error.code === "23505") {
        return NextResponse.json(
          {
            error:
              "Você já denunciou este conteúdo. Nossa equipe já está analisando — não é necessário denunciar novamente.",
          },
          { status: 409 }
        );
      }
      // Constraint de autodenúncia (defense-in-depth, caso a checagem acima falhe)
      if (error.code === "23514") {
        return NextResponse.json(
          { error: "Você não pode denunciar seu próprio conteúdo" },
          { status: 400 }
        );
      }
      throw error;
    }

    const responseData = { report };
    await idempotencyStore(req, responseData);
    return NextResponse.json(responseData, { status: 201 });
  } catch (error) {
    await idempotencyFail(req);
    const { message, status } = safeErrorResponse(error, 500, "[reports POST]");
    return NextResponse.json({ error: message }, { status });
  }
}

// GET /api/reports — lista as denúncias feitas pelo PRÓPRIO usuário.
// (Painel de moderação completo vive em /api/admin/reports.)
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const blocked = await rateLimitByRule(req, "reports:list", user.id);
    if (blocked) return blocked;

    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);

    const { data: reports, error } = await supabase
      .from("reports")
      .select(REPORT_COLUMNS)
      .eq("reporter_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    return NextResponse.json({ reports: reports || [] });
  } catch (error) {
    const { message, status } = safeErrorResponse(error, 500, "[reports GET]");
    return NextResponse.json({ error: message }, { status });
  }
}
