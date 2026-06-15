// ============================================================
// API para apagar mídia de uma mensagem (DM ou sala)
//
// O usuário pode apagar apenas a mídia das próprias mensagens.
// Ao apagar a mídia:
//   - O arquivo é removido do storage (best effort)
//   - Se a mensagem tinha apenas mídia (sem texto), ela é marcada
//     como is_deleted = true
//   - Se a mensagem tinha texto + mídia, o texto é preservado e
//     apenas os campos de mídia são limpos
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { removeMessageMedia } from "@/lib/media-expiration";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    // Busca a mensagem e verifica se pertence ao usuário
    const admin = createAdminClient();
    const { data: message, error: msgError } = await admin
      .from("messages")
      .select("id, sender_id, content, media_url, media_type, is_deleted")
      .eq("id", id)
      .maybeSingle();

    if (msgError || !message) {
      return NextResponse.json({ error: "Mensagem não encontrada" }, { status: 404 });
    }

    if (message.sender_id !== user.id) {
      return NextResponse.json({ error: "Sem permissão para apagar esta mídia" }, { status: 403 });
    }

    if (message.is_deleted) {
      return NextResponse.json({ error: "Mensagem já foi apagada" }, { status: 400 });
    }

    if (!message.media_url) {
      return NextResponse.json({ error: "Esta mensagem não possui mídia" }, { status: 400 });
    }

    // Remove o arquivo do storage (best effort)
    removeMessageMedia(message.media_url).catch(() => {});

    // Se a mensagem tinha apenas mídia (sem texto), marca como deletada
    if (!message.content || !message.content.trim()) {
      await admin
        .from("messages")
        .update({ is_deleted: true })
        .eq("id", id);
    } else {
      // Se tinha texto + mídia, preserva o texto e limpa a mídia
      await admin
        .from("messages")
        .update({ media_url: null, media_type: null, expires_at: null })
        .eq("id", id);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
