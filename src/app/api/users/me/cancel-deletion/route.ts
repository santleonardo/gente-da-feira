// POST /api/users/me/cancel-deletion
// Cancela solicitação de exclusão de conta durante o período de carência.
//
// REL-006: Operação atômica via rpc_cancel_account_deletion.
// UPDATE account_deletion_requests + UPDATE profiles em transação única.
// A atualização de app_metadata (auth.users) é feita separadamente.

import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { safeErrorResponse } from "@/lib/safe-error";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const blocked = await rateLimitByRule(req, "account:cancel-deletion", user.id);
    if (blocked) return blocked;

    // REL-006: operação atômica no banco — update request + update profile
    const { data, error } = await supabase
      .rpc("rpc_cancel_account_deletion")
      .maybeSingle();

    if (error) throw error;

    if (!data) throw new Error("RPC retornou vazio");
    const result = data as { ok: boolean; error?: string };

    if (!result.ok) {
      switch (result.error) {
        case "not_authenticated":
          return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
        case "no_pending_request":
          return NextResponse.json(
            { error: "Nenhuma solicitação de exclusão pendente" },
            { status: 400 }
          );
        default:
          return NextResponse.json({ error: "Erro ao cancelar solicitação" }, { status: 500 });
      }
    }

    // Atualizar app_metadata do auth user (separado — é Auth API)
    try {
      const admin = createAdminClient();
      const { data: authUser } = await admin.auth.admin.getUserById(user.id);
      const existingMetadata = authUser?.user?.app_metadata || {};

      // Remover apenas campos de deletação, preservando outros metadados
      const { deletion_requested_at: _, deletion_scheduled_at: __, ...cleanMetadata } = existingMetadata as Record<string, unknown>;

      await admin.auth.admin.updateUserById(user.id, {
        app_metadata: cleanMetadata,
      });
    } catch (metaError) {
      console.error("[cancel-deletion] Erro ao atualizar app_metadata:", metaError);
      // Não bloqueia o fluxo — DB já está consistente
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const { message, status } = safeErrorResponse(error, 500, "[cancel-deletion]");
    return NextResponse.json({ error: message }, { status });
  }
}