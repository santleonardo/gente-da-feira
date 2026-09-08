// ============================================================
// UX-024: Validação centralizada de alvos de denúncia.
//
// Cada tipo de conteúdo (post, comment, dm_message, room_message,
// profile) vive em uma tabela diferente — este módulo é a ÚNICA
// fonte de verdade para: (1) confirmar que o alvo existe, (2)
// obter o dono do conteúdo (para a checagem anti-autodenúncia),
// e (3) confirmar que o denunciante tem acesso legítimo ao
// recurso (ex.: só pode denunciar mensagens de DMs/salas das
// quais participa).
//
// Toda rota de denúncia DEVE usar `resolveReportTarget()` antes
// de inserir a linha em `reports` — nunca confiar apenas no que
// o cliente envia.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReportTargetType } from "@/lib/report-constants";

export interface ReportTargetResolution {
  /** true se o alvo existe e o denunciante pode acessá-lo */
  allowed: boolean;
  /** Motivo do bloqueio, quando allowed = false (não exposto ao cliente em detalhe) */
  reason?: string;
  /** ID do dono do conteúdo/perfil — usado para a checagem anti-autodenúncia */
  ownerId?: string | null;
}

/**
 * Resolve e valida um alvo de denúncia, dado seu tipo e ID.
 *
 * Usa o client autenticado do usuário (não admin) sempre que possível,
 * para que o RLS das tabelas de origem seja respeitado como
 * defense-in-depth — se o usuário não pode nem ENXERGAR o recurso
 * (ex.: mensagem de sala da qual não é membro), a query já retorna
 * vazio e a denúncia é rejeitada.
 */
export async function resolveReportTarget(
  supabase: SupabaseClient,
  reporterId: string,
  targetType: ReportTargetType,
  targetId: string
): Promise<ReportTargetResolution> {
  switch (targetType) {
    case "post": {
      const { data } = await supabase
        .from("posts")
        .select("id, author_id")
        .eq("id", targetId)
        .eq("is_deleted", false)
        .maybeSingle();
      if (!data) return { allowed: false, reason: "post_not_found" };
      return { allowed: true, ownerId: data.author_id };
    }

    case "comment": {
      const { data } = await supabase
        .from("comments")
        .select("id, author_id")
        .eq("id", targetId)
        .eq("is_deleted", false)
        .maybeSingle();
      if (!data) return { allowed: false, reason: "comment_not_found" };
      return { allowed: true, ownerId: data.author_id };
    }

    case "dm_message": {
      const { data: message } = await supabase
        .from("messages")
        .select("id, sender_id, dm_id, target_type, is_deleted")
        .eq("id", targetId)
        .eq("target_type", "dm")
        .maybeSingle();
      if (!message || message.is_deleted) {
        return { allowed: false, reason: "message_not_found" };
      }

      // Confirma que o denunciante é participante desta conversa
      // (o RLS de `messages` já deveria impedir a leitura, mas
      // validamos explicitamente para uma mensagem de erro clara).
      const { data: chat } = await supabase
        .from("direct_chats")
        .select("id, initiator_id, receiver_id")
        .eq("id", message.dm_id)
        .or(`initiator_id.eq.${reporterId},receiver_id.eq.${reporterId}`)
        .maybeSingle();
      if (!chat) return { allowed: false, reason: "not_participant" };

      return { allowed: true, ownerId: message.sender_id };
    }

    case "room_message": {
      const { data: message } = await supabase
        .from("messages")
        .select("id, sender_id, room_id, target_type, is_deleted")
        .eq("id", targetId)
        .eq("target_type", "room")
        .maybeSingle();
      if (!message || message.is_deleted) {
        return { allowed: false, reason: "message_not_found" };
      }

      // Confirma que o denunciante é membro ativo (não banido) da sala.
      const { data: member } = await supabase
        .from("room_members")
        .select("user_id, is_banned, banned_until")
        .eq("room_id", message.room_id)
        .eq("user_id", reporterId)
        .maybeSingle();

      let isBanned = member?.is_banned === true;
      if (isBanned && member?.banned_until) {
        if (new Date(member.banned_until) < new Date()) isBanned = false;
      }
      if (!member || isBanned) {
        return { allowed: false, reason: "not_member" };
      }

      return { allowed: true, ownerId: message.sender_id };
    }

    case "profile": {
      const { data } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", targetId)
        .maybeSingle();
      if (!data) return { allowed: false, reason: "profile_not_found" };
      return { allowed: true, ownerId: data.id };
    }

    default:
      return { allowed: false, reason: "invalid_target_type" };
  }
}

/**
 * Verifica se o usuário autenticado tem o papel de moderador
 * (profiles.is_moderator = true). Usado para proteger todas as
 * rotas /api/admin/reports/*.
 */
export async function isModerator(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("profiles")
    .select("is_moderator")
    .eq("id", userId)
    .maybeSingle();
  return data?.is_moderator === true;
}
