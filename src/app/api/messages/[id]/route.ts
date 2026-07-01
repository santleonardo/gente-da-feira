// REL-006: Exclusão de mídia de mensagem atômica via rpc_delete_message_media.
// Verifica ownership, atualiza/deleta mensagem em transação única.
// Retorna URL de mídia para limpeza de storage (best effort).

import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { rateLimitByRule } from "@/lib/apply-rate-limit";
import { safeErrorResponse } from "@/lib/safe-error";
import { extractStoragePathFromUrl } from "@/lib/storage-security";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const blocked = await rateLimitByRule(req, "dm:message:delete", user?.id);
    if (blocked) return blocked;

    // REL-006: operação atômica no banco
    const { data, error } = await supabase
      .rpc("rpc_delete_message_media", { p_message_id: id })
      .maybeSingle();

    if (error) throw error;

    if (!data) throw new Error("RPC retornou vazio");
    const result = data as { ok: boolean; error?: string; media_url?: string; message_deleted?: boolean };

    if (!result.ok) {
      switch (result.error) {
        case "not_authenticated":
          return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
        case "message_not_found":
          return NextResponse.json({ error: "Mensagem não encontrada" }, { status: 404 });
        case "not_owner":
          return NextResponse.json({ error: "Sem permissão para apagar esta mídia" }, { status: 403 });
        case "already_deleted":
          return NextResponse.json({ error: "Mensagem já foi apagada" }, { status: 400 });
        case "no_media":
          return NextResponse.json({ error: "Esta mensagem não possui mídia" }, { status: 400 });
        default:
          return NextResponse.json({ error: "Não foi possível apagar a mídia" }, { status: 400 });
      }
    }

    // Limpeza de storage (best effort) — após DB em estado consistente
    if (result.media_url) {
      const admin = createAdminClient();
      (async () => {
        try {
          const parsed = extractStoragePathFromUrl(result.media_url!);
          if (parsed) {
            await admin.storage.from(parsed.bucket).remove([parsed.path]);
          }
        } catch { /* silent — best effort */ }
      })();
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const { message, status } = safeErrorResponse(error, 500, "[delete-message-media]");
    return NextResponse.json({ error: message }, { status });
  }
}