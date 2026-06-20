// POST /api/users/me/cancel-deletion
// Cancela solicitação de exclusão de conta durante o período de carência.
//
// Fluxo:
//   1. Verifica autenticação
//   2. Rate limit
//   3. Verifica se existe solicitação ativa (deletion_requested_at)
//   4. Cancela o registro em account_deletion_requests
//   5. Limpa campos do perfil
//   6. Limpa app_metadata do auth user

import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { safeErrorResponse } from "@/lib/safe-error";

export async function POST(req: NextRequest) {
  try {
    // ── 1. Autenticação ─────────────────────────────────────────────────
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    // ── 2. Rate limit ───────────────────────────────────────────────────
    const blocked = await rateLimitByRule(req, "account:cancel-deletion", user.id);
    if (blocked) return blocked;

    // ── 3. Verificar se existe solicitação ativa ───────────────────────
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, deletion_requested_at")
      .eq("id", user.id)
      .single();

    if (!profile?.deletion_requested_at) {
      return NextResponse.json(
        { error: "Nenhuma solicitação de exclusão pendente" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // ── 4. Cancelar registro em account_deletion_requests ────────────────
    const { error: cancelError } = await admin
      .from("account_deletion_requests")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("status", "pending");

    if (cancelError) {
      console.error("[cancel-deletion] Erro ao cancelar account_deletion_requests:", cancelError.message);
      return NextResponse.json({ error: "Erro ao cancelar solicitação" }, { status: 500 });
    }

    // ── 5. Limpar campos do perfil ─────────────────────────────────────
    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        deletion_requested_at: null,
        deletion_scheduled_at: null,
      })
      .eq("id", user.id);

    if (profileError) {
      console.error("[cancel-deletion] Erro ao atualizar perfil:", profileError.message);
      return NextResponse.json({ error: "Erro ao atualizar perfil" }, { status: 500 });
    }

    // ── 6. Limpar app_metadata do auth user ────────────────────────────
    try {
      const { data: authUser } = await admin.auth.admin.getUserById(user.id);
      const existingMetadata = authUser?.user?.app_metadata || {};

      // Remover apenas campos de deletação, preservando outros metadados
      const { deletion_requested_at: _, deletion_scheduled_at: __, ...cleanMetadata } = existingMetadata as Record<string, unknown>;

      await admin.auth.admin.updateUserById(user.id, {
        app_metadata: cleanMetadata,
      });
    } catch (metaError) {
      console.error("[cancel-deletion] Erro ao atualizar app_metadata:", metaError);
      // Não bloqueia o fluxo — perfil já foi atualizado
    }

    // ── 7. Retornar sucesso ────────────────────────────────────────────
    return NextResponse.json({ success: true });
  } catch (error) {
    const { message, status } = safeErrorResponse(error, 500, "[cancel-deletion]");
    return NextResponse.json({ error: message }, { status });
  }
}
