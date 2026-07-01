// POST /api/users/me/request-deletion
// Solicita exclusão de conta (LGPD) — inicia período de carência de 7 dias.
//
// REL-006: Operação atômica via rpc_request_account_deletion.
// INSERT account_deletion_requests + UPDATE profiles em transação única.
// A atualização de app_metadata (auth.users) é feita separadamente pois
// é uma operação da Auth API, não do banco de dados.

import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { safeErrorResponse } from "@/lib/safe-error";

const GRACE_PERIOD_DAYS = 7;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const blocked = await rateLimitByRule(req, "account:request-deletion", user.id);
    if (blocked) return blocked;

    // REL-006: operação atômica no banco — insert request + update profile
    const { data, error } = await supabase
      .rpc("rpc_request_account_deletion", { p_grace_period_days: GRACE_PERIOD_DAYS })
      .maybeSingle();

    if (error) throw error;

    if (!data) throw new Error("RPC retornou vazio");
    const result = data as { ok: boolean; error?: string; deletion_scheduled_at?: string; grace_period_days?: number };

    if (!result.ok) {
      switch (result.error) {
        case "not_authenticated":
          return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
        case "already_requested":
          return NextResponse.json(
            { error: "Solicitação de exclusão já existe. Use cancel-deletion para cancelar." },
            { status: 400 }
          );
        default:
          return NextResponse.json({ error: "Erro ao registrar solicitação" }, { status: 500 });
      }
    }

    // Atualizar app_metadata do auth user (separado da transação DB — é Auth API)
    try {
      const admin = createAdminClient();
      const requestedAt = new Date().toISOString();
      const { data: authUser } = await admin.auth.admin.getUserById(user.id);
      const existingMetadata = authUser?.user?.app_metadata || {};

      await admin.auth.admin.updateUserById(user.id, {
        app_metadata: {
          ...existingMetadata,
          deletion_requested_at: requestedAt,
          deletion_scheduled_at: result.deletion_scheduled_at,
        },
      });
    } catch (metaError) {
      console.error("[request-deletion] Erro ao atualizar app_metadata:", metaError);
      // Não bloqueia o fluxo — DB já está consistente
    }

    return NextResponse.json({
      success: true,
      deletionScheduledAt: result.deletion_scheduled_at,
      gracePeriodDays: result.grace_period_days,
    });
  } catch (error) {
    const { message, status } = safeErrorResponse(error, 500, "[request-deletion]");
    return NextResponse.json({ error: message }, { status });
  }
}