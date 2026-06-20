// POST /api/users/me/request-deletion
// Solicita exclusão de conta (LGPD) — inicia período de carência de 7 dias.
//
// Fluxo:
//   1. Verifica autenticação
//   2. Rate limit
//   3. Verifica se já existe solicitação ativa
//   4. Cria registro em account_deletion_requests
//   5. Atualiza perfil com deletion_requested_at / deletion_scheduled_at
//   6. Atualiza app_metadata do auth user
//   7. Retorna dados da exclusão agendada (frontend faz sign-out em seguida)

import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { safeErrorResponse } from "@/lib/safe-error";

const GRACE_PERIOD_DAYS = 7;

export async function POST(req: NextRequest) {
  try {
    // ── 1. Autenticação ─────────────────────────────────────────────────
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    // ── 2. Rate limit ───────────────────────────────────────────────────
    const blocked = await rateLimitByRule(req, "account:request-deletion", user.id);
    if (blocked) return blocked;

    // ── 3. Verificar se já existe solicitação ativa ────────────────────
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, deletion_requested_at, deletion_scheduled_at")
      .eq("id", user.id)
      .single();

    if (profile?.deletion_requested_at) {
      return NextResponse.json(
        { error: "Solicitação de exclusão já existe. Use cancel-deletion para cancelar." },
        { status: 400 }
      );
    }

    // ── 4. Calcular data de exclusão (7 dias) ──────────────────────────
    const now = new Date();
    const deletionScheduledAt = new Date(
      now.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000
    );
    const requestedAt = now.toISOString();
    const scheduledAt = deletionScheduledAt.toISOString();

    const admin = createAdminClient();

    // ── 5. Inserir em account_deletion_requests ─────────────────────────
    const { error: insertError } = await admin
      .from("account_deletion_requests")
      .insert({
        user_id: user.id,
        status: "pending",
        grace_period_days: GRACE_PERIOD_DAYS,
        deletion_scheduled_at: scheduledAt,
        requested_at: requestedAt,
      });

    if (insertError) {
      console.error("[request-deletion] Erro ao inserir account_deletion_requests:", insertError.message);
      return NextResponse.json({ error: "Erro ao registrar solicitação" }, { status: 500 });
    }

    // ── 6. Atualizar perfil ────────────────────────────────────────────
    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        deletion_requested_at: requestedAt,
        deletion_scheduled_at: scheduledAt,
      })
      .eq("id", user.id);

    if (profileError) {
      console.error("[request-deletion] Erro ao atualizar perfil:", profileError.message);
      return NextResponse.json({ error: "Erro ao atualizar perfil" }, { status: 500 });
    }

    // ── 7. Atualizar app_metadata do auth user ────────────────────────
    try {
      const { data: authUser } = await admin.auth.admin.getUserById(user.id);
      const existingMetadata = authUser?.user?.app_metadata || {};

      await admin.auth.admin.updateUserById(user.id, {
        app_metadata: {
          ...existingMetadata,
          deletion_requested_at: requestedAt,
          deletion_scheduled_at: scheduledAt,
        },
      });
    } catch (metaError) {
      console.error("[request-deletion] Erro ao atualizar app_metadata:", metaError);
      // Não bloqueia o fluxo — perfil já foi atualizado
    }

    // ── 8. Retornar sucesso ───────────────────────────────────────────
    return NextResponse.json({
      success: true,
      deletionScheduledAt: scheduledAt,
      gracePeriodDays: GRACE_PERIOD_DAYS,
    });
  } catch (error) {
    const { message, status } = safeErrorResponse(error, 500, "[request-deletion]");
    return NextResponse.json({ error: message }, { status });
  }
}
